"use strict";
// Calendar Event — trusted server-side operations
// ───────────────────────────────────────────────────────────
// 1. saveCalendarEvent — authoritative write to calendarEvents
//    + maintains the calendarEventsPublic projection (public fields only).
//
// OWNERSHIP MODEL (corrected):
//   owner_type 'identity'  → an Interactive identity owns the event.
//     Personal and Professional are operating_context provenance, NOT
//     separate owners. The same identity-owned event appears in both
//     Personal and Professional Calendar views. owner_id = identity ID.
//   owner_type 'business'  → a Business organisation owns the event.
//     owner_id = businessId. The creator identity (created_by_id) is
//     preserved separately and retains edit rights.
//
// 'professional' is NOT an owner type.
//
// MUTATION PERMISSIONS:
//   identity event → owner_id == caller identity ID.
//   business event CREATE → any active business member
//     (hasBusinessCalendarCreatePermission). The creator is recorded in
//     immutable created_by_id and can subsequently manage their own event.
//   business event UPDATE/CANCEL → creator (created_by_id) OR business
//     member with manage_calendar permission (hasBusinessCalendarPermission).
//   assigned_identity_ids / invited_identity_ids / invited_guest_emails
//     grant VIEW/PARTICIPATION only — NEVER mutation authority.
//   Booking-owned events (source_system 'booking') cannot be cancelled
//     here — they go through the Booking cancellation flow.
//
// The public projection NEVER contains meeting_url, attendee identities,
// assignment/invitation lists, or private booking records. Availability
// is a derived value.
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveCalendarEvent = void 0;
exports.idempotencyDocId = idempotencyDocId;
exports.maintainProjection = maintainProjection;
exports.refreshEventProjection = refreshEventProjection;
const https_1 = require("firebase-functions/v2/https");
const shared_1 = require("./shared");
const eventProjectionEligibility_1 = require("./eventProjectionEligibility");
const calendarEventProjection_1 = require("./calendarEventProjection");
const geo_1 = require("./geo");
const eventCapacity_1 = require("./eventCapacity");
const dispatcher_1 = require("./notifications/dispatcher");
const calendar_1 = require("./notifications/email/payloads/calendar");
const calendarEventDiff_1 = require("./calendarEventDiff");
const EVENTS = 'calendarEvents';
const PUBLIC = 'calendarEventsPublic';
const IDEMPOTENCY = 'calendarEventIdempotency';
// Fields that are immutable after creation. A later authorised editor
// (e.g. a business calendar manager editing another creator's event)
// must NOT be able to overwrite ownership or the canonical creator.
const IMMUTABLE_FIELDS = new Set([
    'id', 'event_id',
    'created_by_id', 'owner_id', 'owner_type', 'business_id',
    'source_id', 'source_system',
    '_created_date',
]);
// ── Idempotency key ──────────────────────────────────────────
function idempotencyDocId(ownerType, ownerId, sourceSystem, sourceId) {
    return [ownerType || 'identity', ownerId || '', sourceSystem || 'manual', sourceId || '']
        .map((s) => String(s).replace(/\//g, '_'))
        .join('__');
}
// ── Host resolution ──────────────────────────────────────────
// Resolves the public profile projection for the host. For an
// identity-owned professional event (owner_type 'identity' +
// operating_context 'professional') the host is the professional profile
// (looked up by identity_id). For a business event, the business profile.
async function resolveHost(ownerType, ownerId, operatingContext) {
    if (ownerType === 'identity' && operatingContext === 'professional') {
        const snap = await shared_1.db.collection('professionalProfilesPublic')
            .where('identity_id', '==', ownerId)
            .limit(1)
            .get();
        if (snap.empty)
            return null;
        const d = snap.docs[0].data();
        return {
            type: 'professional',
            id: ownerId,
            display_name: d.display_name || null,
            screen_name: d.screen_name || null,
            business_id: null,
            avatar_url: d.avatar_url || null,
            verification_state: d.verification_state || 'not_verified',
        };
    }
    if (ownerType === 'business') {
        const snap = await shared_1.db.collection('businessProfilesPublic').doc(ownerId).get();
        if (!snap.exists)
            return null;
        const d = snap.data();
        return {
            type: 'business',
            id: ownerId,
            display_name: d.name || null,
            screen_name: null,
            business_id: ownerId,
            avatar_url: d.logo_url || null,
            verification_state: d.verification_state || 'not_verified',
        };
    }
    return null;
}
// ── Reserved attendee count for an event ───────────────────
async function countReservedAttendees(eventId) {
    const snap = await shared_1.db.collection('bookings')
        .where('event_id', '==', eventId)
        .where('booking_status', 'in', eventCapacity_1.CAPACITY_CONSUMING_STATES)
        .get();
    return (0, eventCapacity_1.sumAttendeeQuantity)(snap.docs);
}
// ── Location label resolution ───────────────────────────────
async function resolveLocationLabel(locationId) {
    if (!locationId)
        return null;
    try {
        const snap = await shared_1.db.collection('locations').doc(locationId).get();
        if (!snap.exists)
            return null;
        return snap.data().public_label || snap.data().city || snap.data().label || null;
    }
    catch {
        return null;
    }
}
// ── Normalise assignment/invitation lists ────────────────────
function dedupeStrings(arr) {
    if (!Array.isArray(arr))
        return [];
    const seen = new Set();
    const out = [];
    for (const v of arr) {
        if (!v)
            continue;
        const s = String(v);
        if (!seen.has(s)) {
            seen.add(s);
            out.push(s);
        }
    }
    return out;
}
// ── Notification dispatch helpers ────────────────────────────
// Calendar owns event/invitation state; the Notifications System owns
// delivery. saveCalendarEvent emits semantic events after the
// authoritative event write succeeds; the dispatcher creates the
// NotificationRecord (in-app) and the email outbox delivery. Calendar
// never imports a concrete email provider — it passes a safe
// CalendarEmailContext to the dispatcher's provider-neutral builder.
function formatWhen(data, timezone) {
    const tz = timezone || 'UTC';
    const start = new Date(data.start_time);
    const end = data.end_time ? new Date(data.end_time) : null;
    const dateLabel = start.toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: tz,
    });
    const timeLabel = data.all_day
        ? 'All day'
        : `${start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz })}${end ? ' – ' + end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }) : ''}`;
    return { dateLabel, timeLabel };
}
async function emitCalendarNotification(eventId, eventType, sourceId, version, title, body, recipientId, recipientEmail, emailCtx) {
    await (0, dispatcher_1.emitNotification)({
        source_system: 'calendar',
        event_type: eventType,
        source_id: sourceId,
        version,
        category: 'calendar',
        title,
        body,
        action_url: `/calendar?event=${eventId}`,
        action_label: 'View Event',
        recipient_id: recipientId,
        recipient_email: recipientEmail,
        emailContext: emailCtx,
        emailPayloadBuilder: calendar_1.buildCalendarEmailPayload,
    });
}
// Create path — invite all recipients (identities + guests).
async function dispatchCreateNotifications(eventId, data) {
    const host = await resolveHost(data.owner_type, data.owner_id, data.operating_context);
    const hostName = host?.display_name || null;
    const locationLabel = await resolveLocationLabel(data.location_id);
    const { dateLabel, timeLabel } = formatWhen(data, data.timezone);
    const tz = data.timezone || 'UTC';
    const eventLink = `/calendar?event=${eventId}`;
    const baseCtx = (eventType) => ({
        eventTitle: data.title, hostDisplayName: hostName, dateLabel, timeLabel,
        timezone: tz, safeLocationLabel: locationLabel, eventLink, eventType,
    });
    const whenLine = `${dateLabel}, ${timeLabel} (${tz})${locationLabel ? ' • ' + locationLabel : ''}`;
    for (const rid of dedupeStrings(data.invited_identity_ids)) {
        await emitCalendarNotification(eventId, 'calendar_event_invited', `cal_invite:${eventId}:${rid}`, '1', `${hostName || 'Someone'} invited you to "${data.title}"`, whenLine, rid, null, baseCtx('calendar_event_invited'));
    }
    for (const gemail of dedupeStrings(data.invited_guest_emails)) {
        await emitCalendarNotification(eventId, 'calendar_event_invited', `cal_invite:${eventId}:guest:${gemail}`, '1', `${hostName || 'Someone'} invited you to "${data.title}"`, whenLine, null, gemail, baseCtx('calendar_event_invited'));
    }
}
// Update path — diff-based. Booking-owned events are suppressed (Booking
// owns cancellation; avoid duplicate/competing signals). No-op saves
// emit nothing. Reschedule takes precedence over material update.
async function dispatchUpdateNotifications(eventId, existing, updatePayload, mergedData, nowIso) {
    if (existing.source_system === 'booking')
        return;
    const diff = (0, calendarEventDiff_1.diffEventChanges)(existing, updatePayload);
    if (diff.isNoOp)
        return;
    const host = await resolveHost(mergedData.owner_type, mergedData.owner_id, mergedData.operating_context);
    const hostName = host?.display_name || null;
    const locationLabel = await resolveLocationLabel(mergedData.location_id);
    const { dateLabel, timeLabel } = formatWhen(mergedData, mergedData.timezone);
    const tz = mergedData.timezone || 'UTC';
    const eventLink = `/calendar?event=${eventId}`;
    const baseCtx = (eventType) => ({
        eventTitle: mergedData.title, hostDisplayName: hostName, dateLabel, timeLabel,
        timezone: tz, safeLocationLabel: locationLabel, eventLink, eventType,
    });
    const whenLine = `${dateLabel}, ${timeLabel} (${tz})${locationLabel ? ' • ' + locationLabel : ''}`;
    if (diff.isCancellation) {
        const recipients = dedupeStrings([
            ...dedupeStrings(mergedData.invited_identity_ids),
            ...dedupeStrings(existing.assigned_identity_ids),
        ].filter((id) => id !== existing.owner_id && id !== existing.created_by_id));
        for (const rid of recipients) {
            await emitCalendarNotification(eventId, 'calendar_event_cancelled', `cal_cancel:${eventId}:${rid}`, '1', `"${mergedData.title}" has been cancelled`, `${hostName || 'Someone'} cancelled the event scheduled for ${dateLabel}, ${timeLabel}.`, rid, null, baseCtx('calendar_event_cancelled'));
        }
        return;
    }
    // Added invitees → invited
    for (const rid of diff.addedInvitees) {
        await emitCalendarNotification(eventId, 'calendar_event_invited', `cal_invite:${eventId}:${rid}`, '1', `${hostName || 'Someone'} invited you to "${mergedData.title}"`, whenLine, rid, null, baseCtx('calendar_event_invited'));
    }
    const oldGuests = dedupeStrings(existing.invited_guest_emails);
    for (const gemail of dedupeStrings(mergedData.invited_guest_emails).filter((g) => !oldGuests.includes(g))) {
        await emitCalendarNotification(eventId, 'calendar_event_invited', `cal_invite:${eventId}:guest:${gemail}`, '1', `${hostName || 'Someone'} invited you to "${mergedData.title}"`, whenLine, null, gemail, baseCtx('calendar_event_invited'));
    }
    // Removed invitees → invitation_removed
    for (const rid of diff.removedInvitees) {
        await emitCalendarNotification(eventId, 'calendar_invitation_removed', `cal_remove:${eventId}:${rid}`, (0, calendarEventDiff_1.computeRemovalVersion)(eventId, rid, nowIso), `You were removed from "${mergedData.title}"`, `${hostName || 'Someone'} removed you from this event.`, rid, null, baseCtx('calendar_invitation_removed'));
    }
    // Remaining invitees → reschedule OR material update (reschedule wins).
    const oldInvited = dedupeStrings(existing.invited_identity_ids);
    const remaining = dedupeStrings(mergedData.invited_identity_ids).filter((id) => oldInvited.includes(id));
    if (diff.isReschedule) {
        const version = (0, calendarEventDiff_1.computeUpdateVersion)(existing, updatePayload);
        for (const rid of remaining) {
            await emitCalendarNotification(eventId, 'calendar_event_rescheduled', `cal_reschedule:${eventId}:${rid}`, version, `"${mergedData.title}" has been rescheduled`, `New time: ${dateLabel}, ${timeLabel} (${tz}).`, rid, null, baseCtx('calendar_event_rescheduled'));
        }
    }
    else if (diff.isMaterialUpdate) {
        const version = (0, calendarEventDiff_1.computeUpdateVersion)(existing, updatePayload);
        for (const rid of remaining) {
            await emitCalendarNotification(eventId, 'calendar_event_updated', `cal_update:${eventId}:${rid}`, version, `"${mergedData.title}" has been updated`, `${hostName || 'Someone'} updated this event. ${whenLine}.`, rid, null, baseCtx('calendar_event_updated'));
        }
    }
}
// ── saveCalendarEvent ───────────────────────────────────────
exports.saveCalendarEvent = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await (0, shared_1.getIdentityId)(request.auth.uid);
    const data = request.data || {};
    const eventId = data.id || data.event_id || null;
    const nowIso = new Date().toISOString();
    // ════════════════════════════════════════════════════════════
    // UPDATE PATH (existing event — includes Cancel)
    // ════════════════════════════════════════════════════════════
    if (eventId) {
        const existingSnap = await shared_1.db.collection(EVENTS).doc(eventId).get();
        if (!existingSnap.exists) {
            throw new https_1.HttpsError('not-found', 'Calendar event not found');
        }
        const existing = existingSnap.data();
        // ── Ownership / permission checks (against stored record) ──
        const isCreator = existing.created_by_id === callerIdentityId;
        const isIdentityOwner = existing.owner_type === 'identity' && existing.owner_id === callerIdentityId;
        let isBizCalendarManager = false;
        if (existing.owner_type === 'business' && existing.business_id) {
            isBizCalendarManager = await (0, shared_1.hasBusinessCalendarPermission)(existing.business_id, callerIdentityId);
        }
        if (!isCreator && !isIdentityOwner && !isBizCalendarManager) {
            throw new https_1.HttpsError('permission-denied', 'Not authorised to update this event');
        }
        // ── Booking-authority guard ──
        if (existing.source_system === 'booking' && 'lifecycle_state' in data) {
            throw new https_1.HttpsError('failed-precondition', 'Booking-owned events must be cancelled through the Booking cancellation flow');
        }
        // ── Partial update — only mutable fields the client provided ──
        const updatePayload = {};
        for (const k of Object.keys(data)) {
            if (IMMUTABLE_FIELDS.has(k))
                continue;
            updatePayload[k] = data[k];
        }
        if ('price_pence' in updatePayload || 'is_free' in updatePayload) {
            const pricing = (0, eventProjectionEligibility_1.normalisePricing)(updatePayload.price_pence, updatePayload.is_free);
            updatePayload.price_pence = pricing.price_pence;
            updatePayload.is_free = pricing.is_free;
        }
        if ('currency' in updatePayload && !updatePayload.currency) {
            updatePayload.currency = 'GBP';
        }
        if ('assigned_identity_ids' in updatePayload) {
            updatePayload.assigned_identity_ids = dedupeStrings(updatePayload.assigned_identity_ids);
        }
        if ('invited_identity_ids' in updatePayload) {
            updatePayload.invited_identity_ids = dedupeStrings(updatePayload.invited_identity_ids);
        }
        // ── Email invitation resolution (merge into existing lists) ──
        if (Array.isArray(data.invited_emails) && data.invited_emails.length) {
            const { resolved, unresolved } = await (0, shared_1.resolveEmailsToIdentities)(data.invited_emails);
            const existingInvited = dedupeStrings(existing.invited_identity_ids);
            const existingGuests = dedupeStrings(existing.invited_guest_emails);
            const mergedInvited = dedupeStrings([
                ...existingInvited,
                ...Object.values(resolved),
            ].filter((id) => id !== existing.owner_id && id !== existing.created_by_id));
            const mergedGuests = dedupeStrings([...existingGuests, ...unresolved]);
            updatePayload.invited_identity_ids = mergedInvited;
            updatePayload.invited_guest_emails = mergedGuests;
        }
        updatePayload._updated_date = nowIso;
        // Preserve the authoritative record — merge, never replace/delete.
        await shared_1.db.collection(EVENTS).doc(eventId).set(updatePayload, { merge: true });
        const mergedData = { ...existing, ...updatePayload };
        await maintainProjection(eventId, mergedData);
        await dispatchUpdateNotifications(eventId, existing, updatePayload, mergedData, nowIso);
        return { id: eventId, ...mergedData };
    }
    // ════════════════════════════════════════════════════════════
    // CREATE PATH (new event)
    // ════════════════════════════════════════════════════════════
    const ownerType = data.owner_type === 'business' ? 'business' : 'identity';
    let ownerId;
    let businessId = null;
    if (ownerType === 'business') {
        businessId = data.business_id || null;
        if (!businessId) {
            throw new https_1.HttpsError('invalid-argument', 'business_id is required for business events');
        }
        const canCreate = await (0, shared_1.hasBusinessCalendarCreatePermission)(businessId, callerIdentityId);
        if (!canCreate) {
            throw new https_1.HttpsError('permission-denied', 'Not authorised to create business calendar events');
        }
        ownerId = businessId;
    }
    else {
        // Identity-owned event — owner is the creator's stable identity.
        ownerId = callerIdentityId;
    }
    // ── Enforce price/free invariant ──
    const pricing = (0, eventProjectionEligibility_1.normalisePricing)(data.price_pence, data.is_free);
    // ── Assignment / invitation lists ──
    const assignedIdentityIds = dedupeStrings(data.assigned_identity_ids);
    let invitedIdentityIds = dedupeStrings(data.invited_identity_ids);
    let invitedGuestEmails = [];
    if (Array.isArray(data.invited_emails) && data.invited_emails.length) {
        const { resolved, unresolved } = await (0, shared_1.resolveEmailsToIdentities)(data.invited_emails);
        invitedIdentityIds = dedupeStrings([...invitedIdentityIds, ...Object.values(resolved)]);
        invitedGuestEmails = dedupeStrings(unresolved);
    }
    // Never invite/assign the owner or creator to their own event.
    invitedIdentityIds = invitedIdentityIds.filter((id) => id !== ownerId && id !== callerIdentityId);
    assignedIdentityIds.filter((id) => id !== callerIdentityId);
    const sourceSystem = data.source_system || 'manual';
    const sourceId = data.source_id || null;
    if (!sourceId) {
        throw new https_1.HttpsError('invalid-argument', 'source_id is required to create an event (idempotency key)');
    }
    const eventData = {
        ...data,
        owner_type: ownerType,
        owner_id: ownerId,
        business_id: businessId,
        // created_by_id is set server-side to the caller and is immutable
        // thereafter — never trust a client-supplied creator.
        created_by_id: callerIdentityId,
        assigned_identity_ids: assignedIdentityIds,
        invited_identity_ids: invitedIdentityIds,
        invited_guest_emails: invitedGuestEmails,
        price_pence: pricing.price_pence,
        is_free: pricing.is_free,
        currency: data.currency || 'GBP',
        // Drop the client-only invited_emails envelope (not stored).
        invited_emails: undefined,
    };
    delete eventData.invited_emails;
    const idempKey = idempotencyDocId(ownerType, ownerId, sourceSystem, sourceId);
    const idempRef = shared_1.db.collection(IDEMPOTENCY).doc(idempKey);
    let existingEventId = null;
    let eventDocId = '';
    await shared_1.db.runTransaction(async (tx) => {
        const idempSnap = await tx.get(idempRef);
        if (idempSnap.exists && idempSnap.data()?.event_id) {
            existingEventId = idempSnap.data().event_id;
            return;
        }
        const eventRef = shared_1.db.collection(EVENTS).doc();
        eventDocId = eventRef.id;
        tx.set(eventRef, { ...eventData, _created_date: nowIso, _updated_date: nowIso });
        tx.set(idempRef, {
            event_id: eventRef.id,
            owner_type: ownerType,
            owner_id: ownerId,
            source_system: sourceSystem,
            source_id: sourceId,
            _created_date: nowIso,
            _updated_date: nowIso,
        });
    });
    if (existingEventId) {
        eventDocId = existingEventId;
    }
    await maintainProjection(eventDocId, eventData);
    await dispatchCreateNotifications(eventDocId, eventData);
    return { id: eventDocId, ...eventData };
});
// ── Projection maintenance ──────────────────────────────────
async function maintainProjection(eventId, data) {
    const host = await resolveHost(data.owner_type, data.owner_id, data.operating_context);
    const listable = (0, eventProjectionEligibility_1.isEventListable)(data, host || null);
    if (!listable) {
        await shared_1.db.collection(PUBLIC).doc(eventId).delete().catch(() => { });
        return;
    }
    let locationGeo = null;
    if (data.owner_type === 'identity' && data.operating_context === 'professional') {
        locationGeo = await (0, geo_1.fetchProfessionalPublicGeo)(shared_1.db, null, data.location_id);
    }
    else if (data.owner_type === 'business') {
        locationGeo = await (0, geo_1.fetchBusinessPublicGeo)(shared_1.db, data.location_id);
    }
    const locationLabel = await resolveLocationLabel(data.location_id);
    const reservedCount = await countReservedAttendees(eventId);
    const projection = (0, calendarEventProjection_1.buildEventPublicProjection)(eventId, data, host, locationGeo, locationLabel, reservedCount);
    await shared_1.db.collection(PUBLIC).doc(eventId).set(projection);
}
// ── Refresh projection by event ID ──────────────────────────
async function refreshEventProjection(eventId) {
    const ev = await shared_1.db.collection(EVENTS).doc(eventId).get();
    if (!ev.exists) {
        await shared_1.db.collection(PUBLIC).doc(eventId).delete().catch(() => { });
        return;
    }
    await maintainProjection(eventId, ev.data());
}
//# sourceMappingURL=calendarEvent.js.map