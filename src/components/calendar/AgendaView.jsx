// Agenda view — chronological scrolling list (§20).
// Consumes the shared normalized occurrence model. Paginates by
// loading more occurrences as the user scrolls.

import { Clock, MapPin, CalendarOff, ChevronRight } from 'lucide-react';
import { formatTimeRange, formatDate } from '@/lib/calendar';

export default function AgendaView({ occurrences, timezone, onSelectEvent, selectedDate }) {
  // Group by date
  const byDate = new Map();
  for (const occ of occurrences) {
    const event = occ.event;
    let dateKey;
    let dateLabel;
    if (event.all_day) {
      dateKey = occ.start.slice(0, 10);
      dateLabel = formatDate(occ.start, timezone);
    } else {
      const d = new Date(occ.start);
      dateKey = d.toDateString();
      dateLabel = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    if (!byDate.has(dateKey)) byDate.set(dateKey, { label: dateLabel, items: [] });
    byDate.get(dateKey).items.push(occ);
  }

  const groups = Array.from(byDate.entries()).sort((a, b) => {
    return new Date(a[1].items[0].start) - new Date(b[1].items[0].start);
  });

  if (groups.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-8">
        <div className="flex flex-col items-center justify-center py-8">
          <CalendarOff className="w-8 h-8 text-stone-300 mb-2" />
          <p className="text-sm text-stone-400">No upcoming events</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      {groups.map(([dateKey, group]) => (
        <div key={dateKey}>
          <div className="px-4 py-2 bg-stone-50 border-b border-stone-100">
            <h4 className="text-sm font-semibold text-stone-700">{group.label}</h4>
          </div>
          <div className="divide-y divide-stone-50">
            {group.items.map(occ => (
              <div
                key={occ.occurrenceId}
                onClick={() => onSelectEvent(occ)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 cursor-pointer transition-colors"
              >
                <div className={`w-1 h-10 rounded-full ${
                  occ.event.source_system === 'booking' ? 'bg-emerald-400' :
                  occ.isRecurring ? 'bg-purple-400' : 'bg-indigo-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-medium text-stone-800 truncate">{occ.event.title}</span>
                    {occ.event.lifecycle_state === 'cancelled' && <span className="text-xs text-red-500">Cancelled</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-stone-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {occ.event.all_day ? 'All day' : formatTimeRange(occ.start, occ.end, occ.event.timezone || timezone)}
                    </span>
                    {occ.event.location_type !== 'physical' && occ.event.meeting_url && (
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">{occ.event.meeting_url}</span>
                      </span>
                    )}
                    {occ.isRecurring && (
                      <span className="text-purple-500">Recurring{occ.isException ? ' (modified)' : ''}</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-300" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}