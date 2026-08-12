// Notification creation — server-only
// ───────────────────────────────────────────────────────────
// Firestore security rules deny client-side notification creation
// (allow create: if false). This function creates notification
// records with service-account auth.
//
// Email delivery is deferred to a future notification-delivery phase.
// In-app delivery (the record itself) is immediate.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { randomUUID } from 'crypto';
import { db, allowedOrigins, getIdentityId } from './shared';

export const createNotification = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    // Any authenticated user can trigger a notification (e.g. message received).
    // The caller's identity is verified — we don't trust client-supplied sender info.
    await getIdentityId(request.auth.uid);

    const {
      recipient_id,
      source_system,
      event_type,
      title,
      body: notifBody,
      category,
      priority,
      delivery_channels,
      is_read,
      action_url,
      action_label,
      group_key,
      source_id,
    } = request.data || {};

    if (!recipient_id || !source_system || !event_type || !title) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required fields: recipient_id, source_system, event_type, title'
      );
    }

    const notificationId = randomUUID();
    const now = new Date().toISOString();

    const notificationData: Record<string, any> = {
      recipient_id,
      source_system,
      event_type,
      title,
      body: notifBody || '',
      category: category || 'system',
      priority: priority || 'normal',
      delivery_channels: delivery_channels || ['in_app'],
      is_read: is_read ?? false,
      action_url: action_url || null,
      action_label: action_label || null,
      group_key: group_key || null,
      source_id: source_id || null,
      _created_date: now,
      _updated_date: now,
    };

    await db.collection('notificationRecords').doc(notificationId).set(notificationData);

    return { id: notificationId, ...notificationData };
  }
);