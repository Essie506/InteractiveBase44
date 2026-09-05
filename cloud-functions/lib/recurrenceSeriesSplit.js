"use strict";
// Recurrence series split — "this and future" (§57).
// ───────────────────────────────────────────────────────────
// Splits a recurring series at a given occurrence: the OLD series becomes
// historical (effective_until caps it before the split occurrence), and a
// NEW series is created for the split occurrence and all future occurrences.
//
// Historical recurrence integrity (§57):
//   - Past occurrences remain on the old series (effective_until caps them).
//   - Past exceptions (original_start_time < split) stay on the old series.
//   - Future exceptions (original_start_time >= split) migrate to the new
//     series, re-keyed with the new series ID. If the new series generates
//     occurrences at the same original start times, the exceptions apply
//     correctly; otherwise they are harmless orphans (no incorrect behaviour).
//   - The old series gets superseded_by_id → new series (audit link).
//
// Idempotency + retry safety (§57):
//   - The series split is idempotent via calendarEventIdempotency.
//   - Exception migration is ALWAYS run (not gated on first creation),
//     re-creating on the new series BEFORE deleting from the old, so a
//     partial failure preserves exceptions for retry. Deterministic doc
//     IDs prevent duplication.
//   - Schedule history is appended only on first creation (not idempotent).
//   - Projection maintenance is always run (idempotent).
//
// Source authority (§57):
//   Calendar-owned (source_system 'manual') recurring events can be split
//   directly through Calendar authority. Source-owned events (booking,
//   workout, business_scheduling, external, messaging) must not be changed
//   directly through Calendar/user action unless the owning source system
//   has authorised the scheduling change through its scheduling contract.
//   No source system currently authorises recurrence splitting, so all
//   non-manual source systems are rejected. This is NOT a permanent
//   blacklist — when a source system implements scheduling-contract
//   authorization, it can be added to SOURCE_SPLIT_AUTHORITY.
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitRecurrenceSeries = void 0;
const https_1 = require("firebase-functions/v2/https");
const shared_1 = require("./shared");
const calendarEvent_1 = require("./calendarEvent");
const calendarEventHistory_1 = require("./calendarEventHistory");
const calendarEventExceptions_1 = require("./calendarEventExceptions");
const EVENTS = 'calendarEvents';
const EXCEPTIONS = 'calendarEventExceptions';
const IDEMPOTENCY = 'calendarEventIdempotency';
// ── Source authority for recurrence series splitting ──────────
// Calendar-owned (manual) events have direct Calendar authority.
// Source-owned events require the owning source system to authorise
// the scheduling change through its scheduling contract. No source
// system currently authorises recurrence splitting. Add entries here
// when a source system implements scheduling-contract authorization.
const SOURCE_SPLIT_AUTHORITY = {
    manual: true, // Calendar-owned — direct authority
    // booking: false,           — bookings are non-recurring; splitting is never applicable
    // workout: false,           — Workout owns programme meaning (§58, §83)
    // business_scheduling: false — Business owns the schedule context
    // external: false,          — external calendar owns the source
    // messaging: false,         — messaging artifacts are not user-schedulable
};
// ── splitRecurrenceSeries ───────────────────────────────────
// Request: {
//   series_event_id, split_start_time,
//   new_start_time?, new_end_time?, new_recurrence_rule?,
//   new_title?, new_description?
// }
// Returns: { old_event_id, new_event_id, effective_until, created }
exports.splitRecurrenceSeries = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await (0, shared_1.getIdentityId)(request.auth.uid);
    const nowIso = new Date().toISOString();
    const { series_event_id, split_start_time, new_start_time, new_end_time, new_recurrence_rule, new_title, new_description, } = request.data || {};
    // ── Validate required fields ──
    if (!series_event_id || !split_start_time) {
        throw new https_1.HttpsError('invalid-argument', 'series_event_id and split_start_time are required');
    }
    // ── Load old series ──
    const oldDoc = await shared_1.db.collection(EVENTS).doc(series_event_id).get();
    if (!oldDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Series event not found');
    }
    const oldEvent = oldDoc.data();
    // ── Permission (same as occurrence exception) ──
    const isCreator = oldEvent.created_by_id === callerIdentityId;
    const isOwner = oldEvent.owner_type === 'identity' && oldEvent.owner_id === callerIdentityId;
    let isBizManager = false;
    if (oldEvent.owner_type === 'business' && oldEvent.business_id) {
        isBizManager = await (0, shared_1.hasBusinessCalendarPermission)(oldEvent.business_id, callerIdentityId);
    }
    if (!isCreator && !isOwner && !isBizManager) {
        throw new https_1.HttpsError('permission-denied', 'Not authorised to modify this series');
    }
    // ── Must be recurring ──
    if (!oldEvent.recurrence_rule) {
        throw new https_1.HttpsError('failed-precondition', 'Event is not recurring');
    }
    // ── Source authority (§57) ──
    // Calendar-owned (manual) events can be split directly. Source-owned
    // events require the owning source system to authorise the change
    // through its scheduling contract. No source system currently
    // authorises recurrence splitting. This is NOT a permanent blacklist —
    // add source systems to SOURCE_SPLIT_AUTHORITY when they implement
    // scheduling-contract authorization for recurrence changes.
    const sourceSystem = oldEvent.source_system || 'manual';
    const isSourceAuthorised = SOURCE_SPLIT_AUTHORITY[sourceSystem] === true;
    if (!isSourceAuthorised) {
        throw new https_1.HttpsError('failed-precondition', `Source system '${sourceSystem}' owns this series. ` +
            'Recurrence changes must be authorised through the source system\u2019s scheduling contract.');
    }
    // ── Already superseded? Reject (don't split a historical series) ──
    if (oldEvent.superseded_by_id) {
        throw new https_1.HttpsError('failed-precondition', 'Series has already been superseded');
    }
    // ── Compute effective_until for old series ──
    // Just before the split occurrence so the split occurrence and later
    // are NOT generated by the old series (occStart <= effectiveUntil).
    const splitDate = new Date(split_start_time);
    const effectiveUntilIso = new Date(splitDate.getTime() - 1).toISOString();
    // ── New series properties ──
    const newStart = new_start_time || split_start_time;
    let newEndValue = new_end_time;
    if (!newEndValue) {
        const oldDuration = new Date(oldEvent.end_time).getTime() - new Date(oldEvent.start_time).getTime();
        newEndValue = new Date(new Date(newStart).getTime() + oldDuration).toISOString();
    }
    const newRrule = new_recurrence_rule || oldEvent.recurrence_rule;
    // ── New series event data (used for creation + projection) ──
    const newEventData = {
        owner_id: oldEvent.owner_id,
        owner_type: oldEvent.owner_type,
        operating_context: oldEvent.operating_context || 'personal',
        title: new_title || oldEvent.title,
        description: new_description !== undefined ? new_description : oldEvent.description,
        start_time: newStart,
        end_time: newEndValue,
        timezone: oldEvent.timezone || 'UTC',
        all_day: oldEvent.all_day || false,
        location_id: oldEvent.location_id || null,
        location_type: oldEvent.location_type || 'physical',
        meeting_url: oldEvent.meeting_url || null,
        visibility: oldEvent.visibility || 'private',
        lifecycle_state: 'scheduled',
        source_system: oldEvent.source_system || 'manual',
        source_id: `split:${series_event_id}:${split_start_time}`,
        business_id: oldEvent.business_id || null,
        created_by_id: oldEvent.created_by_id,
        recurrence_rule: newRrule,
        assigned_identity_ids: oldEvent.assigned_identity_ids || [],
        invited_identity_ids: oldEvent.invited_identity_ids || [],
        invited_guest_emails: oldEvent.invited_guest_emails || [],
    };
    // ── Idempotency ──
    const splitSourceId = `${series_event_id}:${split_start_time}`;
    const idempKey = (0, calendarEvent_1.idempotencyDocId)(oldEvent.owner_type, oldEvent.owner_id || '', 'split', splitSourceId);
    const idempRef = shared_1.db.collection(IDEMPOTENCY).doc(idempKey);
    let newEventId = '';
    let existingNewId = null;
    await shared_1.db.runTransaction(async (tx) => {
        const idempSnap = await tx.get(idempRef);
        if (idempSnap.exists && idempSnap.data()?.event_id) {
            existingNewId = idempSnap.data().event_id;
            return;
        }
        // Cap the old series — effective_until + superseded_by_id
        tx.update(shared_1.db.collection(EVENTS).doc(series_event_id), {
            effective_until: effectiveUntilIso,
            superseded_by_id: '', // placeholder — set to newRef.id below in a 2nd update
            _updated_date: nowIso,
        });
        // Create new series
        const newRef = shared_1.db.collection(EVENTS).doc();
        newEventId = newRef.id;
        tx.set(newRef, { ...newEventData, _created_date: nowIso, _updated_date: nowIso });
        // Set superseded_by_id on old series → new series
        tx.update(shared_1.db.collection(EVENTS).doc(series_event_id), {
            superseded_by_id: newRef.id,
        });
        // Idempotency record
        tx.set(idempRef, {
            event_id: newRef.id,
            owner_type: oldEvent.owner_type,
            owner_id: oldEvent.owner_id,
            source_system: 'split',
            source_id: splitSourceId,
            _created_date: nowIso,
            _updated_date: nowIso,
        });
    });
    const finalNewId = existingNewId || newEventId;
    const created = !existingNewId;
    // ── Migrate future exceptions (always — idempotent + retry-safe) ──
    // Re-create on the new series BEFORE deleting from the old, so a partial
    // failure preserves the exception on the old series for retry. Deterministic
    // doc IDs (exceptionDocId) prevent duplication — re-running overwrites the
    // same doc on the new series, and deleting from the old series is a no-op
    // if already deleted. This runs on every call (not just first creation)
    // so a retry after a partial failure completes the migration.
    const exceptions = await (0, calendarEventExceptions_1.listExceptions)(series_event_id);
    for (const exc of exceptions) {
        if (new Date(exc.original_start_time).getTime() >= splitDate.getTime()) {
            // Re-create on new series first (idempotent — deterministic doc ID + merge)
            await (0, calendarEventExceptions_1.setOccurrenceException)(finalNewId, exc.original_start_time, exc.exception_type, exc.created_by_id, exc.new_start_time, exc.new_end_time, exc.reason);
            // Then delete from old series (idempotent — no-op if already deleted)
            await shared_1.db.collection(EXCEPTIONS).doc((0, calendarEventExceptions_1.exceptionDocId)(series_event_id, exc.original_start_time)).delete().catch(() => { });
        }
    }
    if (created) {
        // ── Schedule history (only on first creation — append-only, not idempotent) ──
        // Old series: recurrence_changed (superseded)
        await (0, calendarEventHistory_1.appendScheduleHistory)({
            event_id: series_event_id,
            change_type: 'recurrence_changed',
            previous_start_time: oldEvent.start_time,
            previous_end_time: oldEvent.end_time,
            new_start_time: effectiveUntilIso,
            new_end_time: null,
            changed_at: nowIso,
            actor_id: callerIdentityId,
            source_system: oldEvent.source_system || 'manual',
        });
        // New series: created
        await (0, calendarEventHistory_1.appendScheduleHistory)({
            event_id: finalNewId,
            change_type: 'created',
            previous_start_time: null,
            previous_end_time: null,
            new_start_time: newStart,
            new_end_time: newEndValue,
            changed_at: nowIso,
            actor_id: callerIdentityId,
            source_system: oldEvent.source_system || 'manual',
        });
    }
    // ── Maintain projections (always — idempotent) ──
    await (0, calendarEvent_1.maintainProjection)(series_event_id, { ...oldEvent, effective_until: effectiveUntilIso, superseded_by_id: finalNewId });
    await (0, calendarEvent_1.maintainProjection)(finalNewId, newEventData);
    return {
        old_event_id: series_event_id,
        new_event_id: finalNewId,
        effective_until: effectiveUntilIso,
        created,
    };
});
//# sourceMappingURL=recurrenceSeriesSplit.js.map