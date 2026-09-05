// Today View — focused view of the current day's scheduled activity (§19).
// ───────────────────────────────────────────────────────────
// Shows: next activity, today's events, available time, relevant reminders.
// Does NOT duplicate Dashboard's broader operational prioritisation.
//
// Accessibility (§114): semantic <time> elements, ARIA labels, keyboard
// navigation, text labels alongside colour indicators, reduced motion.
// Responsive (§115): adapts layout for mobile/tablet/desktop.

import { useMemo } from 'react';
import { Clock, MapPin, Sun, CalendarOff, AlertCircle, Bell } from 'lucide-react';
import { formatTimeRange, formatDate } from '@/lib/calendar';
import {
  buildEventAriaLabel, getSourceTypeLabel, getLifecycleStateLabel,
} from '@/lib/calendarAccessibility';
import { isSourceUnavailable, getSafeDisplayValues, getSourceUnavailableLabel } from '@/lib/sourceUnavailable';
import { getEventBarClasses } from '@/lib/calendarCategory';
import EventInvitationBadge from './EventInvitationBadge';
import EventLifecycleActions from './EventLifecycleActions';

function TodayEventCard({ occ, timezone, onSelectEvent, isFirst, participationMap, onParticipationResponse, user, onSetLifecycle, onDelete, onCancel, cancellingId, deletingId }) {
  const e = occ.event;
  const safe = getSafeDisplayValues(e);
  const sourceLabel = getSourceTypeLabel(e.source_system);
  const stateLabel = getLifecycleStateLabel(e.lifecycle_state);
  const unavailableLabel = getSourceUnavailableLabel(e);
  const ariaLabel = buildEventAriaLabel(occ, timezone);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelectEvent(occ)}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          ev.stopPropagation();
          onSelectEvent(occ);
        }
      }}
      aria-label={ariaLabel}
      className={`group rounded-lg border p-3 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 ${
        isFirst
          ? 'border-indigo-300 bg-indigo-50 hover:bg-indigo-100'
          : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
      } ${isSourceUnavailable(e) ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getEventBarClasses(e, occ)}`} aria-hidden="true" />
          {isFirst && <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide">Next up</span>}
          <h4 className="font-medium text-stone-800 text-sm truncate">{safe.title}</h4>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-stone-100 text-stone-600">{sourceLabel}</span>
          {stateLabel && <span className="text-[10px] text-stone-500">{stateLabel}</span>}
          {unavailableLabel && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-600" title={unavailableLabel}>
              <AlertCircle className="w-3 h-3" />
              <span className="sr-only">{unavailableLabel}</span>
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-stone-500">
        <time dateTime={occ.start} className="flex items-center gap-1">
          <Clock className="w-3 h-3" aria-hidden="true" />
          {e.all_day ? 'All day' : formatTimeRange(occ.start, occ.end, e.timezone || timezone)}
        </time>
        {safe.meetingUrl && (
          <span className="flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3" aria-hidden="true" />
            <span className="truncate">{safe.meetingUrl}</span>
          </span>
        )}
        {occ.isRecurring && (
          <span className="text-purple-500">{occ.isException ? 'Recurring (modified)' : 'Recurring'}</span>
        )}
      </div>
      {safe.description && !isSourceUnavailable(e) && (
        <p className="text-xs text-stone-600 mt-1.5 line-clamp-2">{safe.description}</p>
      )}
      <EventInvitationBadge event={e} participationMap={participationMap} onResponse={onParticipationResponse} compact />
      <EventLifecycleActions
        occ={occ}
        user={user}
        onSetLifecycle={onSetLifecycle}
        onDelete={onDelete}
        onCancel={onCancel}
        cancellingId={cancellingId}
        deletingId={deletingId}
      />
    </div>
  );
}

export default function TodayView({ occurrences, timezone, onSelectEvent, reminders = [], participationMap, onParticipationResponse, user, onSetLifecycle, onDelete, onCancel, cancellingId, deletingId }) {
  const now = new Date();
  const todayStr = now.toDateString();

  const todayOccs = useMemo(() => {
    return occurrences
      .filter((occ) => {
        if (occ.event.all_day) {
          return occ.start.slice(0, 10) === now.toISOString().split('T')[0];
        }
        return new Date(occ.start).toDateString() === todayStr;
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start));
  }, [occurrences, todayStr]);

  // Next activity = first upcoming occurrence today (or the next future occurrence)
  const nextActivity = useMemo(() => {
    const upcoming = todayOccs.find((occ) => {
      const state = occ.event.lifecycle_state;
      if (state === 'cancelled' || state === 'removed' || state === 'historical') return false;
      return new Date(occ.start).getTime() >= now.getTime();
    });
    if (upcoming) return upcoming;
    // If no upcoming today, find the next future occurrence overall
    return occurrences.find((occ) => {
      const state = occ.event.lifecycle_state;
      if (state === 'cancelled' || state === 'removed' || state === 'historical') return false;
      return new Date(occ.start).getTime() >= now.getTime();
    });
  }, [todayOccs, occurrences, now]);

  const activeReminders = useMemo(() => {
    return (reminders || []).filter((r) => r.is_active !== false);
  }, [reminders]);

  const dateLabel = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="space-y-4">
      {/* Date header */}
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-800">{dateLabel}</h2>
            <p className="text-sm text-stone-500 mt-0.5">
              {todayOccs.length} event{todayOccs.length !== 1 ? 's' : ''} today
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-stone-800">
              {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="text-xs text-stone-400">{timezone}</p>
          </div>
        </div>
      </div>

      {/* Next activity highlight */}
      {nextActivity && (
        <div className="bg-gradient-to-br from-indigo-50 to-white rounded-xl border border-indigo-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sun className="w-4 h-4 text-indigo-600" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-indigo-700">Next activity</h3>
          </div>
          <TodayEventCard occ={nextActivity} timezone={timezone} onSelectEvent={onSelectEvent} isFirst={true} participationMap={participationMap} onParticipationResponse={onParticipationResponse} user={user} onSetLifecycle={onSetLifecycle} onDelete={onDelete} onCancel={onCancel} cancellingId={cancellingId} deletingId={deletingId} />
        </div>
      )}

      {/* Today's events list */}
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <h3 className="text-sm font-semibold text-stone-700 mb-3">Today's schedule</h3>
        {todayOccs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <CalendarOff className="w-8 h-8 text-stone-300 mb-2" aria-hidden="true" />
            <p className="text-sm text-stone-400">No events scheduled today</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayOccs.map((occ) => (
              <TodayEventCard
                key={occ.occurrenceId}
                occ={occ}
                timezone={timezone}
                onSelectEvent={onSelectEvent}
                isFirst={false}
                participationMap={participationMap}
                onParticipationResponse={onParticipationResponse}
                user={user}
                onSetLifecycle={onSetLifecycle}
                onDelete={onDelete}
                onCancel={onCancel}
                cancellingId={cancellingId}
                deletingId={deletingId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reminders */}
      {activeReminders.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-4 h-4 text-stone-500" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-stone-700">Reminders</h3>
          </div>
          <div className="space-y-1.5">
            {activeReminders.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs text-stone-600">
                <Clock className="w-3 h-3 text-stone-400" aria-hidden="true" />
                <span>{r.offset_minutes === 0 ? 'At start time' : `${r.offset_minutes} min before`}</span>
                <span className="text-stone-400">•</span>
                <span>{(r.delivery_channels || []).join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}