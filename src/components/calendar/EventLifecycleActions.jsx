// EventLifecycleActions — reusable lifecycle + delete controls for a
// calendar event (§16 personal lifecycle, §52 delete, cancel). Extracted
// from the Calendar month-view panel so the SAME controls render in every
// view (Today/Week/Day/Agenda/Month) without duplicating the authority
// gates or handlers.
//
// Authority is NOT loosened: the same canEditEvent / canSetPersonalLifecycle
// / canDeleteEvent / canCancelEvent gates apply, and the same canonical
// handlers (handleSetLifecycle / handleDeleteEvent / handleCancelEvent)
// are invoked. The server-side saveCalendarEvent / deleteCalendarEvent
// Cloud Functions remain the authoritative security boundary.
import { Check, X, Archive, Trash2, Loader2, CalendarOff } from 'lucide-react';
import { canEditEvent, canCancelEvent, canSetPersonalLifecycle, canDeleteEvent, PERSONAL_LIFECYCLE_STATES } from '@/lib/calendarAuthority';
import { isSourceUnavailable } from '@/lib/sourceUnavailable';

export default function EventLifecycleActions({ occ, user, onSetLifecycle, onDelete, onCancel, cancellingId, deletingId }) {
  if (!occ) return null;
  const event = occ.event || occ;
  if (!event || !user) return null;
  const unavailable = isSourceUnavailable(event);

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
      {canEditEvent(event, user) && event.source_system === 'booking' && event.lifecycle_state !== 'cancelled' && event.lifecycle_state !== 'removed' && (
        <span className="text-xs text-stone-400 flex items-center gap-1">
          <CalendarOff className="w-3 h-3" /> Cancel via Bookings
        </span>
      )}
    </div>
  );
}