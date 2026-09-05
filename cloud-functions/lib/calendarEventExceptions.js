"use strict";
// Calendar Event recurrence exceptions (§55–§56).
// ───────────────────────────────────────────────────────────
// An exception modifies a single occurrence of a recurring series:
//   'cancelled'  — the occurrence is skipped (does not appear, does not block)
//   'rescheduled' — the occurrence is moved to a new start/end time
//
// The exception stores the ORIGINAL occurrence start so the occurrence
// identity is stable across reschedules (§55). Past exceptions are never
// rewritten (historical recurrence integrity — §57).
//
// Collection: calendarEventExceptions
// Doc ID: {seriesEventId}__{originalOccurrenceStartIso} (deterministic,
//   so retry-safe and at most one exception per occurrence).
Object.defineProperty(exports, "__esModule", { value: true });
exports.exceptionDocId = exceptionDocId;
exports.setOccurrenceException = setOccurrenceException;
exports.listExceptions = listExceptions;
exports.applyExceptions = applyExceptions;
const shared_1 = require("./shared");
const recurrence_1 = require("./recurrence");
const EXCEPTIONS = 'calendarEventExceptions';
function exceptionDocId(seriesEventId, originalStartIso) {
    return (0, recurrence_1.occurrenceId)(seriesEventId, originalStartIso);
}
/**
 * Create or update an exception for a single occurrence.
 * Idempotent: deterministic doc ID → retry overwrites the same doc.
 */
async function setOccurrenceException(seriesEventId, originalStartIso, exceptionType, actorId, newStartIso, newEndIso, reason) {
    const docId = exceptionDocId(seriesEventId, originalStartIso);
    const nowIso = new Date().toISOString();
    const data = {
        exception_id: docId,
        series_event_id: seriesEventId,
        original_start_time: originalStartIso,
        exception_type: exceptionType,
        new_start_time: newStartIso || null,
        new_end_time: newEndIso || null,
        reason: reason || null,
        created_by_id: actorId,
        _created_date: nowIso,
        _updated_date: nowIso,
    };
    await shared_1.db.collection(EXCEPTIONS).doc(docId).set(data, { merge: true });
    return docId;
}
/**
 * List all exceptions for a series event.
 */
async function listExceptions(seriesEventId) {
    const snap = await shared_1.db.collection(EXCEPTIONS)
        .where('series_event_id', '==', seriesEventId)
        .get();
    return snap.docs.map(d => d.data());
}
/**
 * Apply exceptions to a list of expanded occurrences.
 * - 'cancelled' occurrences are removed.
 * - 'rescheduled' occurrences are replaced with the new time (keeping the
 *   same occurrenceId so the identity is stable).
 */
function applyExceptions(occurrences, exceptions) {
    const exceptionMap = new Map(exceptions.map(e => [e.original_start_time, e]));
    const out = [];
    for (const occ of occurrences) {
        // Extract the original start from the occurrenceId (seriesId__originalStart)
        const idx = occ.occurrenceId.lastIndexOf('__');
        const originalStart = idx > 0 ? occ.occurrenceId.slice(idx + 2) : occ.start;
        const exc = exceptionMap.get(originalStart);
        if (!exc) {
            out.push(occ);
            continue;
        }
        if (exc.exception_type === 'cancelled') {
            continue; // skip
        }
        if (exc.exception_type === 'rescheduled' && exc.new_start_time && exc.new_end_time) {
            out.push({
                occurrenceId: occ.occurrenceId, // stable identity
                start: exc.new_start_time,
                end: exc.new_end_time,
            });
        }
    }
    return out;
}
//# sourceMappingURL=calendarEventExceptions.js.map