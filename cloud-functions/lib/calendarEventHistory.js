"use strict";
// Calendar scheduling history — append-only schedule-change records.
// ───────────────────────────────────────────────────────────
// V2 §48, §104, §105: preserve sufficient history on each Calendar event
// to show previous/new schedule, change time, authorised source, and
// actor/context — for schedule changes, cancellations, and
// participant/availability-impacting changes. Historical presentation
// must not rewrite past schedules.
//
// Smallest architecture: an append-only `calendarEventHistory`
// subcollection. Each doc is one immutable change record. This does NOT
// duplicate source-system audit history (Booking's reschedule_history
// stays on the booking); Calendar records its own schedule-change timeline.
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendScheduleHistory = appendScheduleHistory;
const shared_1 = require("./shared");
/**
 * Append one immutable schedule-change record. Server-only — clients
 * cannot write (firestore.rules deny). The event-level operation that
 * triggers this is idempotent upstream (a repeated cancel is rejected
 * before reaching here), so each genuine change produces exactly one
 * append. History is append-only — past entries are never rewritten.
 */
async function appendScheduleHistory(entry) {
    const ref = shared_1.db.collection('calendarEventHistory').doc();
    await ref.set({
        ...entry,
        _created_date: entry.changed_at,
    });
}
//# sourceMappingURL=calendarEventHistory.js.map