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

import { createHash } from 'crypto';

export function stableHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 32);
}

export interface NotificationIdentity {
  recipientId: string | null;     // null for guest
  recipientEmail: string | null;  // set for guest
  sourceSystem: string;
  eventType: string;
  sourceId: string;
  version: string;
}

/** Deterministic NotificationRecord doc ID for an identity recipient. */
export function notificationDocId(id: NotificationIdentity): string {
  const recipient = id.recipientId
    ? id.recipientId
    : `guest:${id.recipientEmail || ''}`;
  const key = [recipient, id.sourceSystem, id.eventType, id.sourceId, id.version].join('|');
  return `notif:${stableHash(key)}`;
}

/** Deterministic delivery doc ID for an identity recipient. */
export function deliveryDocIdForIdentity(notificationId: string, channel: string): string {
  return `dlv:${stableHash([notificationId, channel].join('|'))}`;
}

/** Deterministic delivery doc ID for a guest (no NotificationRecord). */
export function deliveryDocIdForGuest(identity: NotificationIdentity, channel: string): string {
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