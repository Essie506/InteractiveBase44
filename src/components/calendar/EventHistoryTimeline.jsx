// Event History Timeline (§48, §104, §105).
// ───────────────────────────────────────────────────────────
// Read-only schedule-change timeline. Readable by anyone authorised to
// read the parent event (firestore.rules: canReadCalendarEvent). Writable
// only by the canonical saveCalendarEvent / deleteCalendarEvent Cloud
// Functions (appendScheduleHistory).
//
// Used by both EventDetailModal (non-editor viewers) and EventModal
// (editors) so the auditable history is accessible to anyone who can
// open the event.

import { useState, useEffect } from 'react';
import { History, Loader2, Clock } from 'lucide-react';
import { getEventHistory, formatTimeRange, formatDate } from '@/lib/calendar';

const CHANGE_LABELS = {
  created: 'Created',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled',
  deleted: 'Deleted',
  participant_added: 'Participant added',
  participant_removed: 'Participant removed',
};

export default function EventHistoryTimeline({ eventId, timezone, collapsed = false }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(!collapsed);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const h = await getEventHistory(eventId);
        if (!cancelled) setHistory(h);
      } catch {
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-stone-500">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        Loading history…
      </div>
    );
  }

  if (history.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-medium text-stone-700 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
        aria-expanded={open}
      >
        <History className="w-4 h-4 text-stone-500" aria-hidden="true" />
        Schedule history
        <span className="text-xs text-stone-400">({history.length})</span>
      </button>

      {open && (
        <ol className="space-y-2 pl-2 border-l border-stone-200">
          {history.map((entry, idx) => {
            const label = CHANGE_LABELS[entry.change_type] || entry.change_type || 'Updated';
            const when = entry.changed_at || entry._created_date;
            return (
              <li key={entry.id || idx} className="relative pl-4">
                <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-stone-300" aria-hidden="true" />
                <div className="text-sm font-medium text-stone-700">{label}</div>
                {when && (
                  <div className="text-xs text-stone-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" aria-hidden="true" />
                    <time dateTime={when}>{new Date(when).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</time>
                  </div>
                )}
                {entry.change_type === 'rescheduled' && entry.previous_start_time && entry.new_start_time && (
                  <div className="text-xs text-stone-500 mt-0.5">
                    <span className="line-through">{formatDate(entry.previous_start_time, timezone)} {formatTimeRange(entry.previous_start_time, entry.previous_end_time, timezone)}</span>
                    {' → '}
                    <span>{formatDate(entry.new_start_time, timezone)} {formatTimeRange(entry.new_start_time, entry.new_end_time, timezone)}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}