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

import { createHash } from 'crypto';
import { db } from '../shared';
import { resolveChannels, Channel } from './policy';
import { resolveDeliveryEmail } from './identity';
import {
  notificationDocId,
  deliveryDocIdForIdentity,
  deliveryDocIdForGuest,
  NotificationIdentity,
  stableHash,
} from './idempotency';

const DELIVERY = 'notificationDeliveries';
const RECORDS = 'notificationRecords';

export interface BuiltEmailPayload {
  subject: string;
  html: string;
  text: string;
}

export interface SemanticNotificationEvent {
  source_system: string;
  event_type: string;
  /** Domain event id, e.g. `cal_invite:{eventId}:{recipientId}`. */
  source_id: string;
  /** Event version — deterministic hash or '1'. Same version + same
   * identity → same notification doc (idempotent overwrite on retry). */
  version: string;
  category: string;
  title: string;
  body: string;
  action_url: string | null;
  action_label?: string | null;
  priority?: string;
  /** Identity recipient. Exactly one of recipient_id / recipient_email. */
  recipient_id: string | null;
  /** Guest recipient email (no identity). */
  recipient_email: string | null;
  /** Safe payload context for the email builder (only public-safe fields). */
  emailContext?: any;
  /** Pure builder that turns emailContext into { subject, html, text }. */
  emailPayloadBuilder?: (ctx: any) => BuiltEmailPayload;
}

/**
 * Emit a semantic notification event. Creates the in-app NotificationRecord
 * (identity recipients only) and the email outbox delivery (identity or
 * guest) using deterministic document IDs, so retries are idempotent.
 */
export async function emitNotification(event: SemanticNotificationEvent): Promise<void> {
  const isGuest = !event.recipient_id && !!event.recipient_email;
  const channelsToConsider: Channel[] = ['in_app', 'email'];

  // ── Resolve channels from policy + recipient preferences ──
  // Guests have no preferences; conditional channels default to delivered.
  let prefs: Record<string, any> | null = null;
  if (event.recipient_id) {
    try {
      const snap = await db.collection('notificationPreferences').doc(event.recipient_id).get();
      if (snap.exists) prefs = snap.data() as any;
    } catch {
      /* preferences unavailable → conditional defaults delivered */
    }
  }
  const channels = resolveChannels(event.event_type, event.category, prefs, channelsToConsider);

  const now = new Date().toISOString();
  const identity: NotificationIdentity = {
    recipientId: event.recipient_id,
    recipientEmail: event.recipient_email,
    sourceSystem: event.source_system,
    eventType: event.event_type,
    sourceId: event.source_id,
    version: event.version,
  };

  // ── In-app record (identities only; guests get no NotificationRecord) ──
  let notificationId: string | null = null;
  if (event.recipient_id && channels.includes('in_app')) {
    notificationId = notificationDocId(identity);
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
    await db.collection(RECORDS).doc(notificationId).set(recordData, { merge: true });
  }

  // ── Email delivery (identity or guest) ──
  if (channels.includes('email') && event.emailContext && event.emailPayloadBuilder) {
    let toEmail: string | null = null;
    if (event.recipient_id) {
      toEmail = await resolveDeliveryEmail(event.recipient_id);
    } else if (event.recipient_email) {
      toEmail = event.recipient_email;
    }
    if (toEmail) {
      const deliveryId = notificationId
        ? deliveryDocIdForIdentity(notificationId, 'email')
        : deliveryDocIdForGuest(identity, 'email');
      const payload = event.emailPayloadBuilder(event.emailContext);
      const payloadHash = stableHash([payload.subject, payload.html, payload.text].join('|'));
      const deliveryData: Record<string, any> = {
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
      await db.collection(DELIVERY).doc(deliveryId).set(deliveryData, { merge: true });
    }
  }
}