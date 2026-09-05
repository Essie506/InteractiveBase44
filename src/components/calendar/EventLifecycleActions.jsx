// EventLifecycleActions — lifecycle + timeline controls for a calendar
// event, gated by the viewer's RELATIONSHIP to the event (V2 authority):
//
//   • Owner / creator / business manager (canEditEvent):
//     canonical event actions — Cancel, Mark Completed, Mark Skipped,
//     Archive, Delete — operating on the CANONICAL event lifecycle_state.
//
//   • Participant / attendee / non-owner (isParticipant):
//     PERSONAL timeline actions — Mark Completed, Mark Skipped,
//     Remove from my timeline — operating on the viewer's OWN
//     personal_lifecycle_state / hidden_from_timeline (stored on their
//     participation record). These NEVER alter the canonical event, the
//     organiser's lifecycle_state, or other participants.
//
// "Remove from my timeline" sets personal_lifecycle_state='archived' +
// hidden_from_timeline=true — the event disappears from THIS viewer's
// Calendar only. It is recoverable via the Calendar "Show hidden" filter.
//
// The server-side saveCalendarEvent (owner) / setPersonalTimelineState
// (participant) Cloud Functions remain the authoritative security boundary;
// this component only PRESENTS actions the viewer is authorised for.
import { Check, X, Archive, Trash2, Loader2, CalendarOff, EyeOff, RotateCcw } from 'lucide-react';
import {
  canEditEvent, canCancelEvent, canSetPersonalLifecycle, canDeleteEvent,
  canSetPersonalTimelineState, PERSONAL_LIFECYCLE_STATES,
} from '@/lib/calendarAuthority';
import { getPersonalTimelineState } from '@/lib/calendarParticipation';
import { isSourceUnavailable } from '@/lib/sourceUnavailable';

const PERSONAL_STATE_LABELS = {
  completed: 'Completed (by you)',
  skipped: 'Skipped (by you)',
  archived: 'Removed from your timeline',
};

export default function EventLifecycleActions({
  occ,
  user,
  participationMap,
  onSetLifecycle,
  onSetPersonalTimelineState,
  onDelete,
  onCancel,
  cancellingId,
  deletingId,
  personalStateLoadingId,
}) {
  if (!occ) return null;
  const event = occ.event || occ;
  if (!event || !user) return null;
  const unavailable = isSourceUnavailable(event);
  const isOwner = canEditEvent(event, user);
  const isPart = canSetPersonalTimelineState(event, user);

  // ── Owner: canonical event actions ──
  if (isOwner) {
    return (
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {canCancelEvent(event, user) && !unavailable && (
          <button
            onClick={() => onCancel?.(occ)}
            disabled={cancellingId === event.id}
            className="text-xs text-red-500 font-medium hover:text-red-600 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded"
          >
            {cancellingId === event.id
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Cancelling...</>
              : <><Trash2 className="w-3 h-3" /> Cancel</>}
          </button>
        )}
        {canSetPersonalLifecycle(event, user) && !PERSONAL_LIFECYCLE_STATES.includes(event.lifecycle_state) && !unavailable && (
          <span className="flex items-center gap-1">
            <button
              onClick={() => onSetLifecycle?.(occ, 'completed')}
              aria-label="Mark as completed"
              title="Mark as completed"
              className="p-1 text-stone-600 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onSetLifecycle?.(occ, 'skipped')}
              aria-label="Mark as skipped"
              title="Mark as skipped"
              className="p-1 text-stone-600 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onSetLifecycle?.(occ, 'archived')}
              aria-label="Archive event"
              title="Archive event"
              className="p-1 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          </span>
        )}
        {canDeleteEvent(event, user) && (
          <button
            onClick={() => onDelete?.(occ)}
            disabled={deletingId === event.id}
            className="text-xs text-red-500 font-medium hover:text-red-600 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded"
          >
            {deletingId === event.id
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Deleting...</>
              : <>Delete</>}
          </button>
        )}
        {isOwner && event.source_system === 'booking' && event.lifecycle_state !== 'cancelled' && event.lifecycle_state !== 'removed' && (
          <span className="text-xs text-stone-400 flex items-center gap-1">
            <CalendarOff className="w-3 h-3" /> Cancel via Bookings
          </span>
        )}
      </div>
    );
  }

  // ── Participant: personal timeline actions (non-owner) ──
  // Personal state is separate from the canonical event lifecycle_state.
  // A participant can independently record completed/skipped/archived
  // without rewriting the organiser's state. "Remove from my timeline"
  // archives + hides the event from this viewer's Calendar only.
  if (isPart && !unavailable) {
    const personalState = getPersonalTimelineState(event, participationMap);
    const loading = personalStateLoadingId === event.id;
    return (
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {personalState ? (
          <>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 font-medium">
              {PERSONAL_STATE_LABELS[personalState] || personalState}
            </span>
            <button
              onClick={() => onSetPersonalTimelineState?.(occ, null, false)}
              disabled={loading}
              aria-label="Clear personal state"
              title="Clear personal state"
              className="p-1 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            </button>
          </>
        ) : (
          <span className="flex items-center gap-1">
            <button
              onClick={() => onSetPersonalTimelineState?.(occ, 'completed', false)}
              disabled={loading}
              aria-label="Mark as completed (personal)"
              title="Mark as completed (your own tracking)"
              className="p-1 text-stone-600 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => onSetPersonalTimelineState?.(occ, 'skipped', false)}
              disabled={loading}
              aria-label="Mark as skipped (personal)"
              title="Mark as skipped (your own tracking)"
              className="p-1 text-stone-600 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onSetPersonalTimelineState?.(occ, 'archived', true)}
              disabled={loading}
              aria-label="Remove from my timeline"
              title="Remove from my timeline (hides this event from your calendar only)"
              className="p-1 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded transition-colors disabled:opacity-50 flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>
          </span>
        )}
      </div>
    );
  }

  return null;
}