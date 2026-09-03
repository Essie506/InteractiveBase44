// Day view — single-day timeline (§18).
// Consumes the shared normalized occurrence model.
//
// Accessibility (§114): semantic <time>, ARIA labels, keyboard nav,
// visible focus, text labels alongside colour, reduced motion.
// Source Unavailable (§111): privacy-safe representation for redacted events.

import { Clock, MapPin, CalendarOff, AlertCircle } from 'lucide-react';
import { formatTimeRange } from '@/lib/calendar';
import {
  buildEventAriaLabel, getSourceTypeLabel, getLifecycleStateLabel,
} from '@/lib/calendarAccessibility';
import { isSourceUnavailable, getSafeDisplayValues, getSourceUnavailableLabel } from '@/lib/sourceUnavailable';

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
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden sm:rounded-2xl">
      {/* Header */}
      <div className="p-4 border-b border-stone-200">
        <h3 className="text-lg font-semibold text-stone-800">
          <time dateTime={date.toISOString().split('T')[0]}>
            {date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </time>
        </h3>
        <p className="text-sm text-stone-500 mt-0.5" aria-live="polite">
          {dayOccurrences.length} event{dayOccurrences.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* All-day events */}
      {allDayOccs.length > 0 && (
        <div className="p-3 border-b border-stone-200 bg-amber-50">
          <div className="text-xs font-medium text-amber-700 mb-1.5">All day</div>
          <div className="space-y-1">
            {allDayOccs.map(occ => {
              const safe = getSafeDisplayValues(occ.event);
              return (
                <div
                  key={occ.occurrenceId}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectEvent(occ)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSelectEvent(occ); } }}
                  aria-label={buildEventAriaLabel(occ, timezone)}
                  className="text-sm px-2 py-1.5 bg-amber-100 text-amber-800 rounded cursor-pointer hover:bg-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  {safe.title}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timed events */}
      <div className="overflow-y-auto max-h-[500px]">
        {HOURS.map((hour) => {
          const hourOccs = timedOccs.filter(occ => new Date(occ.start).getHours() === hour);
          return (
            <div key={hour} className="flex border-b border-stone-50 min-h-[56px]">
              <div className="w-16 p-2 text-xs text-stone-400 text-right" aria-hidden="true">
                {hour === 0 ? '' : `${String(hour).padStart(2, '0')}:00`}
              </div>
              <div className="flex-1 p-1.5 border-l border-stone-100">
                {hourOccs.map(occ => {
                  const e = occ.event;
                  const safe = getSafeDisplayValues(e);
                  const sourceLabel = getSourceTypeLabel(e.source_system);
                  const stateLabel = getLifecycleStateLabel(e.lifecycle_state);
                  const unavailable = isSourceUnavailable(e);
                  return (
                    <div
                      key={occ.occurrenceId}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectEvent(occ)}
                      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); onSelectEvent(occ); } }}
                      aria-label={buildEventAriaLabel(occ, timezone)}
                      className={`px-2.5 py-2 rounded-lg mb-1 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                        unavailable
                          ? 'bg-amber-50 border border-amber-200 hover:bg-amber-100'
                          : e.source_system === 'booking'
                          ? 'bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                          : occ.isRecurring
                          ? 'bg-purple-50 border border-purple-200 hover:bg-purple-100'
                          : 'bg-indigo-50 border border-indigo-200 hover:bg-indigo-100'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5 gap-1">
                        <span className="text-sm font-medium text-stone-800 truncate">{safe.title}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-[10px] px-1 py-0.5 rounded bg-white/70 text-stone-600">{sourceLabel}</span>
                          {stateLabel && <span className="text-[10px] text-red-500">{stateLabel}</span>}
                          {unavailable && <AlertCircle className="w-3 h-3 text-amber-500" aria-hidden="true" />}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-stone-500">
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        <time dateTime={occ.start}>
                          {e.all_day ? 'All day' : formatTimeRange(occ.start, occ.end, e.timezone || timezone)}
                        </time>
                      </div>
                      {safe.meetingUrl && (
                        <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-0.5">
                          <MapPin className="w-3 h-3" aria-hidden="true" />
                          <span className="truncate">{safe.meetingUrl}</span>
                        </div>
                      )}
                      {occ.isRecurring && !unavailable && (
                        <div className="text-[10px] text-purple-500 mt-0.5">Recurring{occ.isException ? ' (modified)' : ''}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {timedOccs.length === 0 && allDayOccs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <CalendarOff className="w-8 h-8 text-stone-300 mb-2" aria-hidden="true" />
            <p className="text-sm text-stone-400">No events on this day</p>
          </div>
        )}
      </div>
    </div>
  );
}