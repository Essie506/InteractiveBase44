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

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId, hasBusinessCalendarPermission, hasBusinessCalendarCreatePermission, resolveEmailsToIdentities, isBlocked } from './shared';
import { isEventListable, normalisePricing } from './eventProjectionEligibility';
import { buildEventPublicProjection, EventHostInfo } from './calendarEventProjection';
import { fetchProfessionalPublicGeo, fetchBusinessPublicGeo } from './geo';
import { CAPACITY_CONSUMING_STATES, sumAttendeeQuantity } from './eventCapacity';
import { emitNotification } from './notifications/dispatcher';
import { buildCalendarEmailPayload, CalendarEmailContext, CalendarEventType } from './notifications/email/payloads/calendar';
import { diffEventChanges, computeUpdateVersion, computeRemovalVersion } from './calendarEventDiff';
import { appendScheduleHistory } from './calendarEventHistory';
import { syncParticipationRecords, revokeParticipationRecords } from './calendarParticipation';
import { hasOverlappingEvent, touchScheduleLock, shouldEnforceConflictCheck } from './calendarAvailability';

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
export function idempotencyDocId(
  ownerType: string,
  ownerId: string,
  sourceSystem: string,
  sourceId: string,
): string {
  return [ownerType || 'identity', ownerId || '', sourceSystem || 'manual', sourceId || '']
    .map((s) => String(s).replace(/\//g, '_'))
    .join('__');
}

// ── Host resolution ──────────────────────────────────────────
// Resolves the public profile projection for the host. For an
// identity-owned professional event (owner_type 'identity' +
// operating_context 'professional') the host is the professional profile
// (looked up by identity_id). For a business event, the business profile.
async function resolveHost(
  ownerType: string,
  ownerId: string,
  operatingContext?: string,
): Promise<EventHostInfo | null> {
  if (ownerType === 'identity' && operatingContext === 'professional') {
    const snap = await db.collection('professionalProfilesPublic')
      .where('identity_id', '==', ownerId)
      .limit(1)
      .get();
    if (snap.empty) return null;
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
    const snap = await db.collection('businessProfilesPublic').doc(ownerId).get();
    if (!snap.exists) return null;
    const d = snap.data()!;
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
async function countReservedAttendees(eventId: string): Promise<number> {
  const snap = await db.collection('bookings')
    .where('event_id', '==', eventId)
    .where('booking_status', 'in', CAPACITY_CONSUMING_STATES)
    .get();
  return sumAttendeeQuantity(snap.docs);
}

// ── Location label resolution ───────────────────────────────
async function resolveLocationLabel(locationId: string | null | undefined): Promise<string | null> {
  if (!locationId) return null;
  try {
    const snap = await db.collection('locations').doc(locationId).get();
    if (!snap.exists) return null;
    return snap.data()!.public_label || snap.data()!.city || snap.data()!.label || null;
  } catch {
    return null;
  }
}

// ── Normalise assignment/invitation lists ────────────────────
function dedupeStrings(arr: string[] | null | undefined): string[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    if (!v) continue;
    const s = String(v);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

// ── Trust restriction helper (§87) ──────────────────────────
// Filters out identities that are blocked (either direction) relative to
// the caller. Calendar consumes the authoritative BlockRecord to enforce
// Trust & Safety restrictions on shared Event participation; it does not
// create the block state. A blocked identity is silently omitted from the
// invite list rather than rejecting the whole event.
async function filterBlockedIdentities(callerId: string, ids: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of ids) {
    if (await isBlocked(callerId, id)) continue;
    out.push(id);
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

function formatWhen(data: any, timezone: string): { dateLabel: string; timeLabel: string } {
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

async function emitCalendarNotification(
  eventId: string,
  eventType: CalendarEventType,
  sourceId: string,
  version: string,
  title: string,
  body: string,
  recipientId: string | null,
  recipientEmail: string | null,
  emailCtx: CalendarEmailContext,
): Promise<void> {
  await emitNotification({
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
    emailPayloadBuilder: buildCalendarEmailPayload,
  });
}

// Create path — invite all recipients (identities + guests).
async function dispatchCreateNotifications(
  eventId: string,
  data: Record<string, any>,
): Promise<void> {
  const host = await resolveHost(data.owner_type, data.owner_id, data.operating_context);
  const hostName = host?.display_name || null;
  const locationLabel = await resolveLocationLabel(data.location_id);
  const { dateLabel, timeLabel } = formatWhen(data, data.timezone);
  const tz = data.timezone || 'UTC';
  const eventLink = `/calendar?event=${eventId}`;
  const baseCtx = (eventType: CalendarEventType): CalendarEmailContext => ({
    eventTitle: data.title, hostDisplayName: hostName, dateLabel, timeLabel,
    timezone: tz, safeLocationLabel: locationLabel, eventLink, eventType,
  });
  const whenLine = `${dateLabel}, ${timeLabel} (${tz})${locationLabel ? ' • ' + locationLabel : ''}`;
  for (const rid of dedupeStrings(data.invited_identity_ids)) {
    await emitCalendarNotification(eventId, 'calendar_event_invited',
      `cal_invite:${eventId}:${rid}`, '1',
      `${hostName || 'Someone'} invited you to "${data.title}"`,
      whenLine, rid, null, baseCtx('calendar_event_invited'));
  }
  for (const gemail of dedupeStrings(data.invited_guest_emails)) {
    await emitCalendarNotification(eventId, 'calendar_event_invited',
      `cal_invite:${eventId}:guest:${gemail}`, '1',
      `${hostName || 'Someone'} invited you to "${data.title}"`,
      whenLine, null, gemail, baseCtx('calendar_event_invited'));
  }
}

// Update path — diff-based. Booking-owned events are suppressed (Booking
// owns cancellation; avoid duplicate/competing signals). No-op saves
// emit nothing. Reschedule takes precedence over material update.
async function dispatchUpdateNotifications(
  eventId: string,
  existing: Record<string, any>,
  updatePayload: Record<string, any>,
  mergedData: Record<string, any>,
  nowIso: string,
): Promise<void> {
  if (existing.source_system === 'booking') return;

  const diff = diffEventChanges(existing, updatePayload);
  if (diff.isNoOp) return;

  const host = await resolveHost(mergedData.owner_type, mergedData.owner_id, mergedData.operating_context);
  const hostName = host?.display_name || null;
  const locationLabel = await resolveLocationLabel(mergedData.location_id);
  const { dateLabel, timeLabel } = formatWhen(mergedData, mergedData.timezone);
  const tz = mergedData.timezone || 'UTC';
  const eventLink = `/calendar?event=${eventId}`;
  const baseCtx = (eventType: CalendarEventType): CalendarEmailContext => ({
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
      await emitCalendarNotification(eventId, 'calendar_event_cancelled',
        `cal_cancel:${eventId}:${rid}`, '1',
        `"${mergedData.title}" has been cancelled`,
        `${hostName || 'Someone'} cancelled the event scheduled for ${dateLabel}, ${timeLabel}.`,
        rid, null, baseCtx('calendar_event_cancelled'));
    }
    return;
  }

  // Added invitees → invited
  for (const rid of diff.addedInvitees) {
    await emitCalendarNotification(eventId, 'calendar_event_invited',
      `cal_invite:${eventId}:${rid}`, '1',
      `${hostName || 'Someone'} invited you to "${mergedData.title}"`,
      whenLine, rid, null, baseCtx('calendar_event_invited'));
  }
  const oldGuests = dedupeStrings(existing.invited_guest_emails);
  for (const gemail of dedupeStrings(mergedData.invited_guest_emails).filter((g) => !oldGuests.includes(g))) {
    await emitCalendarNotification(eventId, 'calendar_event_invited',
      `cal_invite:${eventId}:guest:${gemail}`, '1',
      `${hostName || 'Someone'} invited you to "${mergedData.title}"`,
      whenLine, null, gemail, baseCtx('calendar_event_invited'));
  }

  // Removed invitees → invitation_removed
  for (const rid of diff.removedInvitees) {
    await emitCalendarNotification(eventId, 'calendar_invitation_removed',
      `cal_remove:${eventId}:${rid}`, computeRemovalVersion(eventId, rid, nowIso),
      `You were removed from "${mergedData.title}"`,
      `${hostName || 'Someone'} removed you from this event.`,
      rid, null, baseCtx('calendar_invitation_removed'));
  }

  // Remaining invitees → reschedule OR material update (reschedule wins).
  const oldInvited = dedupeStrings(existing.invited_identity_ids);
  const remaining = dedupeStrings(mergedData.invited_identity_ids).filter((id) => oldInvited.includes(id));
  if (diff.isReschedule) {
    const version = computeUpdateVersion(existing, updatePayload);
    for (const rid of remaining) {
      await emitCalendarNotification(eventId, 'calendar_event_rescheduled',
        `cal_reschedule:${eventId}:${rid}`, version,
        `"${mergedData.title}" has been rescheduled`,
        `New time: ${dateLabel}, ${timeLabel} (${tz}).`,
        rid, null, baseCtx('calendar_event_rescheduled'));
    }
  } else if (diff.isMaterialUpdate) {
    const version = computeUpdateVersion(existing, updatePayload);
    for (const rid of remaining) {
      await emitCalendarNotification(eventId, 'calendar_event_updated',
        `cal_update:${eventId}:${rid}`, version,
        `"${mergedData.title}" has been updated`,
        `${hostName || 'Someone'} updated this event. ${whenLine}.`,
        rid, null, baseCtx('calendar_event_updated'));
    }
  }
}

// ── Schedule-change history (§48, §104, §105) ───────────────
// Records the schedule-change timeline on the event. Uses the same diff
// as notification dispatch so history and notifications classify changes
// consistently. Append-only — never rewrites past entries. Does NOT
// duplicate source-system audit history (Booking keeps its own
// reschedule_history on the booking); this is Calendar's own timeline.
async function recordScheduleHistoryFromDiff(
  eventId: string,
  existing: Record<string, any>,
  mergedData: Record<string, any>,
  updatePayload: Record<string, any>,
  actorId: string,
  nowIso: string,
): Promise<void> {
  const diff = diffEventChanges(existing, updatePayload);
  if (diff.isNoOp) return;
  const sourceSystem = mergedData.source_system || existing.source_system || 'manual';
  const prevStart = existing.start_time || null;
  const prevEnd = existing.end_time || null;
  const newStart = mergedData.start_time || null;
  const newEnd = mergedData.end_time || null;
  if (diff.isCancellation) {
    await appendScheduleHistory({ event_id: eventId, change_type: 'cancelled', previous_start_time: prevStart, previous_end_time: prevEnd, new_start_time: newStart, new_end_time: newEnd, changed_at: nowIso, actor_id: actorId, source_system: sourceSystem });
    return;
  }
  if (diff.isReschedule) {
    await appendScheduleHistory({ event_id: eventId, change_type: 'rescheduled', previous_start_time: prevStart, previous_end_time: prevEnd, new_start_time: newStart, new_end_time: newEnd, changed_at: nowIso, actor_id: actorId, source_system: sourceSystem });
  }
  if (diff.addedInvitees.length) {
    await appendScheduleHistory({ event_id: eventId, change_type: 'participant_added', previous_start_time: prevStart, previous_end_time: prevEnd, new_start_time: newStart, new_end_time: newEnd, changed_at: nowIso, actor_id: actorId, source_system: sourceSystem });
  }
  if (diff.removedInvitees.length) {
    await appendScheduleHistory({ event_id: eventId, change_type: 'participant_removed', previous_start_time: prevStart, previous_end_time: prevEnd, new_start_time: newStart, new_end_time: newEnd, changed_at: nowIso, actor_id: actorId, source_system: sourceSystem });
  }
}

// ── saveCalendarEvent ───────────────────────────────────────
export const saveCalendarEvent = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await getIdentityId(request.auth.uid);
    const data = request.data || {};
    const eventId = data.id || data.event_id || null;
    const nowIso = new Date().toISOString();

    // ════════════════════════════════════════════════════════════
    // UPDATE PATH (existing event — includes Cancel)
    // ════════════════════════════════════════════════════════════
    if (eventId) {
      const existingSnap = await db.collection(EVENTS).doc(eventId).get();
      if (!existingSnap.exists) {
        throw new HttpsError('not-found', 'Calendar event not found');
      }
      const existing = existingSnap.data()!;

      // ── Ownership / permission checks (against stored record) ──
      const isCreator = existing.created_by_id === callerIdentityId;
      const isIdentityOwner =
        existing.owner_type === 'identity' && existing.owner_id === callerIdentityId;
      let isBizCalendarManager = false;
      if (existing.owner_type === 'business' && existing.business_id) {
        isBizCalendarManager = await hasBusinessCalendarPermission(existing.business_id, callerIdentityId);
      }
      if (!isCreator && !isIdentityOwner && !isBizCalendarManager) {
        throw new HttpsError('permission-denied', 'Not authorised to update this event');
      }

      // ── Booking-authority guard ──
      if (existing.source_system === 'booking' && 'lifecycle_state' in data) {
        throw new HttpsError(
          'failed-precondition',
          'Booking-owned events must be cancelled through the Booking cancellation flow',
        );
      }

      // ── Partial update — only mutable fields the client provided ──
      const updatePayload: Record<string, any> = {};
      for (const k of Object.keys(data)) {
        if (IMMUTABLE_FIELDS.has(k)) continue;
        updatePayload[k] = data[k];
      }
      if ('price_pence' in updatePayload || 'is_free' in updatePayload) {
        const pricing = normalisePricing(updatePayload.price_pence, updatePayload.is_free);
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
        const { resolved, unresolved } = await resolveEmailsToIdentities(data.invited_emails);
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
      // ── Trust restriction (§87): exclude blocked identities from invitations ──
      if ('invited_identity_ids' in updatePayload) {
        updatePayload.invited_identity_ids = await filterBlockedIdentities(callerIdentityId, updatePayload.invited_identity_ids);
      }
      updatePayload._updated_date = nowIso;

      // ── §39: Conflict validation for manual Professional/Business reschedules ──
      // Only applies when the time changes AND the event is manual + professional/business
      // context. Source-owned events use their owning system's scheduling contract (§45).
      // Personal events are permitted to overlap (§29). The event being edited is
      // excluded from conflict detection against itself.
      const enforceConflict = shouldEnforceConflictCheck(
        existing.source_system || 'manual',
        existing.operating_context,
        existing.owner_type,
      );
      const startChanged = !!updatePayload.start_time &&
        new Date(updatePayload.start_time).getTime() !== new Date(existing.start_time).getTime();
      const endChanged = !!updatePayload.end_time &&
        new Date(updatePayload.end_time).getTime() !== new Date(existing.end_time).getTime();
      const timeChanging = startChanged || endChanged;

      if (enforceConflict && timeChanging) {
        const newStart = updatePayload.start_time || existing.start_time;
        const newEnd = updatePayload.end_time || existing.end_time;
        await db.runTransaction(async (tx) => {
          if (await hasOverlappingEvent(tx, existing.owner_id, newStart, newEnd, eventId)) {
            throw new HttpsError('failed-precondition', 'Time slot conflicts with an existing event');
          }
          await touchScheduleLock(tx, existing.owner_id, nowIso);
          tx.set(db.collection(EVENTS).doc(eventId), updatePayload, { merge: true });
        });
      } else {
        // Non-conflict-checked path — preserve existing direct-write behaviour.
        await db.collection(EVENTS).doc(eventId).set(updatePayload, { merge: true });
      }

      const mergedData = { ...existing, ...updatePayload };
      await maintainProjection(eventId, mergedData);
      await dispatchUpdateNotifications(eventId, existing, updatePayload, mergedData, nowIso);

      // ── Sync participation records for added/removed invitees (Phase 3) ──
      // Added invitees get 'pending' records (idempotent — does not overwrite
      // existing accepted/declined). Removed invitees get 'revoked' records.
      // Participation state is SEPARATE from the event's lifecycle_state.
      const partDiff = diffEventChanges(existing, updatePayload);
      if (partDiff.addedInvitees.length > 0) {
        await syncParticipationRecords(eventId, partDiff.addedInvitees, nowIso);
      }
      if (partDiff.removedInvitees.length > 0) {
        await revokeParticipationRecords(eventId, partDiff.removedInvitees, callerIdentityId, nowIso);
      }

      await recordScheduleHistoryFromDiff(eventId, existing, mergedData, updatePayload, callerIdentityId, nowIso);
      return { id: eventId, ...mergedData };
    }

    // ════════════════════════════════════════════════════════════
    // CREATE PATH (new event)
    // ════════════════════════════════════════════════════════════
    const ownerType = data.owner_type === 'business' ? 'business' : 'identity';
    let ownerId: string;
    let businessId: string | null = null;
    if (ownerType === 'business') {
      businessId = data.business_id || null;
      if (!businessId) {
        throw new HttpsError('invalid-argument', 'business_id is required for business events');
      }
      const canCreate = await hasBusinessCalendarCreatePermission(businessId, callerIdentityId);
      if (!canCreate) {
        throw new HttpsError('permission-denied', 'Not authorised to create business calendar events');
      }
      ownerId = businessId;
    } else {
      // Identity-owned event — owner is the creator's stable identity.
      ownerId = callerIdentityId;
    }

    // ── Enforce price/free invariant ──
    const pricing = normalisePricing(data.price_pence, data.is_free);

    // ── Assignment / invitation lists ──
    const assignedIdentityIds = dedupeStrings(data.assigned_identity_ids);
    let invitedIdentityIds = dedupeStrings(data.invited_identity_ids);
    let invitedGuestEmails: string[] = [];
    if (Array.isArray(data.invited_emails) && data.invited_emails.length) {
      const { resolved, unresolved } = await resolveEmailsToIdentities(data.invited_emails);
      invitedIdentityIds = dedupeStrings([...invitedIdentityIds, ...Object.values(resolved)]);
      invitedGuestEmails = dedupeStrings(unresolved);
    }
    // Never invite/assign the owner or creator to their own event.
    invitedIdentityIds = invitedIdentityIds.filter(
      (id) => id !== ownerId && id !== callerIdentityId,
    );
    assignedIdentityIds.filter((id) => id !== callerIdentityId);

    // ── Trust restriction (§87): exclude blocked identities from invitations ──
    invitedIdentityIds = await filterBlockedIdentities(callerIdentityId, invitedIdentityIds);

    const sourceSystem = data.source_system || 'manual';
    const sourceId = data.source_id || null;
    if (!sourceId) {
      throw new HttpsError(
        'invalid-argument',
        'source_id is required to create an event (idempotency key)',
      );
    }

    const eventData: Record<string, any> = {
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
      invited_emails: undefined as any,
    };
    delete eventData.invited_emails;

    const idempKey = idempotencyDocId(ownerType, ownerId, sourceSystem, sourceId);
    const idempRef = db.collection(IDEMPOTENCY).doc(idempKey);

    let existingEventId: string | null = null;
    let eventDocId = '';
    await db.runTransaction(async (tx) => {
      const idempSnap = await tx.get(idempRef);
      if (idempSnap.exists && idempSnap.data()?.event_id) {
        existingEventId = idempSnap.data()!.event_id as string;
        return;
      }
      // ── §39: Authoritative conflict validation for manual Professional/Business events ──
      // Personal events (identity-owned, personal context) are permitted to overlap (§29).
      // Source-owned events use their owning system's scheduling contract (§45, §49) and
      // are NOT routed through this generic manual-event conflict policy.
      if (shouldEnforceConflictCheck(sourceSystem, data.operating_context, ownerType)) {
        if (await hasOverlappingEvent(tx, ownerId, eventData.start_time, eventData.end_time)) {
          throw new HttpsError('failed-precondition', 'Time slot conflicts with an existing event');
        }
        // Touch the schedule sentinel so concurrent manual creations for the same
        // owner serialize — Firestore retries one transaction, and on retry the
        // conflict check sees the other's newly committed event (§120 concurrency).
        await touchScheduleLock(tx, ownerId, nowIso);
      }
      const eventRef = db.collection(EVENTS).doc();
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

    // ── Create 'pending' participation records for all invitees (Phase 3) ──
    // Each invited identity gets a participation record with response_state
    // 'pending'. The invitee sees the event in their Calendar but must
    // explicitly Accept/Decline — they do NOT silently become an accepted
    // participant merely because the event is visible.
    await syncParticipationRecords(eventDocId, invitedIdentityIds, nowIso);

    await appendScheduleHistory({
      event_id: eventDocId,
      change_type: 'created',
      previous_start_time: null,
      previous_end_time: null,
      new_start_time: eventData.start_time || null,
      new_end_time: eventData.end_time || null,
      changed_at: nowIso,
      actor_id: callerIdentityId,
      source_system: eventData.source_system || 'manual',
    });

    return { id: eventDocId, ...eventData };
  },
);

// ── Projection maintenance ──────────────────────────────────
export async function maintainProjection(eventId: string, data: any): Promise<void> {
  const host = await resolveHost(data.owner_type, data.owner_id, data.operating_context);
  const listable = isEventListable(data, host || null);

  if (!listable) {
    await db.collection(PUBLIC).doc(eventId).delete().catch(() => {});
    return;
  }

  let locationGeo = null;
  if (data.owner_type === 'identity' && data.operating_context === 'professional') {
    locationGeo = await fetchProfessionalPublicGeo(db, null, data.location_id);
  } else if (data.owner_type === 'business') {
    locationGeo = await fetchBusinessPublicGeo(db, data.location_id);
  }
  const locationLabel = await resolveLocationLabel(data.location_id);
  const reservedCount = await countReservedAttendees(eventId);

  const projection = buildEventPublicProjection(
    eventId, data, host, locationGeo, locationLabel, reservedCount,
  );
  await db.collection(PUBLIC).doc(eventId).set(projection);
}

// ── deleteCalendarEvent (§52) ───────────────────────────────
// Destructive removal of a Calendar-owned object, distinct from Cancel
// (which preserves the historical relationship). Permitted ONLY for
// personal manual identity-owned events. History is preserved (§108) —
// calendarEventHistory is a separate collection and is not deleted.
export const deleteCalendarEvent = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await getIdentityId(request.auth.uid);
    const data = request.data || {};
    const eventId = data.event_id || data.id;
    if (!eventId) {
      throw new HttpsError('invalid-argument', 'event_id is required');
    }

    const existingSnap = await db.collection(EVENTS).doc(eventId).get();
    if (!existingSnap.exists) {
      throw new HttpsError('not-found', 'Calendar event not found');
    }
    const existing = existingSnap.data()!;

    // Authority: creator or identity owner only (delete is personal — no
    // business-manager path). Server-authoritative.
    const isCreator = existing.created_by_id === callerIdentityId;
    const isIdentityOwner =
      existing.owner_type === 'identity' && existing.owner_id === callerIdentityId;
    if (!isCreator && !isIdentityOwner) {
      throw new HttpsError('permission-denied', 'Not authorised to delete this event');
    }

    // Restriction: personal manual identity-owned events only. Source-owned
    // events (booking/workout/business_scheduling) and business events are
    // not destructively deletable through Calendar.
    if (existing.source_system && existing.source_system !== 'manual') {
      throw new HttpsError(
        'failed-precondition',
        'Only personal events can be deleted. Source-owned events must be removed through their owning system.',
      );
    }
    if (existing.owner_type !== 'identity') {
      throw new HttpsError('failed-precondition', 'Only identity-owned events can be deleted');
    }

    const nowIso = new Date().toISOString();

    // Revoke participation for all invitees so their visibility is removed.
    const invitedIds = dedupeStrings(existing.invited_identity_ids);
    if (invitedIds.length > 0) {
      await revokeParticipationRecords(eventId, invitedIds, callerIdentityId, nowIso);
    }

    // Append a 'deleted' history entry (history preserved — §108).
    await appendScheduleHistory({
      event_id: eventId,
      change_type: 'deleted',
      previous_start_time: existing.start_time || null,
      previous_end_time: existing.end_time || null,
      new_start_time: null,
      new_end_time: null,
      changed_at: nowIso,
      actor_id: callerIdentityId,
      source_system: existing.source_system || 'manual',
    });

    // Remove the public projection + idempotency record (best effort).
    await db.collection(PUBLIC).doc(eventId).delete().catch(() => {});
    const idempKey = idempotencyDocId(
      existing.owner_type,
      existing.owner_id,
      existing.source_system || 'manual',
      existing.source_id || '',
    );
    await db.collection(IDEMPOTENCY).doc(idempKey).delete().catch(() => {});

    // Destructive removal of the event document.
    await db.collection(EVENTS).doc(eventId).delete();
    return { id: eventId, deleted: true };
  },
);

// ── Refresh projection by event ID ──────────────────────────
export async function refreshEventProjection(eventId: string): Promise<void> {
  const ev = await db.collection(EVENTS).doc(eventId).get();
  if (!ev.exists) {
    await db.collection(PUBLIC).doc(eventId).delete().catch(() => {});
    return;
  }
  await maintainProjection(eventId, ev.data()!);
}