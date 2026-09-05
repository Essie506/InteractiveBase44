"use strict";
// Business Relationship Exit — Calendar V2 §109.
// ───────────────────────────────────────────────────────────
// Calendar consumes authoritative Business relationship state. When a
// Business membership ends (staff removed, role changed, business
// deactivated), the Business system calls this Calendar contract
// endpoint. Calendar removes the identity from assigned_identity_ids
// and invited_identity_ids on all affected Business events, and
// revokes any participation records.
//
// PRESERVATION GUARANTEES:
//   - Business-owned events are NOT deleted or cancelled. They remain
//     on the Business Calendar.
//   - Schedule history is preserved (append-only).
//   - The former staff member loses visibility of Business events
//     (removed from assigned/invited lists) but their own identity-owned
//     events are unaffected.
//   - Legitimate scheduling history is preserved — past participation
//     remains auditable.
//
// Calendar does NOT infer Business membership or own Business
// relationship state. It reacts to the authoritative Business system's
// instruction. If the Business system does not call this endpoint, the
// former staff member may retain stale visibility until the next event
// edit — this is a Business-system responsibility, not a Calendar bug.
//
// Request: {
//   business_id: string,
//   identity_id: string,
//   reason: 'membership_removed' | 'role_changed' | 'business_deactivated',
//   actor_id?: string,
// }
// Returns: { affected_events: number, details: Array<{ event_id, changes }> }
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleBusinessRelationshipExit = void 0;
const https_1 = require("firebase-functions/v2/https");
const shared_1 = require("./shared");
const calendarParticipation_1 = require("./calendarParticipation");
const calendarEventHistory_1 = require("./calendarEventHistory");
const calendarEvent_1 = require("./calendarEvent");
const EVENTS = 'calendarEvents';
const PARTICIPATION = 'calendarParticipation';
const VALID_REASONS = new Set([
    'membership_removed',
    'role_changed',
    'business_deactivated',
]);
exports.handleBusinessRelationshipExit = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const { business_id, identity_id, reason, actor_id } = request.data || {};
    // ── Validate ──
    if (!business_id || !identity_id) {
        throw new https_1.HttpsError('invalid-argument', 'business_id and identity_id are required');
    }
    if (!VALID_REASONS.has(reason)) {
        throw new https_1.HttpsError('invalid-argument', `Invalid reason: ${reason}. Must be one of: ${Array.from(VALID_REASONS).join(', ')}`);
    }
    const nowIso = new Date().toISOString();
    const details = [];
    // ── Find all Business events where this identity is assigned or invited ──
    // Two queries: assigned_identity_ids array-contains + invited_identity_ids
    // array-contains. Each is isolated so one failure does not block the other.
    let affectedEvents = [];
    try {
        const assignedSnap = await shared_1.db.collection(EVENTS)
            .where('business_id', '==', business_id)
            .where('assigned_identity_ids', 'array-contains', identity_id)
            .get();
        for (const doc of assignedSnap.docs) {
            affectedEvents.push({ id: doc.id, data: doc.data() });
        }
    }
    catch (err) {
        console.error('[handleBusinessRelationshipExit] assigned query failed:', err);
    }
    try {
        const invitedSnap = await shared_1.db.collection(EVENTS)
            .where('business_id', '==', business_id)
            .where('invited_identity_ids', 'array-contains', identity_id)
            .get();
        for (const doc of invitedSnap.docs) {
            // Deduplicate by event ID (an event may be in both assigned and invited)
            if (!affectedEvents.find((e) => e.id === doc.id)) {
                affectedEvents.push({ id: doc.id, data: doc.data() });
            }
        }
    }
    catch (err) {
        console.error('[handleBusinessRelationshipExit] invited query failed:', err);
    }
    // ── For each affected event, remove the identity from arrays ──
    for (const { id: eventId, data: eventData } of affectedEvents) {
        const changes = [];
        const updatePayload = {};
        const assigned = eventData.assigned_identity_ids || [];
        if (assigned.includes(identity_id)) {
            updatePayload.assigned_identity_ids = assigned.filter((id) => id !== identity_id);
            changes.push('removed_from_assigned');
        }
        const invited = eventData.invited_identity_ids || [];
        if (invited.includes(identity_id)) {
            updatePayload.invited_identity_ids = invited.filter((id) => id !== identity_id);
            changes.push('removed_from_invited');
        }
        if (changes.length === 0)
            continue;
        updatePayload._updated_date = nowIso;
        await shared_1.db.collection(EVENTS).doc(eventId).set(updatePayload, { merge: true });
        // ── Revoke participation record if the identity was invited ──
        if (changes.includes('removed_from_invited')) {
            await (0, calendarParticipation_1.revokeParticipationRecords)(eventId, [identity_id], actor_id || 'system', nowIso);
        }
        // ── Append schedule history ──
        await (0, calendarEventHistory_1.appendScheduleHistory)({
            event_id: eventId,
            change_type: 'participant_removed',
            previous_start_time: eventData.start_time || null,
            previous_end_time: eventData.end_time || null,
            new_start_time: eventData.start_time || null,
            new_end_time: eventData.end_time || null,
            changed_at: nowIso,
            actor_id: actor_id || null,
            source_system: 'business_scheduling',
        });
        // ── Refresh public projection (in case listability changed) ──
        await (0, calendarEvent_1.refreshEventProjection)(eventId).catch(() => { });
        details.push({ event_id: eventId, changes });
    }
    return { affected_events: details.length, details };
});
//# sourceMappingURL=handleBusinessRelationshipExit.js.map