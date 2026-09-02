import { base44 } from '@/api/base44Client';
import { notificationRepository, settingsRepository } from '@/data/firebase';
import { useFirebase } from '@/lib/backendConfig';
import { callCreateNotification } from '@/services/firebaseFunctions';

// Notification System — M3: routes to Firebase when configured.
// Notification CREATION is server-only (security rules: allow create: if false).
// In Firebase mode, createNotification calls the CreateNotification backend function
// which writes to Firestore with service-account auth.
// Email delivery is deferred to a future notification-delivery migration phase.

const DELIVERY_POLICY = {
  verification_submitted:    { in_app: 'conditional', email: 'conditional', push: 'prohibited',  sms: 'prohibited' },
  verification_approved:     { in_app: 'required',     email: 'required',    push: 'conditional', sms: 'prohibited' },
  verification_rejected:     { in_app: 'required',     email: 'required',    push: 'conditional', sms: 'prohibited' },
  verification_expired:      { in_app: 'conditional',  email: 'conditional', push: 'prohibited',  sms: 'prohibited' },
  media_processing_failed:  { in_app: 'conditional',  email: 'conditional', push: 'prohibited',  sms: 'prohibited' },
  business_invitation:      { in_app: 'required',     email: 'required',    push: 'conditional', sms: 'prohibited' },
  security_event:            { in_app: 'required',     email: 'required',    push: 'required',   sms: 'prohibited' },
  calendar_event_created:     { in_app: 'required',     email: 'conditional', push: 'conditional', sms: 'prohibited' },
  calendar_event_invited:     { in_app: 'required',     email: 'conditional', push: 'conditional', sms: 'prohibited' },
  calendar_event_updated:     { in_app: 'required',     email: 'conditional', push: 'conditional', sms: 'prohibited' },
  calendar_event_rescheduled: { in_app: 'required',     email: 'conditional', push: 'conditional', sms: 'prohibited' },
  calendar_event_cancelled:   { in_app: 'required',     email: 'conditional', push: 'conditional', sms: 'prohibited' },
  calendar_invitation_removed:{ in_app: 'required',     email: 'conditional', push: 'conditional', sms: 'prohibited' },
  calendar_reminder:         { in_app: 'conditional',  email: 'conditional', push: 'required',   sms: 'prohibited' },
  message_received:          { in_app: 'required',     email: 'conditional', push: 'conditional', sms: 'prohibited' },
  message_request_received:  { in_app: 'required',     email: 'conditional', push: 'conditional', sms: 'prohibited' },
  message_request_accepted:  { in_app: 'conditional',  email: 'conditional', push: 'prohibited',  sms: 'prohibited' },
  message_request_declined:  { in_app: 'conditional',  email: 'conditional', push: 'prohibited',  sms: 'prohibited' },
};

export function resolveDeliveryPolicy(eventType, channel) {
  const policy = DELIVERY_POLICY[eventType];
  if (!policy) return 'prohibited';
  return policy[channel] || 'prohibited';
}

export function isQuietHours(prefs) {
  if (!prefs?.quiet_hours_enabled) return false;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = (prefs.quiet_hours_start || '22:00').split(':').map(Number);
  const [endH, endM] = (prefs.quiet_hours_end || '07:00').split(':').map(Number);
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;
  if (start < end) return currentMinutes >= start && currentMinutes < end;
  return currentMinutes >= start || currentMinutes < end;
}

// Create a notification record from an authoritative event.
export async function createNotification(event) {
  const {
    recipient_id, source_system, event_type, title, body,
    category, priority, action_url, action_label, group_key, source_id,
  } = event;

  // Load user preferences for conditional channel resolution
  let prefs = null;
  try {
    prefs = await getOrCreatePreferences(recipient_id);
  } catch { /* Preferences unavailable — conditional channels default to delivered */ }

  // Resolve delivery channels from policy + user preferences
  const channels = ['in_app', 'email', 'push', 'sms'].filter(ch => {
    const policy = resolveDeliveryPolicy(event_type, ch);
    if (policy === 'required') return true;
    if (policy === 'prohibited') return false;
    if (!prefs) return true;
    const prefKey = `${category || 'system'}_${ch}`;
    return prefs[prefKey] !== false;
  });

  const notificationData = {
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
  };

  let record;
  if (useFirebase) {
    // Server-only: call the createNotification Firebase Cloud Function
    record = await callCreateNotification(notificationData);
  } else {
    record = await base44.entities.NotificationRecord.create(notificationData);

    // Attempt email delivery (best-effort, isolated from source action)
    if (channels.includes('email')) {
      try {
        const user = await base44.entities.User.filter({ id: recipient_id });
        if (user.length > 0 && user[0].email) {
          await base44.integrations.Core.SendEmail({
            to: user[0].email,
            subject: title,
            body: body || title,
          });
        }
      } catch { /* Email delivery failed — notification record still exists */ }
    }
  }

  return record;
}

export async function getUnreadCount(identityId) {
  if (useFirebase) {
    const all = await notificationRepository.listNotificationsForRecipient(identityId, 500);
    return all.filter(n => !n.is_read).length;
  }
  const records = await base44.entities.NotificationRecord.filter({
    recipient_id: identityId,
    is_read: false,
  });
  return records.length;
}

export async function getNotifications(identityId, limit = 50) {
  if (useFirebase) return notificationRepository.listNotificationsForRecipient(identityId, limit);
  return base44.entities.NotificationRecord.filter(
    { recipient_id: identityId },
    '-created_date',
    limit
  );
}

export async function markAsRead(notificationId) {
  if (useFirebase) return notificationRepository.markRead(notificationId);
  return base44.entities.NotificationRecord.update(notificationId, {
    is_read: true,
    read_at: new Date().toISOString(),
  });
}

export async function markAllAsRead(identityId) {
  if (useFirebase) return notificationRepository.markAllRead(identityId);
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
  if (useFirebase) return settingsRepository.getOrCreateNotificationPreferences(identityId);
  const existing = await base44.entities.NotificationPreference.filter({ identity_id: identityId });
  if (existing.length > 0) return existing[0];
  return base44.entities.NotificationPreference.create({ identity_id: identityId });
}