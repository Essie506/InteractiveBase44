import {
  getAccessToken,
  getProjectId,
  toFirestoreFields,
  firestoreBatchWrite,
  docPath,
} from '../../shared/firebaseAdmin.ts';

// ───────────────────────────────────────────────────────────
// CreateNotification — Server-only notification creation
// ───────────────────────────────────────────────────────────
// Firestore security rules deny client-side notification creation
// (allow create: if false). This function creates notification
// records with service-account auth.
//
// Email delivery is deferred to a future notification-delivery
// migration phase. In-app delivery (the record itself) is immediate.

export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json();
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
    } = body;

    if (!recipient_id || !source_system || !event_type || !title) {
      return Response.json(
        { error: 'Missing required fields: recipient_id, source_system, event_type, title' },
        { status: 400 }
      );
    }

    const token = await getAccessToken();
    const projectId = getProjectId();
    const notificationId = crypto.randomUUID();

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
      _created_date: new Date().toISOString(),
      _updated_date: new Date().toISOString(),
    };

    await firestoreBatchWrite(projectId, [{
      name: docPath(projectId, 'notificationRecords', notificationId),
      fields: toFirestoreFields(notificationData),
    }], token);

    return Response.json({ id: notificationId, ...notificationData });
  } catch (error) {
    return Response.json(
      { error: error.message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}