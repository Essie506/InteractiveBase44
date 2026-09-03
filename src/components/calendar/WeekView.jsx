// Week view — 7-day grid with timed event slots (§19).
// Consumes the shared normalized occurrence model.

import { Clock, MapPin, CalendarOff } from 'lucide-react';
import { formatTimeRange } from '@/lib/calendar';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function WeekView({ occurrences, weekStart, timezone, onSelectEvent, selectedDate }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const occurrencesByDay = days.map((day) => {
    const dateStr = day.toDateString();
    return occurrences.filter((occ) => {
      if (occ.event.all_day) return occ.start.slice(0, 10) === day.toISOString().split('T')[0];
      return new Date(occ.start).toDateString() === dateStr;
    });
  });

  const now = new Date();
  const isCurrentWeek = days.some(d => d.toDateString() === now.toDateString());

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-8 border-b border-stone-200">
        <div className="p-2 text-xs text-stone-400 text-right">GMT</div>
        {days.map((day, i) => {
          const isToday = day.toDateString() === now.toDateString();
          const isSelected = day.toDateString() === selectedDate.toDateString();
          return (
            <div key={i} className={`p-2 text-center border-l border-stone-100 ${isToday ? 'bg-indigo-50' : ''}`}>
              <div className="text-xs text-stone-500">{WEEKDAYS[i]}</div>
              <div className={`text-lg font-semibold mt-0.5 ${isToday ? 'text-indigo-600' : isSelected ? 'text-stone-900' : 'text-stone-700'}`}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day row */}
      {occurrencesByDay.some(occs => occs.some(o => o.event.all_day)) && (
        <div className="grid grid-cols-8 border-b border-stone-200 bg-stone-50">
          <div className="p-1 text-xs text-stone-400 text-right">All day</div>
          {days.map((day, i) => {
            const dayAllDay = occurrencesByDay[i].filter(o => o.event.all_day);
            return (
              <div key={i} className="p-1 border-l border-stone-100 min-h-[28px]">
                {dayAllDay.map(occ => (
                  <div
                    key={occ.occurrenceId}
                    onClick={() => onSelectEvent(occ)}
                    className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded truncate cursor-pointer hover:bg-amber-200"
                  >
                    {occ.event.title}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Time grid */}
      <div className="overflow-y-auto max-h-[500px]">
        {HOURS.map((hour) => (
          <div key={hour} className="grid grid-cols-8 border-b border-stone-50 min-h-[48px]">
            <div className="p-1 text-xs text-stone-400 text-right">
              {hour === 0 ? '' : `${String(hour).padStart(2, '0')}:00`}
            </div>
            {days.map((day, dayIdx) => {
              const isToday = day.toDateString() === now.toDateString();
              const hourOccs = occurrencesByDay[dayIdx].filter(occ => {
                if (occ.event.all_day) return false;
                const occHour = new Date(occ.start).getHours();
                return occHour === hour;
              });
              return (
                <div
                  key={dayIdx}
                  className={`border-l border-stone-100 p-0.5 relative ${isToday ? 'bg-indigo-50/30' : ''}`}
                >
                  {hourOccs.map(occ => (
                    <div
                      key={occ.occurrenceId}
                      onClick={() => onSelectEvent(occ)}
                      className={`text-[10px] px-1.5 py-1 rounded mb-0.5 cursor-pointer truncate transition-colors ${
                        occ.event.source_system === 'booking'
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : occ.isRecurring
                          ? 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                          : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                      }`}
                    >
                      <div className="font-medium truncate">{occ.event.title}</div>
                      <div className="text-[9px] opacity-70">{formatTimeRange(occ.start, occ.end, occ.event.timezone || timezone)}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}