// Day view — single-day timeline (§19).
// Consumes the shared normalized occurrence model.

import { Clock, MapPin, CalendarOff } from 'lucide-react';
import { formatTimeRange } from '@/lib/calendar';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function DayView({ occurrences, date, timezone, onSelectEvent }) {
  const dateStr = date.toDateString();
  const isoDate = date.toISOString().split('T')[0];

  const dayOccurrences = occurrences.filter((occ) => {
    if (occ.event.all_day) return occ.start.slice(0, 10) === isoDate;
    return new Date(occ.start).toDateString() === dateStr;
  });

  const allDayOccs = dayOccurrences.filter(o => o.event.all_day);
  const timedOccs = dayOccurrences.filter(o => !o.event.all_day);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-stone-200">
        <h3 className="text-lg font-semibold text-stone-800">
          {date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </h3>
        <p className="text-sm text-stone-500 mt-0.5">{dayOccurrences.length} event{dayOccurrences.length !== 1 ? 's' : ''}</p>
      </div>

      {/* All-day events */}
      {allDayOccs.length > 0 && (
        <div className="p-3 border-b border-stone-200 bg-amber-50">
          <div className="text-xs font-medium text-amber-700 mb-1.5">All day</div>
          <div className="space-y-1">
            {allDayOccs.map(occ => (
              <div
                key={occ.occurrenceId}
                onClick={() => onSelectEvent(occ)}
                className="text-sm px-2 py-1.5 bg-amber-100 text-amber-800 rounded cursor-pointer hover:bg-amber-200"
              >
                {occ.event.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timed events */}
      <div className="overflow-y-auto max-h-[500px]">
        {HOURS.map((hour) => {
          const hourOccs = timedOccs.filter(occ => new Date(occ.start).getHours() === hour);
          return (
            <div key={hour} className="flex border-b border-stone-50 min-h-[56px]">
              <div className="w-16 p-2 text-xs text-stone-400 text-right">
                {hour === 0 ? '' : `${String(hour).padStart(2, '0')}:00`}
              </div>
              <div className="flex-1 p-1.5 border-l border-stone-100">
                {hourOccs.map(occ => (
                  <div
                    key={occ.occurrenceId}
                    onClick={() => onSelectEvent(occ)}
                    className={`px-2.5 py-2 rounded-lg mb-1 cursor-pointer transition-colors ${
                      occ.event.source_system === 'booking'
                        ? 'bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                        : occ.isRecurring
                        ? 'bg-purple-50 border border-purple-200 hover:bg-purple-100'
                        : 'bg-indigo-50 border border-indigo-200 hover:bg-indigo-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-medium text-stone-800">{occ.event.title}</span>
                      {occ.event.lifecycle_state === 'cancelled' && <span className="text-xs text-red-500">Cancelled</span>}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-stone-500">
                      <Clock className="w-3 h-3" />
                      {formatTimeRange(occ.start, occ.end, occ.event.timezone || timezone)}
                    </div>
                    {occ.event.location_type !== 'physical' && occ.event.meeting_url && (
                      <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-0.5">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">{occ.event.meeting_url}</span>
                      </div>
                    )}
                    {occ.isRecurring && (
                      <div className="text-[10px] text-purple-500 mt-0.5">Recurring{occ.isException ? ' (modified)' : ''}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {timedOccs.length === 0 && allDayOccs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <CalendarOff className="w-8 h-8 text-stone-300 mb-2" />
            <p className="text-sm text-stone-400">No events on this day</p>
          </div>
        )}
      </div>
    </div>
  );
}