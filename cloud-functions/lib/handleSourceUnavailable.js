"use strict";
// Source Unavailable handler — Calendar V2 §106–§108, §111.
// ───────────────────────────────────────────────────────────
// Calendar-owned scheduling-contract endpoint. Source systems
// (Booking, Workout, Business, etc.) call this when a source record
// becomes unavailable — deleted, access-revoked, or deactivated.
//
// Calendar REACTS to authoritative source lifecycle/access state.
// It does NOT own, monitor, or poll source-system state. The source
// system owns the decision; Calendar owns the schedule representation
// transition.
//
// §106 — Deleted Source Records:
//   Calendar determines whether the scheduled representation becomes
//   unavailable, cancelled, historical, anonymised, or removed,
//   according to the owning system's contract. Calendar must NOT
//   reconstruct deleted source content.
//
// §107 — Source Restriction:
//   If a user loses access to the source record, Calendar must NOT
//   continue exposing protected source information through an old
//   Calendar Event. Privacy-safe historical scheduling evidence may
//   be preserved where policy permits.
//
// §108 — Account Deactivation:
//   Account deactivation must NOT automatically erase Calendar history.
//   Future scheduling behaviour depends on source ownership, Booking
//   obligations, Business continuity, retention, and participant
//   impact. Authentication owns account access; Calendar owns schedule
//   representation.
//
// §111 — Source Unavailable State:
//   Where schedule information exists but source detail cannot currently
//   be retrieved, Calendar can present a privacy-safe unavailable state.
//   It must NOT fabricate source information.
//
// PRESERVATION GUARANTEES:
//   - The Calendar Event record is NEVER deleted by this handler.
//   - Schedule history (calendarEventHistory) is append-only and preserved.
//   - Source detail (title, description, meeting_url) is REDACTED to
//     privacy-safe values so stale/unauthorised source information is not
//     exposed through an old Calendar Event (§107).
//   - The original source_system + source_id are preserved for audit.
//   - Past occurrences remain visible as privacy-safe historical evidence.
//
// TRANSITION RULES (deterministic — based on event lifecycle + reason):
//   reason 'deleted'     → lifecycle_state 'removed' (source record gone)
//   reason 'access_lost'  → lifecycle_state 'removed' (user can't see source)
//   reason 'deactivated'  → lifecycle_state 'cancelled' (account deactivated;
//                           future occurrences cancelled, history preserved)
//   reason 'unavailable'  → transient; lifecycle_state unchanged but
//                           source_detail_redacted flag set (§111)
//
// The event is NOT deleted. Its history is NOT erased. Source detail
// is redacted so §107 is satisfied. The public projection is removed
// (the event is no longer discoverable) unless the event is historical.
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSourceUnavailable = void 0;
exports.resolveUnavailableTransition = resolveUnavailableTransition;
exports.buildRedactionPayload = buildRedactionPayload;
const https_1 = require("firebase-functions/v2/https");
const shared_1 = require("./shared");
const calendarEvent_1 = require("./calendarEvent");
const calendarEventHistory_1 = require("./calendarEventHistory");
const calendarSignal_1 = require("./calendarSignal");
const EVENTS = 'calendarEvents';
const VALID_REASONS = new Set(['deleted', 'access_lost', 'deactivated', 'unavailable']);
// Privacy-safe redaction values. These replace source-owned detail so
// stale/unauthorised source information is not exposed (§107). Calendar-
// owned fields (time, timezone, all_day) are preserved — Calendar owns
// when something happens, not what it means.
const REDACTED_TITLE = 'Unavailable event';
const REDACTED_DESCRIPTION = 'This event\'s source is no longer available.';
const REDACTED_MEETING_URL = null;
// Lifecycle states that are already terminal — no further transition needed.
const TERMINAL_STATES = new Set(['cancelled', 'removed', 'historical', 'archived']);
/**
 * Determine the target lifecycle_state for a source-unavailable transition.
 * Pure function — exported for testing.
 *
 * §106: deleted/access_lost → 'removed'
 * §108: deactivated → 'cancelled' (future cancelled, history preserved)
 * §111: unavailable → unchanged (transient; source detail redacted only)
 */
function resolveUnavailableTransition(currentLifecycleState, reason) {
    // Already terminal — no lifecycle transition, but still redact detail for §107
    if (TERMINAL_STATES.has(currentLifecycleState)) {
        return { newLifecycleState: null, redactDetail: true, removeFromPublic: true };
    }
    switch (reason) {
        case 'deleted':
        case 'access_lost':
            return { newLifecycleState: 'removed', redactDetail: true, removeFromPublic: true };
        case 'deactivated':
            return { newLifecycleState: 'cancelled', redactDetail: true, removeFromPublic: true };
        case 'unavailable':
            // Transient — lifecycle unchanged, detail redacted (§111)
            return { newLifecycleState: null, redactDetail: true, removeFromPublic: true };
        default:
            return { newLifecycleState: null, redactDetail: true, removeFromPublic: true };
    }
}
/**
 * Redact source-owned detail from a Calendar Event so §107 is satisfied.
 * Calendar-owned fields (start_time, end_time, timezone, all_day) are
 * preserved — Calendar owns when, not what.
 *
 * Returns the update payload (does NOT write). The caller writes it.
 */
function buildRedactionPayload(eventData) {
    const payload = {
        title: REDACTED_TITLE,
        description: REDACTED_DESCRIPTION,
        meeting_url: REDACTED_MEETING_URL,
        source_detail_redacted: true,
        source_unavailable_reason: eventData.source_unavailable_reason || null,
        _updated_date: new Date().toISOString(),
    };
    return payload;
}
// ── handleSourceUnavailable ──────────────────────────────────
// Scheduling-contract endpoint for source systems.
//
// Request: {
//   source_system: string,   — 'booking' | 'workout' | 'business_scheduling' | ...
//   source_id: string,      — the source record ID
//   reason: string,          — 'deleted' | 'access_lost' | 'deactivated' | 'unavailable'
//   actor_id?: string,      — the identity that triggered the change (for audit)
// }
// Returns: { affected_events: number, transitions: Array<{ event_id, new_state }> }
exports.handleSourceUnavailable = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const { source_system, source_id, reason, actor_id } = request.data || {};
    // ── Validate ──
    if (!source_system || !source_id) {
        throw new https_1.HttpsError('invalid-argument', 'source_system and source_id are required');
    }
    if (!VALID_REASONS.has(reason)) {
        throw new https_1.HttpsError('invalid-argument', `Invalid reason: ${reason}. Must be one of: ${Array.from(VALID_REASONS).join(', ')}`);
    }
    // ── Find all Calendar Events for this source ──
    // source_id is the stable reference to the source record. Multiple
    // events may reference the same source (e.g. a recurring series split
    // produces multiple series, each with the same source_id lineage).
    const snap = await shared_1.db.collection(EVENTS)
        .where('source_system', '==', source_system)
        .where('source_id', '==', source_id)
        .get();
    if (snap.empty) {
        return { affected_events: 0, transitions: [] };
    }
    const nowIso = new Date().toISOString();
    const transitions = [];
    for (const doc of snap.docs) {
        const eventData = doc.data();
        const currentLifecycle = eventData.lifecycle_state || 'scheduled';
        const { newLifecycleState, redactDetail, removeFromPublic } = resolveUnavailableTransition(currentLifecycle, reason);
        // ── Build update payload ──
        const updatePayload = {};
        if (newLifecycleState && newLifecycleState !== currentLifecycle) {
            updatePayload.lifecycle_state = newLifecycleState;
        }
        if (redactDetail) {
            const redaction = buildRedactionPayload({ ...eventData, source_unavailable_reason: reason });
            Object.assign(updatePayload, redaction);
        }
        updatePayload._updated_date = nowIso;
        // ── Write (merge — never replace the authoritative record) ──
        if (Object.keys(updatePayload).length > 1) { // more than just _updated_date
            await doc.ref.set(updatePayload, { merge: true });
            // ── Append schedule history (append-only, preserved — §108) ──
            await (0, calendarEventHistory_1.appendScheduleHistory)({
                event_id: doc.id,
                change_type: newLifecycleState === 'removed' ? 'removed'
                    : newLifecycleState === 'cancelled' ? 'cancelled'
                        : 'source_unavailable',
                previous_start_time: eventData.start_time || null,
                previous_end_time: eventData.end_time || null,
                new_start_time: eventData.start_time || null,
                new_end_time: eventData.end_time || null,
                changed_at: nowIso,
                actor_id: actor_id || null,
                source_system,
            });
            // ── Refresh public projection ──
            // removeFromPublic → the projection is deleted (event no longer
            // discoverable). refreshEventProjection handles this via
            // isEventListable which checks lifecycle_state.
            await (0, calendarEvent_1.refreshEventProjection)(doc.id).catch(() => { });
            // §99: bump realtime signals so affected Calendars drop the event.
            await (0, calendarSignal_1.emitCalendarSignalForEvent)(eventData);
        }
        transitions.push({ event_id: doc.id, new_state: newLifecycleState || currentLifecycle });
    }
    return { affected_events: transitions.length, transitions };
});
//# sourceMappingURL=handleSourceUnavailable.js.map