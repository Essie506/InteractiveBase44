"use strict";
// Hold expiry sweep (V2 §36) — scheduled Cloud Function.
// ───────────────────────────────────────────────────────────
// Releases expired slot holds deterministically so abandoned holds free
// time, not only on lazy access. Calendar determines whether time remains
// held; the sweep transitions active holds whose expires_at has passed to
// 'expired'. Runs every 5 minutes.
Object.defineProperty(exports, "__esModule", { value: true });
exports.sweepExpiredHolds = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const shared_1 = require("./shared");
const bookingCalendarEvent_1 = require("./bookingCalendarEvent");
exports.sweepExpiredHolds = (0, scheduler_1.onSchedule)({ region: 'europe-west2', schedule: 'every 5 minutes' }, async () => {
    const now = new Date().toISOString();
    const snap = await shared_1.db.collection('slotHolds')
        .where('status', '==', 'active')
        .where('expires_at', '<=', now)
        .get();
    let count = 0;
    for (const doc of snap.docs) {
        await doc.ref.update({ status: 'expired', _updated_date: now });
        // §118: cancel the 'held' calendar event so the released time frees up
        // on the provider's Calendar. Best-effort — a missing event is a no-op.
        await (0, bookingCalendarEvent_1.releaseHoldCalendarEvent)(doc.id, now).catch(() => { });
        count++;
    }
    if (count)
        console.log(`sweepExpiredHolds released ${count} expired holds`);
});
//# sourceMappingURL=holdSweep.js.map