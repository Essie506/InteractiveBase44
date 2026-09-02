"use strict";
// Notification dispatcher — the sole entry point for domain systems.
// ───────────────────────────────────────────────────────────
// Owns: deterministic notification identity, recipient resolution,
// preference-based channel routing, NotificationRecord creation, and
// notificationDeliveries (outbox) creation. Domain systems never touch
// notificationRecords or notificationDeliveries directly — they call
// emitNotification with a semantic event.
//
// Synchronous dispatch, asynchronous delivery: emitNotification writes the
// record + outbox and returns. Email/push are sent by a separate worker
// (deliveryWorker.ts) so domain operations are not coupled to email latency
// or provider outages, and delivery does not depend on the originating
// request remaining open.
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitNotification = emitNotification;
const shared_1 = require("../shared");
const policy_1 = require("./policy");
const identity_1 = require("./identity");
const idempotency_1 = require("./idempotency");
const DELIVERY = 'notificationDeliveries';
const RECORDS = 'notificationRecords';
/**
 * Emit a semantic notification event. Creates the in-app NotificationRecord
 * (identity recipients only) and the email outbox delivery (identity or
 * guest) using deterministic document IDs, so retries are idempotent.
 */
async function emitNotification(event) {
    const isGuest = !event.recipient_id && !!event.recipient_email;
    const channelsToConsider = ['in_app', 'email'];
    // ── Resolve channels from policy + recipient preferences ──
    // Guests have no preferences; conditional channels default to delivered.
    let prefs = null;
    if (event.recipient_id) {
        try {
            const snap = await shared_1.db.collection('notificationPreferences').doc(event.recipient_id).get();
            if (snap.exists)
                prefs = snap.data();
        }
        catch {
            /* preferences unavailable → conditional defaults delivered */
        }
    }
    const channels = (0, policy_1.resolveChannels)(event.event_type, event.category, prefs, channelsToConsider);
    const now = new Date().toISOString();
    const identity = {
        recipientId: event.recipient_id,
        recipientEmail: event.recipient_email,
        sourceSystem: event.source_system,
        eventType: event.event_type,
        sourceId: event.source_id,
        version: event.version,
    };
    // ── In-app record (identities only; guests get no NotificationRecord) ──
    let notificationId = null;
    if (event.recipient_id && channels.includes('in_app')) {
        notificationId = (0, idempotency_1.notificationDocId)(identity);
        const recordData = {
            recipient_id: event.recipient_id,
            source_system: event.source_system,
            event_type: event.event_type,
            title: event.title,
            body: event.body || '',
            category: event.category,
            priority: event.priority || 'normal',
            delivery_channels: channels,
            is_read: false,
            action_url: event.action_url,
            action_label: event.action_label || null,
            group_key: null,
            source_id: event.source_id,
            _created_date: now,
            _updated_date: now,
        };
        // set() on a deterministic path → idempotent overwrite on retry.
        await shared_1.db.collection(RECORDS).doc(notificationId).set(recordData, { merge: true });
    }
    // ── Email delivery (identity or guest) ──
    if (channels.includes('email') && event.emailContext && event.emailPayloadBuilder) {
        let toEmail = null;
        if (event.recipient_id) {
            toEmail = await (0, identity_1.resolveDeliveryEmail)(event.recipient_id);
        }
        else if (event.recipient_email) {
            toEmail = event.recipient_email;
        }
        if (toEmail) {
            const deliveryId = notificationId
                ? (0, idempotency_1.deliveryDocIdForIdentity)(notificationId, 'email')
                : (0, idempotency_1.deliveryDocIdForGuest)(identity, 'email');
            const payload = event.emailPayloadBuilder(event.emailContext);
            const payloadHash = (0, idempotency_1.stableHash)([payload.subject, payload.html, payload.text].join('|'));
            const deliveryData = {
                delivery_id: deliveryId,
                notification_id: notificationId,
                source_system: event.source_system,
                event_type: event.event_type,
                source_id: event.source_id,
                version: event.version,
                channel: 'email',
                recipient_id: event.recipient_id,
                recipient_email: toEmail,
                state: 'pending',
                attempts: 0,
                max_attempts: 5,
                provider: null,
                provider_message_id: null,
                last_error: null,
                last_error_code: null,
                next_retry_at: null,
                payload_hash: payloadHash,
                email_subject: payload.subject,
                email_html: payload.html,
                email_text: payload.text,
                created_at: now,
                updated_at: now,
            };
            // set() on a deterministic path → idempotent overwrite on retry.
            await shared_1.db.collection(DELIVERY).doc(deliveryId).set(deliveryData, { merge: true });
        }
    }
}
//# sourceMappingURL=dispatcher.js.map