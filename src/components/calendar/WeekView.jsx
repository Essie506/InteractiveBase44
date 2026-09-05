// Week view — 7-day grid with timed event slots (§18).
// Consumes the shared normalized occurrence model.
//
// Accessibility (§114): semantic <time>, ARIA labels, keyboard nav,
// visible focus, text labels alongside colour.
// Responsive (§115): on mobile, collapses to a stacked daily list
// (grid is too cramped at <640px). Underlying behaviour is identical —
// the same occurrences are shown, just a different layout.
// Source Unavailable (§111): privacy-safe representation for redacted events.

import { useState } from 'react';
import { Clock, CalendarOff, AlertCircle, Loader2 } from 'lucide-react';
import { formatTimeRange } from '@/lib/calendar';
import {
  buildEventAriaLabel, getSourceTypeLabel,
} from '@/lib/calendarAccessibility';
import { isSourceUnavailable, getSafeDisplayValues } from '@/lib/sourceUnavailable';
import { getEventChipClasses, getEventBarClasses } from '@/lib/calendarCategory';
import { canEditEvent } from '@/lib/calendarAuthority';
import EventInvitationBadge from './EventInvitationBadge';
import { getParticipationState } from '@/lib/calendarParticipation';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// §49: an event is draggable only when the viewer has edit authority, the
// event is manual (not booking/source-owned), not all-day, and active.
// Booking-owned events must be rescheduled via the Booking flow (§45).
function isDraggable(occ, user) {
  const e = occ?.event || occ;
  if (!e || !user) return false;
  if (!canEditEvent(e, user)) return false;
  if (e.source_system && e.source_system !== 'manual') return false;
  if (e.all_day) return false;
  if (isSourceUnavailable(e)) return false;
  if (e.lifecycle_state === 'cancelled' || e.lifecycle_state === 'removed') return false;
  return true;
}

export default function WeekView({ occurrences, weekStart, timezone, onSelectEvent, selectedDate, participationMap, onParticipationResponse, user, onReschedule, reschedulingId }) {
  const [dragOccurrenceId, setDragOccurrenceId] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  // §49: compute the new start ISO (viewer-tz-aware) for a drop on a
  // day/hour cell, preserving the original within-hour minute offset.
  const computeNewStart = (occ, day, hour) => {
    const orig = new Date(occ.start);
    const next = new Date(day);
    next.setHours(hour, orig.getMinutes(), 0, 0);
    return next.toISOString();
  };

  const handleDrop = (occ, day, hour) => {
    setDragOverKey(null);
    if (!occ || !onReschedule) return;
    onReschedule(occ, computeNewStart(occ, day, hour));
  };

  const occurrencesByDay = days.map((day) => {
    const dateStr = day.toDateString();
    return occurrences.filter((occ) => {
      if (occ.event.all_day) return occ.start.slice(0, 10) === day.toISOString().split('T')[0];
      return new Date(occ.start).toDateString() === dateStr;
    });
  });

  const now = new Date();

  return (
    <>
      {/* Desktop/tablet: 7-day grid (≥640px) */}
      <div className="hidden sm:block bg-white rounded-xl border border-stone-200 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-8 border-b border-stone-200">
          <div className="p-2 text-xs text-stone-400 text-right" aria-hidden="true">GMT</div>
          {days.map((day, i) => {
            const isToday = day.toDateString() === now.toDateString();
            const isSelected = day.toDateString() === selectedDate.toDateString();
            return (
              <div key={i} className={`p-2 text-center border-l border-stone-100 ${isToday ? 'bg-indigo-50' : ''}`}>
                <div className="text-xs text-stone-500">{WEEKDAYS[i]}</div>
                <div className={`text-lg font-semibold mt-0.5 ${isToday ? 'text-indigo-600' : isSelected ? 'text-stone-900' : 'text-stone-700'}`}>
                  <time dateTime={day.toISOString().split('T')[0]}>{day.getDate()}</time>
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
                  {dayAllDay.map(occ => {
                    const safe = getSafeDisplayValues(occ.event);
                    return (
                      <div
                        key={occ.occurrenceId}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectEvent(occ)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSelectEvent(occ); } }}
                        aria-label={buildEventAriaLabel(occ, timezone)}
                        className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded truncate cursor-pointer hover:bg-amber-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
                      >
                        {safe.title}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Time grid */}
        <div className="overflow-y-auto max-h-[500px]">
          {HOURS.map((hour) => (
            <div key={hour} className="grid grid-cols-8 border-b border-stone-50 min-h-[48px]">
              <div className="p-1 text-xs text-stone-400 text-right" aria-hidden="true">
                {hour === 0 ? '' : `${String(hour).padStart(2, '0')}:00`}
              </div>
              {days.map((day, dayIdx) => {
                const isToday = day.toDateString() === now.toDateString();
                const hourOccs = occurrencesByDay[dayIdx].filter(occ => {
                  if (occ.event.all_day) return false;
                  return new Date(occ.start).getHours() === hour;
                });
                const dropKey = `${dayIdx}-${hour}`;
                const isDropTarget = dragOccurrenceId && dragOverKey === dropKey;
                return (
                  <div
                    key={dayIdx}
                    onDragOver={(ev) => { if (dragOccurrenceId) { ev.preventDefault(); setDragOverKey(dropKey); } }}
                    onDragLeave={() => { if (dragOverKey === dropKey) setDragOverKey(null); }}
                    onDrop={(ev) => {
                      ev.preventDefault();
                      const raw = ev.dataTransfer.getData('text/plain');
                      if (!raw) return;
                      try {
                        const { occurrenceId } = JSON.parse(raw);
                        const occ = occurrences.find((o) => o.occurrenceId === occurrenceId);
                        handleDrop(occ, day, hour);
                      } catch { /* ignore malformed */ }
                    }}
                    className={`border-l border-stone-100 p-0.5 relative transition-colors ${isToday ? 'bg-indigo-50/30' : ''} ${isDropTarget ? 'bg-indigo-100/60 ring-1 ring-inset ring-indigo-300' : ''}`}
                  >
                    {hourOccs.map(occ => {
                      const e = occ.event;
                      const safe = getSafeDisplayValues(e);
                      const sourceLabel = getSourceTypeLabel(e.source_system);
                      const unavailable = isSourceUnavailable(e);
                      const draggable = isDraggable(occ, user);
                      const isRescheduling = reschedulingId === e.id;
                      return (
                        <div
                          key={occ.occurrenceId}
                          role="button"
                          tabIndex={0}
                          draggable={draggable}
                          onDragStart={(ev) => {
                            setDragOccurrenceId(occ.occurrenceId);
                            ev.dataTransfer.setData('text/plain', JSON.stringify({ occurrenceId: occ.occurrenceId, eventId: e.id }));
                            ev.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => setDragOccurrenceId(null)}
                          onClick={() => onSelectEvent(occ)}
                          onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); onSelectEvent(occ); } }}
                          aria-label={buildEventAriaLabel(occ, timezone)}
                          className={`text-[10px] px-1.5 py-1 rounded mb-0.5 cursor-pointer truncate transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 ${
                            unavailable
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              : getEventChipClasses(e, occ)
                          } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${isRescheduling ? 'opacity-50' : ''}`}
                        >
                          <div className="font-medium truncate flex items-center gap-1">
                            {isRescheduling && <Loader2 className="w-2.5 h-2.5 animate-spin flex-shrink-0" aria-hidden="true" />}
                            {safe.title}
                          </div>
                          <div className="text-[9px] opacity-70 flex items-center gap-0.5">
                            <span>{sourceLabel}</span>
                            <span>•</span>
                            <time dateTime={occ.start}>{formatTimeRange(occ.start, occ.end, e.timezone || timezone)}</time>
                            {participationMap && getParticipationState(e, participationMap) === 'pending' && (
                              <span className="text-indigo-600 font-semibold">• Invite</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: stacked daily list (<640px) — same occurrences, compact layout */}
      <div className="sm:hidden space-y-3">
        {days.map((day, dayIdx) => {
          const dayOccs = occurrencesByDay[dayIdx];
          const isToday = day.toDateString() === now.toDateString();
          if (dayOccs.length === 0) return null;
          return (
            <div key={dayIdx} className={`bg-white rounded-xl border ${isToday ? 'border-indigo-300' : 'border-stone-200'} p-3`}>
              <h4 className={`text-sm font-semibold mb-2 ${isToday ? 'text-indigo-700' : 'text-stone-700'}`}>
                <time dateTime={day.toISOString().split('T')[0]}>
                  {day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                </time>
                {isToday && <span className="ml-2 text-[10px] text-indigo-500 uppercase">Today</span>}
              </h4>
              <div className="space-y-1.5">
                {dayOccs.map(occ => {
                  const e = occ.event;
                  const safe = getSafeDisplayValues(e);
                  const sourceLabel = getSourceTypeLabel(e.source_system);
                  const unavailable = isSourceUnavailable(e);
                  return (
                    <div
                      key={occ.occurrenceId}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectEvent(occ)}
                      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); onSelectEvent(occ); } }}
                      aria-label={buildEventAriaLabel(occ, timezone)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                        unavailable ? 'bg-amber-50 border border-amber-200' : 'bg-stone-50 border border-stone-100'
                      }`}
                    >
                      <div className={`w-1 h-8 rounded-full flex-shrink-0 ${
                        unavailable ? 'bg-amber-400' : getEventBarClasses(e, occ)
                      }`} aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium text-stone-800 truncate">{safe.title}</span>
                          <span className="text-[9px] text-stone-500 flex-shrink-0">{sourceLabel}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-stone-500">
                          <Clock className="w-2.5 h-2.5" aria-hidden="true" />
                          <time dateTime={occ.start}>{e.all_day ? 'All day' : formatTimeRange(occ.start, occ.end, e.timezone || timezone)}</time>
                          {unavailable && <AlertCircle className="w-2.5 h-2.5 text-amber-500" aria-hidden="true" />}
                        </div>
                        <EventInvitationBadge event={e} participationMap={participationMap} onResponse={onParticipationResponse} compact />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {occurrencesByDay.every(o => o.length === 0) && (
          <div className="bg-white rounded-xl border border-stone-200 p-8 flex flex-col items-center">
            <CalendarOff className="w-8 h-8 text-stone-300 mb-2" aria-hidden="true" />
            <p className="text-sm text-stone-400">No events this week</p>
          </div>
        )}
      </div>
    </>
  );
}