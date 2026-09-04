// EventInvitationBadge — renders Accept/Decline (or Accepted/Declined
// status) for an invited event. Wraps InvitationActions with the
// participation-state lookup so every Calendar view can show invitation
// controls inline without duplicating the lookup logic.
//
// Returns null when the viewer is not invited (own event, assigned event,
// no participation record, or revoked). This makes it safe to drop into
// any event card — it simply renders nothing for non-invitation events.

import InvitationActions from './InvitationActions';
import { getParticipationState } from '@/lib/calendarParticipation';

export default function EventInvitationBadge({ event, participationMap, onResponse, compact = false }) {
  if (!participationMap) return null;
  const participationState = getParticipationState(event, participationMap);
  if (!participationState || participationState === 'revoked') return null;
  return (
    <div className="mt-1.5 pt-1.5 border-t border-stone-100">
      <InvitationActions
        event={event}
        participationState={participationState}
        onResponse={onResponse}
        compact={compact}
      />
    </div>
  );
}