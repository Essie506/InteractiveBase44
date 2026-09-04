// InvitationActions — Accept/Decline UI for pending calendar invitations.
// ───────────────────────────────────────────────────────────
// V2 Phase 3: An invited identity sees a pending invitation with
// Accept/Decline actions. They do NOT silently become an accepted
// participant merely because the event is visible in their Calendar.
//
// This component renders inline within calendar event cards. It shows:
//   - pending: Accept and Decline buttons
//   - accepted: green "Accepted" badge
//   - declined: muted "Declined" badge
//   - revoked: not shown (the event is no longer visible)
//   - null (own event): not shown (the viewer is the organiser)

import { useState } from 'react';
import { Check, X, Loader2, UserCheck, UserX } from 'lucide-react';
import { acceptInvitation, declineInvitation } from '@/lib/calendarParticipation';
import { useToast } from '@/components/ui/use-toast';

export default function InvitationActions({ event, participationState, onResponse, compact = false }) {
  const [responding, setResponding] = useState(false);
  const { toast } = useToast();

  // Don't render if the viewer is not invited (own event, assigned event, etc.)
  if (!participationState || participationState === 'revoked') return null;

  const handleAccept = async () => {
    setResponding(true);
    try {
      await acceptInvitation(event.id);
      toast({ title: 'Invitation accepted', description: `"${event.title}" added to your calendar.` });
      if (onResponse) onResponse(event.id, 'accepted');
    } catch (err) {
      toast({
        title: 'Could not accept invitation',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setResponding(false);
    }
  };

  const handleDecline = async () => {
    setResponding(true);
    try {
      await declineInvitation(event.id);
      toast({ title: 'Invitation declined', description: `"${event.title}" remains visible but marked as declined.` });
      if (onResponse) onResponse(event.id, 'declined');
    } catch (err) {
      toast({
        title: 'Could not decline invitation',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setResponding(false);
    }
  };

  if (participationState === 'accepted') {
    return (
      <div className={`inline-flex items-center gap-1 ${compact ? 'text-[10px]' : 'text-xs'} text-emerald-600 font-medium`}>
        <UserCheck className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} aria-hidden="true" />
        <span>Accepted</span>
      </div>
    );
  }

  if (participationState === 'declined') {
    return (
      <div className={`inline-flex items-center gap-1 ${compact ? 'text-[10px]' : 'text-xs'} text-stone-400 font-medium`}>
        <UserX className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} aria-hidden="true" />
        <span>Declined</span>
      </div>
    );
  }

  // pending — show Accept/Decline buttons
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleAccept}
        disabled={responding}
        aria-label={`Accept invitation to ${event.title || 'event'}`}
        className={`inline-flex items-center gap-1 ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'} bg-emerald-600 text-white rounded font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500`}
      >
        {responding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        <span>Accept</span>
      </button>
      <button
        onClick={handleDecline}
        disabled={responding}
        aria-label={`Decline invitation to ${event.title || 'event'}`}
        className={`inline-flex items-center gap-1 ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'} bg-stone-200 text-stone-700 rounded font-medium hover:bg-stone-300 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400`}
      >
        <X className="w-3 h-3" />
        <span>Decline</span>
      </button>
    </div>
  );
}