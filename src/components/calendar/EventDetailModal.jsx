// EventDetailModal — read-only event detail view for non-authorised viewers.
// ───────────────────────────────────────────────────────────
// V2 authority: an invited/assigned identity can READ the event and
// respond to their own invitation (Accept/Decline), but MUST NOT be
// presented with edit/cancel/reschedule capabilities.
//
// This modal is shown when a viewer who is NOT the creator/owner/business
// manager clicks an event. It displays the event details (read-only) and
// the EventInvitationBadge (Accept/Decline) for invited viewers. It does
// NOT render any edit inputs, save buttons, invite inputs, or assignment
// pickers.
//
// The edit path (EventModal) is only opened for users who pass
// canEditEvent — see CalendarPage.handleSelectEvent.

import { X, Clock, MapPin, Calendar as CalendarIcon, Video, Lock, Mail } from 'lucide-react';
import { formatTimeRange, formatDate } from '@/lib/calendar';
import { getSourceTypeLabel, getLifecycleStateLabel } from '@/lib/calendarAccessibility';
import { isSourceUnavailable, getSafeDisplayValues, getSourceUnavailableLabel } from '@/lib/sourceUnavailable';
import EventInvitationBadge from './EventInvitationBadge';

export default function EventDetailModal({ event, timezone, participationMap, onParticipationResponse, onClose }) {
  if (!event) return null;
  const safe = getSafeDisplayValues(event);
  const sourceLabel = getSourceTypeLabel(event.source_system);
  const stateLabel = getLifecycleStateLabel(event.lifecycle_state);
  const unavailableLabel = getSourceUnavailableLabel(event);
  const unavailable = isSourceUnavailable(event);

  const start = event.start_time;
  const end = event.end_time;
  const tz = event.timezone || timezone;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-stone-400" aria-hidden="true" />
            <h2 className="text-xl font-bold text-stone-800">{safe.title}</h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Read-only notice for invitees */}
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 flex items-center gap-2">
            <Mail className="w-4 h-4 text-stone-500 flex-shrink-0" aria-hidden="true" />
            <p className="text-sm text-stone-600">
              You were invited to this event. You can accept or decline your invitation, but only the organiser can edit it.
            </p>
          </div>

          {/* Time */}
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-stone-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-stone-700">
                {event.all_day ? 'All day' : formatTimeRange(start, end, tz)}
              </p>
              <p className="text-xs text-stone-500 mt-0.5">
                <time dateTime={start}>{formatDate(start, tz)}</time>
              </p>
            </div>
          </div>

          {/* Location */}
          {safe.meetingUrl && (
            <div className="flex items-start gap-3">
              {event.location_type === 'online' || event.location_type === 'hybrid'
                ? <Video className="w-4 h-4 text-stone-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                : <MapPin className="w-4 h-4 text-stone-400 mt-0.5 flex-shrink-0" aria-hidden="true" />}
              <p className="text-sm text-stone-700 break-all">{safe.meetingUrl}</p>
            </div>
          )}

          {/* Description */}
          {safe.description && !unavailable && (
            <div className="flex items-start gap-3">
              <CalendarIcon className="w-4 h-4 text-stone-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <p className="text-sm text-stone-600 whitespace-pre-wrap">{safe.description}</p>
            </div>
          )}

          {/* Source / state badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] px-2 py-0.5 rounded bg-stone-100 text-stone-600 font-medium">{sourceLabel}</span>
            {stateLabel && <span className="text-xs text-red-500 font-medium">{stateLabel}</span>}
            {unavailableLabel && (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-600 font-medium">
                {unavailableLabel}
              </span>
            )}
            {event.visibility && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-stone-100 text-stone-500 capitalize">{event.visibility}</span>
            )}
          </div>

          {/* Recurrence indicator */}
          {event.recurrence_rule && (
            <p className="text-xs text-purple-500">Recurring event</p>
          )}

          {/* Invitation response — Accept/Decline for invited viewers */}
          <EventInvitationBadge
            event={event}
            participationMap={participationMap}
            onResponse={onParticipationResponse}
          />
        </div>

        <div className="flex gap-3 p-6 border-t border-stone-100">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-stone-100 text-stone-700 rounded-lg font-medium hover:bg-stone-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}