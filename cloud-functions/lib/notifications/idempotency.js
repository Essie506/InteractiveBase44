"use strict";
// Deterministic notification + delivery identity.
// ───────────────────────────────────────────────────────────
// Uses deterministic document IDs + idempotent set() so retries overwrite
// the SAME document path and can never create a duplicate. This is stronger
// than read-before-write dedup: no query is needed, and concurrent retries
// collapse to one doc by construction.
//
// Notification identity:
//   recipient + source_system + event_type + source_id + version
// Delivery identity (identity recipient):
//   notification identity + channel
// Delivery identity (guest):
//   guest email + source_system + event_type + source_id + version + channel
Object.defineProperty(exports, "__esModule", { value: true });
exports.stableHash = stableHash;
exports.notificationDocId = notificationDocId;
exports.deliveryDocIdForIdentity = deliveryDocIdForIdentity;
exports.deliveryDocIdForGuest = deliveryDocIdForGuest;
const crypto_1 = require("crypto");
function stableHash(input) {
    return (0, crypto_1.createHash)('sha256').update(input).digest('hex').slice(0, 32);
}
/** Deterministic NotificationRecord doc ID for an identity recipient. */
function notificationDocId(id) {
    const recipient = id.recipientId
        ? id.recipientId
        : `guest:${id.recipientEmail || ''}`;
    const key = [recipient, id.sourceSystem, id.eventType, id.sourceId, id.version].join('|');
    return `notif:${stableHash(key)}`;
}
/** Deterministic delivery doc ID for an identity recipient. */
function deliveryDocIdForIdentity(notificationId, channel) {
    return `dlv:${stableHash([notificationId, channel].join('|'))}`;
}
/** Deterministic delivery doc ID for a guest (no NotificationRecord). */
function deliveryDocIdForGuest(identity, channel) {
    const guestKey = [
        `guest:${identity.recipientEmail || ''}`,
        identity.sourceSystem,
        identity.eventType,
        identity.sourceId,
        identity.version,
        channel,
    ].join('|');
    return `dlv:${stableHash(guestKey)}`;
}
//# sourceMappingURL=idempotency.js.map