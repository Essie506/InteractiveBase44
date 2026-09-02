"use strict";
// Scheduled delivery sweep — backstop retry for stuck/retryable deliveries.
// ───────────────────────────────────────────────────────────
// Runs every 2 minutes. Catches:
//   - deliveries where the trigger fired but the function instance died
//     mid-send (stuck 'pending' with next_retry_at null),
//   - 'retryable' deliveries whose backoff window has elapsed.
//
// Matching deliveries are reset to 'pending' (next_retry_at cleared),
// which re-triggers the deliveryWorker via the onDocumentWritten trigger.
// The atomic claim in the worker prevents double-send. This sweep uses the
// single composite index: state ASC + next_retry_at ASC (null <= now
// matches 'pending'; future timestamps exclude not-yet-elapsed 'retryable').
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryDeliveries = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const shared_1 = require("../shared");
const DELIVERY = 'notificationDeliveries';
const BATCH = 50;
exports.retryDeliveries = (0, scheduler_1.onSchedule)({
    region: 'europe-west2',
    schedule: 'every 2 minutes',
    secrets: ['RESEND_API_KEY'],
}, async () => {
    const now = new Date().toISOString();
    const snap = await shared_1.db.collection(DELIVERY)
        .where('state', 'in', ['pending', 'retryable'])
        .where('next_retry_at', '<=', now)
        .limit(BATCH)
        .get();
    if (snap.empty)
        return;
    const resetIso = new Date().toISOString();
    const updates = [];
    snap.forEach((doc) => {
        updates.push(doc.ref.update({
            state: 'pending',
            next_retry_at: null,
            updated_at: resetIso,
        }));
    });
    await Promise.all(updates);
    // Each update re-triggers processDelivery (onDocumentWritten); the
    // worker claims and sends (or re-classifies the failure).
});
//# sourceMappingURL=deliverySweep.js.map