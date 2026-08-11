import { base44 } from '@/api/base44Client';

// Notification System — event-based, deterministic delivery policy
// Source systems own the event; Notifications owns the record + delivery.

// Delivery Policy: Required | Conditional | Prohibited
// Every event/channel relationship resolves deterministically.
const DELIVERY_POLICY = {
  verification_submitted:    { in_app: 'conditional', email: 'conditional', push: 'prohibited',  sms: 'prohibited' },
  verification_approved:     { in_app: 'required',     email: 'required',    push: 'conditional', sms: 'prohibited' },
  verification_rejected:     { in_app: 'required',     email: 'required',    push: 'conditional', sms: 'prohibited' },
  verification_expired:      { in_app: 'conditional',  email: 'conditional', push: 'prohibited',  sms: 'prohibited' },
  media_processing_failed:  { in_app: 'conditional',  email: 'conditional', push: 'prohibited',  sms: 'prohibited' },
  business_invitation:      { in_app: 'required',     email: 'required',    push: 'conditional', sms: 'prohibited' },
  security_event:            { in_app: 'required',     email: 'required',    push: 'required',   sms: 'prohibited' },
};

export function resolveDeliveryPolicy(eventType, channel) {
  const policy = DELIVERY_POLICY[eventType];
  if (!policy) return 'prohibited';
  return policy[channel] || 'prohibited';
}

// Quiet Hours — defer interruptive delivery, never prevent the record from existing
export function isQuietHours(prefs) {
  if (!prefs?.quiet_hours_enabled) return false;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = (prefs.quiet_hours_start || '22:00').split(':').map(Number);
  const [endH, endM] = (prefs.quiet_hours_end || '07:00').split(':').map(Number);
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;
  if (start < end) return currentMinutes >= start && currentMinutes < end;
  return currentMinutes >= start || currentMinutes < end; // overnight
}

// Create a notification record from an authoritative event.
// Notification failure never undoes the source action.
export async function createNotification(event) {
  const {
    recipient_id, source_system, event_type, title, body,
    category, priority, action_url, action_label, group_key, source_id,
  } = event;

  // Resolve delivery channels from policy
  const channels = ['in_app', 'email', 'push', 'sms'].filter(ch => {
    const policy = resolveDeliveryPolicy(event_type, ch);
    return policy === 'required' || policy === 'conditional';
  });

  // Create the notification record (always — record exists regardless of delivery)
  const record = await base44.entities.NotificationRecord.create({
    recipient_id,
    source_system,
    event_type,
    title,
    body: body || '',
    category: category || 'system',
    priority: priority || 'normal',
    delivery_channels: channels,
    is_read: false,
    action_url,
    action_label,
    group_key,
    source_id,
  });

  // Attempt email delivery (best-effort, isolated from source action)
  if (channels.includes('email')) {
    try {
      // SendEmail reaches registered app users only
      const user = await base44.entities.User.filter({ id: recipient_id });
      if (user.length > 0 && user[0].email) {
        await base44.integrations.Core.SendEmail({
          to: user[0].email,
          subject: title,
          body: body || title,
        });
      }
    } catch {
      // Email delivery failed — notification record still exists; source action unaffected
    }
  }

  // Push delivery — stub (device infrastructure not yet available)
  // In-app delivery — the record IS the in-app notification

  return record;
}

export async function getUnreadCount(identityId) {
  const records = await base44.entities.NotificationRecord.filter({
    recipient_id: identityId,
    is_read: false,
  });
  return records.length;
}

export async function getNotifications(identityId, limit = 50) {
  return base44.entities.NotificationRecord.filter(
    { recipient_id: identityId },
    '-created_date',
    limit
  );
}

export async function markAsRead(notificationId) {
  return base44.entities.NotificationRecord.update(notificationId, {
    is_read: true,
    read_at: new Date().toISOString(),
  });
}

export async function markAllAsRead(identityId) {
  const records = await base44.entities.NotificationRecord.filter({
    recipient_id: identityId,
    is_read: false,
  });
  if (records.length === 0) return;
  await base44.entities.NotificationRecord.bulkUpdate(
    records.map(r => ({
      id: r.id,
      is_read: true,
      read_at: new Date().toISOString(),
    }))
  );
}

// Get or create default notification preferences
export async function getOrCreatePreferences(identityId) {
  const existing = await base44.entities.NotificationPreference.filter({ identity_id: identityId });
  if (existing.length > 0) return existing[0];
  return base44.entities.NotificationPreference.create({ identity_id: identityId });
}