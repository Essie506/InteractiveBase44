// Calendar Participation — invitation response lifecycle (V2 Phase 3).
// ───────────────────────────────────────────────────────────
// V2 requires an explicit distinction between:
//   - being invited (event visible, response_state 'pending')
//   - accepting participation (response_state 'accepted')
//   - declining participation (response_state 'declined')
//   - invitation removal/revocation (response_state 'revoked', identity
//     removed from invited_identity_ids)
//
// Participation state is SEPARATE from the event's lifecycle_state. The
// event's schedule state (scheduled, cancelled, etc.) is never modified
// by an invitation response. One authoritative Calendar Event remains;
// no per-user event copies are created.
//
// A shared event appears in an invitee's Calendar because they are in
// invited_identity_ids (visibility). The participation record tracks
// their response. An invitee who has not responded sees a pending
// invitation with Accept/Decline actions — they do NOT silently become
// an accepted participant merely because the event is visible.
//
// Declining does NOT cancel/delete the organiser's event. The event
// remains visible to the invitee (so they can change their mind) but
// shows a 'declined' indicator.
//
// Revocation removes the identity from invited_identity_ids (loss of
// visibility) and sets the participation record to 'revoked'. The
// event is no longer visible to that identity.
//
// Notifications: Calendar emits semantic source events to the
// Notifications dispatcher. It does NOT send email directly.
//   - accept/decline → calendar_participation_accepted/declined → organiser
//   - revoke → calendar_invitation_removed → invitee

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId, hasBusinessCalendarPermission } from './shared';
import { emitNotification } from './notifications/dispatcher';
import { buildCalendarEmailPayload, CalendarEmailContext, CalendarEventType } from './notifications/email/payloads/calendar';
import { appendScheduleHistory } from './calendarEventHistory';

const EVENTS = 'calendarEvents';
const PARTICIPATION = 'calendarParticipation';

// Deterministic participation doc ID: {event_id}__{identity_id}
export function participationDocId(eventId: string, identityId: string): string {
  return `${eventId}__${identityId}`;
}

// ── Create / sync participation records ──────────────────────
// Called by saveCalendarEvent when invitees are added. Creates
// 'pending' participation records for new invitees (idempotent —
// deterministic doc ID + merge). Does NOT overwrite existing
// accepted/declined records (respects prior responses).
export async function syncParticipationRecords(
  eventId: string,
  invitedIdentityIds: string[],
  invitedAtIso: string,
): Promise<void> {
  for (const identityId of invitedIdentityIds) {
    if (!identityId) continue;
    const docId = participationDocId(eventId, identityId);
    const ref = db.collection(PARTICIPATION).doc(docId);
    const existing = await ref.get();
    // Only create if not already present. Do NOT overwrite an
    // accepted/declined/revoked record — respect prior responses.
    if (!existing.exists) {
      await ref.set({
        event_id: eventId,
        identity_id: identityId,
        response_state: 'pending',
        invited_at: invitedAtIso,
        responded_at: null,
        revoked_at: null,
        revoked_by: null,
        source_system: 'calendar',
        _created_date: invitedAtIso,
        _updated_date: invitedAtIso,
      });
    }
  }
}

// ── Mark participation as revoked when invitee is removed ────
// Called by saveCalendarEvent when invitees are removed from
// invited_identity_ids. Sets response_state to 'revoked' and
// records the revoker. Does NOT delete the record (audit trail).
export async function revokeParticipationRecords(
  eventId: string,
  removedIdentityIds: string[],
  revokedBy: string,
  revokedAtIso: string,
): Promise<void> {
  for (const identityId of removedIdentityIds) {
    if (!identityId) continue;
    const docId = participationDocId(eventId, identityId);
    await db.collection(PARTICIPATION).doc(docId).set({
      response_state: 'revoked',
      revoked_at: revokedAtIso,
      revoked_by: revokedBy,
      _updated_date: revokedAtIso,
    }, { merge: true });
  }
}

// ── respondCalendarInvitation ───────────────────────────────
// Accept or decline an invitation. Called by the invited identity.
// Updates the participation record ONLY — does NOT modify the event.
// Emits a notification to the organiser (participant response).
//
// Request: { event_id, response: 'accepted' | 'declined' }
// Returns: { response_state, responded_at }
export const respondCalendarInvitation = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await getIdentityId(request.auth.uid);
    const { event_id, response } = request.data || {};

    if (!event_id) {
      throw new HttpsError('invalid-argument', 'event_id is required');
    }
    if (response !== 'accepted' && response !== 'declined') {
      throw new HttpsError('invalid-argument', "response must be 'accepted' or 'declined'");
    }

    // ── Verify the event exists ──
    const eventSnap = await db.collection(EVENTS).doc(event_id).get();
    if (!eventSnap.exists) {
      throw new HttpsError('not-found', 'Calendar event not found');
    }
    const event = eventSnap.data()!;

    // ── Verify caller is invited ──
    const invitedIds = event.invited_identity_ids || [];
    if (!invitedIds.includes(callerIdentityId)) {
      throw new HttpsError(
        'permission-denied',
        'You are not invited to this event',
      );
    }

    // ── Verify the participation record exists and is pending ──
    const partDocId = participationDocId(event_id, callerIdentityId);
    const partSnap = await db.collection(PARTICIPATION).doc(partDocId).get();
    if (!partSnap.exists) {
      // Defensive: create a pending record if it doesn't exist (e.g.
      // pre-participation-model events). This is idempotent.
      await db.collection(PARTICIPATION).doc(partDocId).set({
        event_id,
        identity_id: callerIdentityId,
        response_state: 'pending',
        invited_at: event._created_date || new Date().toISOString(),
        responded_at: null,
        revoked_at: null,
        revoked_by: null,
        source_system: 'calendar',
        _created_date: event._created_date || new Date().toISOString(),
        _updated_date: new Date().toISOString(),
      });
    }
    const partData = partSnap.exists ? partSnap.data()! : { response_state: 'pending' };

    // Cannot respond to a revoked invitation
    if (partData.response_state === 'revoked') {
      throw new HttpsError('failed-precondition', 'This invitation has been revoked');
    }

    // ── Update the participation record ──
    const nowIso = new Date().toISOString();
    await db.collection(PARTICIPATION).doc(partDocId).set({
      response_state: response,
      responded_at: nowIso,
      _updated_date: nowIso,
    }, { merge: true });

    // ── Emit notification to the organiser ──
    // Calendar owns the event; the organiser is created_by_id (or
    // owner_id for identity-owned events). The notification is a
    // semantic source event — the dispatcher handles delivery.
    const organiserId = event.created_by_id || event.owner_id;
    if (organiserId && organiserId !== callerIdentityId) {
      const eventType: CalendarEventType =
        response === 'accepted'
          ? 'calendar_participation_accepted'
          : 'calendar_participation_declined';

      const emailCtx: CalendarEmailContext = {
        eventTitle: event.title || 'Event',
        hostDisplayName: null,
        dateLabel: new Date(event.start_time).toLocaleDateString('en-GB', {
          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
          timeZone: event.timezone || 'UTC',
        }),
        timeLabel: event.all_day
          ? 'All day'
          : new Date(event.start_time).toLocaleTimeString('en-GB', {
              hour: '2-digit', minute: '2-digit', timeZone: event.timezone || 'UTC',
            }),
        timezone: event.timezone || 'UTC',
        safeLocationLabel: null,
        eventLink: `/calendar?event=${event_id}`,
        eventType,
      };

      await emitNotification({
        source_system: 'calendar',
        event_type: eventType,
        source_id: `cal_response:${event_id}:${callerIdentityId}:${response}`,
        version: '1',
        category: 'calendar',
        title: response === 'accepted'
          ? `Invitation accepted for "${event.title || 'Event'}"`
          : `Invitation declined for "${event.title || 'Event'}"`,
        body: response === 'accepted'
          ? 'A participant accepted your calendar invitation.'
          : 'A participant declined your calendar invitation.',
        action_url: `/calendar?event=${event_id}`,
        action_label: 'View Event',
        recipient_id: organiserId,
        recipient_email: null,
        emailContext: emailCtx,
        emailPayloadBuilder: buildCalendarEmailPayload,
      });
    }

    // ── Append schedule history (participant change) ──
    await appendScheduleHistory({
      event_id,
      change_type: response === 'accepted' ? 'participant_added' : 'participant_removed',
      previous_start_time: event.start_time || null,
      previous_end_time: event.end_time || null,
      new_start_time: event.start_time || null,
      new_end_time: event.end_time || null,
      changed_at: nowIso,
      actor_id: callerIdentityId,
      source_system: 'calendar',
    });

    return { response_state: response, responded_at: nowIso };
  },
);

// ── revokeCalendarInvitation ────────────────────────────────
// Revoke an invitation. Called by the organiser (creator/owner/
// business manager). Removes the identity from invited_identity_ids
// (loss of visibility) and sets the participation record to 'revoked'.
// Does NOT cancel/delete the event. Emits a notification to the invitee.
//
// Request: { event_id, identity_id }
// Returns: { revoked: true }
export const revokeCalendarInvitation = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await getIdentityId(request.auth.uid);
    const { event_id, identity_id } = request.data || {};

    if (!event_id || !identity_id) {
      throw new HttpsError('invalid-argument', 'event_id and identity_id are required');
    }

    // ── Load the event ──
    const eventSnap = await db.collection(EVENTS).doc(event_id).get();
    if (!eventSnap.exists) {
      throw new HttpsError('not-found', 'Calendar event not found');
    }
    const event = eventSnap.data()!;

    // ── Permission: creator, identity owner, or business calendar manager ──
    const isCreator = event.created_by_id === callerIdentityId;
    const isIdentityOwner =
      event.owner_type === 'identity' && event.owner_id === callerIdentityId;
    let isBizManager = false;
    if (event.owner_type === 'business' && event.business_id) {
      isBizManager = await hasBusinessCalendarPermission(event.business_id, callerIdentityId);
    }
    if (!isCreator && !isIdentityOwner && !isBizManager) {
      throw new HttpsError('permission-denied', 'Not authorised to revoke invitations for this event');
    }

    // ── Remove the identity from invited_identity_ids ──
    const currentInvited = event.invited_identity_ids || [];
    if (!currentInvited.includes(identity_id)) {
      // Already not invited — idempotent no-op
      return { revoked: true };
    }
    const updatedInvited = currentInvited.filter((id: string) => id !== identity_id);
    const nowIso = new Date().toISOString();
    await db.collection(EVENTS).doc(event_id).set({
      invited_identity_ids: updatedInvited,
      _updated_date: nowIso,
    }, { merge: true });

    // ── Revoke the participation record ──
    const partDocId = participationDocId(event_id, identity_id);
    await db.collection(PARTICIPATION).doc(partDocId).set({
      response_state: 'revoked',
      revoked_at: nowIso,
      revoked_by: callerIdentityId,
      _updated_date: nowIso,
    }, { merge: true });

    // ── Emit notification to the invitee ──
    await emitNotification({
      source_system: 'calendar',
      event_type: 'calendar_invitation_removed',
      source_id: `cal_revoke:${event_id}:${identity_id}`,
      version: nowIso,
      category: 'calendar',
      title: `You were removed from "${event.title || 'Event'}"`,
      body: 'You were removed from this calendar event.',
      action_url: null,
      action_label: null,
      recipient_id: identity_id,
      recipient_email: null,
      emailContext: {
        eventTitle: event.title || 'Event',
        hostDisplayName: null,
        dateLabel: new Date(event.start_time).toLocaleDateString('en-GB', {
          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
          timeZone: event.timezone || 'UTC',
        }),
        timeLabel: event.all_day
          ? 'All day'
          : new Date(event.start_time).toLocaleTimeString('en-GB', {
              hour: '2-digit', minute: '2-digit', timeZone: event.timezone || 'UTC',
            }),
        timezone: event.timezone || 'UTC',
        safeLocationLabel: null,
        eventLink: `/calendar?event=${event_id}`,
        eventType: 'calendar_invitation_removed',
      },
      emailPayloadBuilder: buildCalendarEmailPayload,
    });

    // ── Append schedule history ──
    await appendScheduleHistory({
      event_id,
      change_type: 'participant_removed',
      previous_start_time: event.start_time || null,
      previous_end_time: event.end_time || null,
      new_start_time: event.start_time || null,
      new_end_time: event.end_time || null,
      changed_at: nowIso,
      actor_id: callerIdentityId,
      source_system: 'calendar',
    });

    return { revoked: true };
  },
);