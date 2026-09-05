// Calendar Participation — client-side helpers (V2 Phase 3).
// ───────────────────────────────────────────────────────────
// Participation state is SEPARATE from the event's lifecycle_state.
// These helpers load participation records and call the server-side
// cloud functions for accept/decline/revoke. Clients cannot write
// participation records directly (Firestore rules deny it).
//
// In Firebase mode, reads go through the Firebase repository and
// writes go through cloud functions. In non-Firebase mode, reads use
// the Base44 SDK and writes are not supported (no canonical writer).

import { base44 } from '@/api/base44Client';
import { useFirebase } from '@/lib/backendConfig';
import {
  callGetCalendarView,
  callRespondCalendarInvitation,
  callRevokeCalendarInvitation,
} from '@/services/firebaseFunctions';

// ── Load participation records for a set of events ─────────
// Returns a Map: event_id → participation record (for the current user).
// In Firebase mode, the direct calendarParticipation query is not
// rule-validatable (get()-derived identity), so we reuse the authoritative
// getCalendarView callable which returns the caller's own participation
// records alongside the event set.
export async function loadParticipationForEvents(identityId, eventIds) {
  if (!identityId || !eventIds || eventIds.length === 0) return new Map();

  if (useFirebase) {
    const result = await callGetCalendarView({});
    const records = Array.isArray(result.participation) ? result.participation : [];
    const eventIdSet = new Set(eventIds);
    return new Map(
      records
        .filter((p) => eventIdSet.has(p.event_id))
        .map((p) => [p.event_id, p]),
    );
  }

  // Non-Firebase: use Base44 SDK
  const records = await base44.entities.CalendarParticipation.filter({
    identity_id: identityId,
  });
  const eventIdSet = new Set(eventIds);
  return new Map(
    records
      .filter((p) => eventIdSet.has(p.event_id))
      .map((p) => [p.event_id, p]),
  );
}

// ── Load all participation records for an identity ─────────
// Used for pending-invitation counts and notification badges.
export async function loadAllParticipationForIdentity(identityId) {
  if (!identityId) return [];

  if (useFirebase) {
    const result = await callGetCalendarView({});
    return Array.isArray(result.participation) ? result.participation : [];
  }

  return base44.entities.CalendarParticipation.filter({ identity_id: identityId });
}

// ── Accept an invitation ────────────────────────────────────
// Calls the server-side respondCalendarInvitation function.
// Does NOT modify the event — only the participation record.
export async function acceptInvitation(eventId) {
  if (useFirebase) {
    return callRespondCalendarInvitation({ event_id: eventId, response: 'accepted' });
  }
  throw new Error('Participation responses require Firebase mode');
}

// ── Decline an invitation ───────────────────────────────────
// Calls the server-side respondCalendarInvitation function.
// Does NOT cancel the event — only updates the participation record.
export async function declineInvitation(eventId) {
  if (useFirebase) {
    return callRespondCalendarInvitation({ event_id: eventId, response: 'declined' });
  }
  throw new Error('Participation responses require Firebase mode');
}

// ── Revoke an invitation (organiser) ────────────────────────
// Removes the identity from the event's invited_identity_ids and
// sets the participation record to 'revoked'. The invitee loses
// visibility of the event.
export async function revokeInvitation(eventId, identityId) {
  if (useFirebase) {
    return callRevokeCalendarInvitation({ event_id: eventId, identity_id: identityId });
  }
  throw new Error('Invitation revocation requires Firebase mode');
}

// ── Get pending invitation count ────────────────────────────
// Returns the number of pending (unresponded) invitations for an identity.
export async function getPendingInvitationCount(identityId) {
  const all = await loadAllParticipationForIdentity(identityId);
  return all.filter((p) => p.response_state === 'pending').length;
}

// ── Helper: classify an event's participation state for the viewer ──
// Given an event and a participation map, returns the viewer's
// participation state for that event.
export function getParticipationState(event, participationMap) {
  if (!event || !participationMap) return null;
  return participationMap.get(event.id)?.response_state || null;
}

// ── Helper: is this event one the viewer was invited to? ───
export function isInvitedEvent(event, identityId) {
  if (!event || !identityId) return false;
  const invited = event.invited_identity_ids || [];
  return invited.includes(identityId);
}