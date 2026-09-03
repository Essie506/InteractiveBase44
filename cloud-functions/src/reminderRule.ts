// Reminder Rule CRUD — trusted Cloud Functions (§59–§63).
// ───────────────────────────────────────────────────────────
// Clients cannot write reminderRules directly (Firestore rules deny it).
// These callable functions validate that the caller is a participant of
// the event before creating/updating/deleting a reminder rule.
//
// A participant is: the identity owner, an assigned identity, an invited
// identity, or (for business events) a business member.
//
// The reminder sweep (reminderSweep.ts) reads these rules to emit
// calendar.reminder.due notifications with idempotency.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId, hasBusinessRole } from './shared';

// ── saveReminderRule ─────────────────────────────────────────
// Creates or updates a reminder rule for the caller on an event.
//
// Request: { event_id, offset_minutes?, delivery_channels?, is_active?, rule_id? }
// Returns: { rule_id }
export const saveReminderRule = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const callerIdentityId = await getIdentityId(request.auth.uid);
    const { event_id, offset_minutes, delivery_channels, is_active, rule_id } = request.data || {};

    if (!event_id) throw new HttpsError('invalid-argument', 'event_id is required');

    // Validate event exists and caller is a participant
    const eventDoc = await db.collection('calendarEvents').doc(event_id).get();
    if (!eventDoc.exists) throw new HttpsError('not-found', 'Event not found');
    const event = eventDoc.data()!;

    const isOwner = event.owner_type === 'identity' && event.owner_id === callerIdentityId;
    const isAssigned = Array.isArray(event.assigned_identity_ids) && event.assigned_identity_ids.includes(callerIdentityId);
    const isInvited = Array.isArray(event.invited_identity_ids) && event.invited_identity_ids.includes(callerIdentityId);
    let isBusinessMember = false;
    if (event.owner_type === 'business' && event.business_id) {
      isBusinessMember = await hasBusinessRole(event.business_id, callerIdentityId, ['owner', 'admin', 'staff', 'member']);
    }
    if (!isOwner && !isAssigned && !isInvited && !isBusinessMember) {
      throw new HttpsError('permission-denied', 'Not a participant of this event');
    }

    const nowIso = new Date().toISOString();
    const channels = Array.isArray(delivery_channels) && delivery_channels.length > 0
      ? delivery_channels.filter((c: string) => ['in_app', 'email', 'push'].includes(c))
      : ['in_app', 'email'];
    const offset = typeof offset_minutes === 'number' ? Math.max(0, offset_minutes) : 30;

    if (rule_id) {
      // Update existing — verify ownership
      const ruleDoc = await db.collection('reminderRules').doc(rule_id).get();
      if (!ruleDoc.exists) throw new HttpsError('not-found', 'Reminder rule not found');
      if (ruleDoc.data()!.identity_id !== callerIdentityId) {
        throw new HttpsError('permission-denied', 'Not your reminder');
      }
      await ruleDoc.ref.update({
        offset_minutes: offset,
        delivery_channels: channels,
        is_active: is_active !== false,
        _updated_date: nowIso,
      });
      return { rule_id };
    }

    // Create new
    const ruleRef = db.collection('reminderRules').doc();
    await ruleRef.set({
      event_id,
      identity_id: callerIdentityId,
      offset_minutes: offset,
      delivery_channels: channels,
      is_active: is_active !== false,
      last_dispatched_occurrence: null,
      _created_date: nowIso,
      _updated_date: nowIso,
    });
    return { rule_id: ruleRef.id };
  },
);

// ── deleteReminderRule ──────────────────────────────────────
// Deletes a reminder rule. Only the rule owner can delete it.
//
// Request: { rule_id }
// Returns: { deleted: true }
export const deleteReminderRule = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const callerIdentityId = await getIdentityId(request.auth.uid);
    const { rule_id } = request.data || {};

    if (!rule_id) throw new HttpsError('invalid-argument', 'rule_id is required');

    const ruleDoc = await db.collection('reminderRules').doc(rule_id).get();
    if (!ruleDoc.exists) throw new HttpsError('not-found', 'Reminder rule not found');
    if (ruleDoc.data()!.identity_id !== callerIdentityId) {
      throw new HttpsError('permission-denied', 'Not your reminder');
    }

    await ruleDoc.ref.delete();
    return { deleted: true };
  },
);

// ── listReminderRules ───────────────────────────────────────
// Lists the caller's active reminder rules for an event.
//
// Request: { event_id }
// Returns: { rules: Array<{id, ...}> }
export const listReminderRules = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const callerIdentityId = await getIdentityId(request.auth.uid);
    const { event_id } = request.data || {};

    if (!event_id) throw new HttpsError('invalid-argument', 'event_id is required');

    const snap = await db.collection('reminderRules')
      .where('event_id', '==', event_id)
      .where('identity_id', '==', callerIdentityId)
      .get();

    return {
      rules: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    };
  },
);