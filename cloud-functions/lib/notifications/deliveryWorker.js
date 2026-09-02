"use strict";
// Delivery worker — Firestore trigger on notificationDeliveries.
// ───────────────────────────────────────────────────────────
// Claims a pending/retryable delivery atomically (transactional
// precondition on state), calls the provider-neutral EmailProvider, and
// updates the delivery state. Concurrent trigger invocations cannot both
// send: the transactional claim ensures only one invocation transitions
// to 'processing'. The deterministic delivery ID is passed as the
// provider idempotency key so a crash after provider-accept but before
// 'sent' marking resolves to the original message on retry.
//
// State machine:
//   pending    → processing → sent | failed | retryable
//   retryable  → processing → sent | failed | retryable
//   sent       → (terminal; re-trigger is a no-op)
//   failed     → (terminal)
Object.defineProperty(exports, "__esModule", { value: true });
exports.processDelivery = void 0;
exports.backoffMs = backoffMs;
const firestore_1 = require("firebase-functions/v2/firestore");
const shared_1 = require("../shared");
const email_1 = require("./email");
const types_1 = require("./email/types");
const DELIVERY = 'notificationDeliveries';
const MAX_ATTEMPTS = 5;
exports.processDelivery = (0, firestore_1.onDocumentWritten)({
    region: 'europe-west2',
    document: 'notificationDeliveries/{deliveryId}',
    secrets: ['RESEND_API_KEY'],
}, async (event) => {
    const deliveryId = event.params.deliveryId;
    const after = event.data?.after;
    if (!after)
        return; // deleted
    const data = after.data();
    if (!data)
        return;
    if (data.state !== 'pending' && data.state !== 'retryable')
        return;
    const ref = shared_1.db.collection(DELIVERY).doc(deliveryId);
    // ── Atomic claim: pending|retryable → processing ──
    // A transaction with a state precondition ensures only one concurrent
    // invocation wins the claim; the loser exits without sending.
    let claimed = false;
    try {
        await shared_1.db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists)
                return;
            const d = snap.data();
            if (d.state === 'pending' || d.state === 'retryable') {
                tx.update(ref, { state: 'processing', updated_at: new Date().toISOString() });
                claimed = true;
            }
        });
    }
    catch {
        return; // transaction failed — another invocation likely claimed it
    }
    if (!claimed)
        return;
    // ── Send via the provider-neutral interface ──
    const provider = (0, email_1.getEmailProvider)();
    try {
        const result = await provider.send({
            to: data.recipient_email,
            subject: data.email_subject,
            html: data.email_html,
            text: data.email_text,
            idempotencyKey: deliveryId,
            metadata: {
                source_system: data.source_system,
                event_type: data.event_type,
                source_id: data.source_id,
            },
        });
        await ref.update({
            state: 'sent',
            provider: provider.name,
            provider_message_id: result.messageId || null,
            last_error: null,
            last_error_code: null,
            next_retry_at: null,
            updated_at: new Date().toISOString(),
        });
    }
    catch (err) {
        const retryable = err instanceof types_1.EmailError ? err.retryable : false;
        const code = err instanceof types_1.EmailError ? err.code : 'unknown';
        const attempts = (data.attempts || 0) + 1;
        const now = new Date().toISOString();
        if (retryable && attempts < MAX_ATTEMPTS) {
            await ref.update({
                state: 'retryable',
                attempts,
                last_error: err?.message || String(err),
                last_error_code: code,
                next_retry_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
                updated_at: now,
            });
        }
        else {
            await ref.update({
                state: 'failed',
                attempts,
                last_error: err?.message || String(err),
                last_error_code: code,
                next_retry_at: null,
                updated_at: now,
            });
        }
    }
});
/** Exponential backoff with jitter: 30s, 2m, 10m, 1h, 6h. */
function backoffMs(attempt) {
    const base = [30000, 120000, 600000, 3600000, 21600000][Math.min(attempt - 1, 4)] || 21600000;
    const jitter = Math.random() * base * 0.2;
    return base + jitter;
}
//# sourceMappingURL=deliveryWorker.js.map