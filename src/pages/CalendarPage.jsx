import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getAllEventsForIdentity, getCombinedBusinessCalendar, getExceptionsForEvents, formatTimeRange, getLocalTimezone, cancelEvent, subscribeToOwnerEvents, subscribeToAssignedEvents, subscribeToInvitedEvents, mergeAndDedupeEvents, subscribeToParticipationForIdentity } from '@/lib/calendar';
import { normalizeToOccurrences, groupOccurrencesByDate, filterOccurrences } from '@/lib/calendarOccurrences';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Clock, MapPin, Trash2, Loader2, CalendarOff, AlertCircle } from 'lucide-react';
import { buildEventAriaLabel, getSourceTypeLabel, getLifecycleStateLabel } from '@/lib/calendarAccessibility';
import { isSourceUnavailable, getSafeDisplayValues, getSourceUnavailableLabel } from '@/lib/sourceUnavailable';
import EventModal from '@/components/calendar/EventModal';
import CalendarViewSwitcher from '@/components/calendar/CalendarViewSwitcher';
import CalendarSearchBar from '@/components/calendar/CalendarSearchBar';
import TodayView from '@/components/calendar/TodayView';
import WeekView from '@/components/calendar/WeekView';
import DayView from '@/components/calendar/DayView';
import AgendaView from '@/components/calendar/AgendaView';
import InvitationActions from '@/components/calendar/InvitationActions';
import { loadParticipationForEvents, getParticipationState, isInvitedEvent } from '@/lib/calendarParticipation';
import { useToast } from '@/components/ui/use-toast';
import { useFirebase } from '@/lib/backendConfig';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CalendarPage() {
  const { user } = useAuth();
  // §19/§115: default to Today view — focused current-day summary.
  // On mobile this also avoids the cramped month grid.
  const [view, setView] = useState('today');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ visibility: '', sourceSystem: '', lifecycleState: '' });
  const [participationMap, setParticipationMap] = useState(new Map());
  const [queryErrors, setQueryErrors] = useState([]);
  const { toast } = useToast();

  const focusEventId = useMemo(() => new URLSearchParams(window.location.search).get('event'), []);
  const focusedRef = useRef(false);

  const activeContext = user?.active_context || 'personal';
  const activeBusinessId = user?.active_business_id;
  const timezone = getLocalTimezone();

  const ownerType = activeContext === 'business' ? 'business' : 'identity';
  const ownerId = activeContext === 'business' ? activeBusinessId : user?.id;

  // Compute the visible date range based on the current view
  const visibleRange = useMemo(() => {
    if (view === 'month') {
      const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59);
      return { start, end };
    }
    if (view === 'week') {
      const start = new Date(weekStart);
      const end = new Date(weekStart);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59);
      return { start, end };
    }
    if (view === 'day') {
      const start = new Date(selectedDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(selectedDate);
      end.setHours(23, 59, 59);
      return { start, end };
    }
    // Agenda — next 30 days from selected date
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 30);
    return { start, end };
  }, [view, currentMonth, weekStart, selectedDate]);

  // Load events + exceptions for the visible range
  const loadEvents = async () => {
    if (!user) return;
    setLoading(true);
    const errors = [];
    try {
      let allEvents;
      if (activeContext === 'business' && activeBusinessId) {
        // Combined Business/Staff Calendar (§70–§74) — aggregation over
        // canonical events, not a separate combined-calendar store.
        allEvents = await getAllEventsForIdentity(user.id, activeContext, activeBusinessId, visibleRange.start, visibleRange.end, (err) => errors.push(err));
      } else {
        allEvents = await getAllEventsForIdentity(user.id, activeContext, activeBusinessId, visibleRange.start, visibleRange.end, (err) => errors.push(err));
      }
      setEvents(allEvents);
      setQueryErrors(errors);
      // Fetch exceptions for recurring events
      const excs = await getExceptionsForEvents(allEvents);
      setExceptions(excs);
      // Load participation state for visible events (Phase 3).
      // Builds a Map: event_id → participation record for the current user.
      // Events where the user is the organiser (not invited) have no record.
      try {
        const partMap = await loadParticipationForEvents(user.id, allEvents.map(e => e.id));
        setParticipationMap(partMap);
      } catch (err) {
        console.error('[CalendarPage] Failed to load participation:', err);
        setParticipationMap(new Map());
      }
    } catch (err) {
      console.error('[CalendarPage] Failed to load events:', err);
      setEvents([]);
      setExceptions([]);
      setParticipationMap(new Map());
      setQueryErrors([{ query: 'load', error: err?.message || String(err) }]);
    } finally {
      setLoading(false);
    }
  };

  // Handle participation response (Accept/Decline) — update local state
  const handleParticipationResponse = (eventId, responseState) => {
    setParticipationMap(prev => {
      const next = new Map(prev);
      const existing = next.get(eventId);
      if (existing) {
        next.set(eventId, { ...existing, response_state: responseState, responded_at: new Date().toISOString() });
      }
      return next;
    });
  };

  useEffect(() => { loadEvents(); }, [user, currentMonth, weekStart, selectedDate, view, activeContext, activeBusinessId]);

  // ── Real-time subscriptions (§99) ──────────────────────────────
  // onSnapshot propagates Calendar state changes promptly to this view.
  // CRITICAL (§99): this is PRESENTATION only — server-side authoritative
  // conflict/availability validation is NOT replaced by real-time.
  // The subscription merges owner + assigned + invited event streams and
  // deduplicates by Event ID. When Firebase is not configured, this is a
  // no-op (the polling loadEvents above handles non-Firebase mode).
  useEffect(() => {
    if (!user || !useFirebase) return;
    let ownerUnsub, assignedUnsub, invitedUnsub;
    const identityId = user.id;
    const oType = activeContext === 'business' ? 'business' : 'identity';
    const oId = activeContext === 'business' ? activeBusinessId : identityId;

    let pending = { owner: [], assigned: [], invited: [] };
    const flushMerged = () => {
      const merged = mergeAndDedupeEvents(pending.owner, pending.assigned, pending.invited);
      // Only update if we got real data — avoid overwriting a loaded set with empty
      if (merged.length > 0 || events.length === 0) {
        setEvents(merged);
      }
    };

    try {
      ownerUnsub = subscribeToOwnerEvents(oId, oType, (evts) => {
        pending.owner = evts;
        flushMerged();
      });
      if (oType === 'identity') {
        assignedUnsub = subscribeToAssignedEvents(identityId, (evts) => {
          pending.assigned = evts;
          flushMerged();
        });
        invitedUnsub = subscribeToInvitedEvents(identityId, (evts) => {
          pending.invited = evts;
          flushMerged();
        });
      }
    } catch (err) {
      // Real-time subscription failed — fall back to polling (already running)
      console.error('[CalendarPage] realtime subscription error:', err);
    }

    return () => {
      if (ownerUnsub) ownerUnsub();
      if (assignedUnsub) assignedUnsub();
      if (invitedUnsub) invitedUnsub();
    };
  }, [user, activeContext, activeBusinessId, useFirebase]);

  // ── Real-time participation subscription (Phase 3) ──────────
  // Propagates invitation response state changes (pending → accepted/
  // declined/revoked) to the Calendar UI without refresh. The organiser
  // sees invitee responses update in real-time; the invitee sees their
  // own responses reflected immediately. Uses the existing
  // subscribeToParticipationForIdentity from calendarRealtime — the
  // same authoritative participation collection written by
  // respondCalendarInvitation.
  useEffect(() => {
    if (!user || !useFirebase) return;
    const unsub = subscribeToParticipationForIdentity(user.id, (records) => {
      setParticipationMap(new Map(records.map((p) => [p.event_id, p])));
    });
    return unsub;
  }, [user, useFirebase]);

  // After events load, jump to + highlight the deep-linked event once.
  useEffect(() => {
    if (!focusEventId || focusedRef.current || loading || events.length === 0) return;
    const ev = events.find((e) => e.id === focusEventId);
    if (ev) {
      const evDate = new Date(ev.start_time);
      setCurrentMonth(new Date(evDate.getFullYear(), evDate.getMonth(), 1));
      setSelectedDate(evDate);
      focusedRef.current = true;
    }
  }, [focusEventId, events, loading]);

  // Normalize all events into the shared occurrence model
  const allOccurrences = useMemo(() => {
    return normalizeToOccurrences(events, exceptions, visibleRange.start, visibleRange.end);
  }, [events, exceptions, visibleRange.start, visibleRange.end]);

  // Apply search + filters
  const filteredOccurrences = useMemo(() => {
    return filterOccurrences(allOccurrences, { search, ...filters });
  }, [allOccurrences, search, filters]);

  // Month grid days
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = (firstDay.getDay() + 6) % 7;
    const startDate = new Date(year, month, 1 - startDayOfWeek);
    const days = [];
    for (let i = 0; i < 42; i++) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + i);
      days.push(day);
    }
    return days;
  }, [currentMonth]);

  // Occurrences grouped by date for the month grid
  const occurrencesByDate = useMemo(() => {
    return groupOccurrencesByDate(filteredOccurrences, timezone);
  }, [filteredOccurrences, timezone]);

  const eventsForDay = (date) => {
    const dateStr = date.toDateString();
    const isoDate = date.toISOString().split('T')[0];
    return filteredOccurrences.filter((occ) => {
      if (occ.event.all_day) return occ.start.slice(0, 10) === isoDate;
      return new Date(occ.start).toDateString() === dateStr;
    });
  };

  const selectedDateEvents = eventsForDay(selectedDate);

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); };
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); };
  const prevDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); };
  const nextDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); };
  const goToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now);
    const ws = new Date(now);
    ws.setHours(0, 0, 0, 0);
    ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7));
    setWeekStart(ws);
  };

  const handleEventSaved = () => {
    setShowEventModal(false);
    setEditingEvent(null);
    loadEvents();
  };

  const handleCancelEvent = async (occ) => {
    const event = occ?.event || occ;
    if (cancellingId) return;
    if (event?.source_system === 'booking') {
      toast({
        title: 'Cannot cancel here',
        description: 'This event was created by a booking. Cancel it from your Bookings to apply the refund policy.',
        variant: 'destructive',
      });
      return;
    }
    setCancellingId(event.id);
    try {
      await cancelEvent(event.id);
      await loadEvents();
    } catch (err) {
      toast({
        title: 'Could not cancel event',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setCancellingId(null);
    }
  };

  const handleSelectEvent = (occ) => {
    setEditingEvent(occ.event);
    setShowEventModal(true);
  };

  const contextLabel = activeContext === 'business' ? 'Business' : activeContext === 'professional' ? 'Professional' : 'Personal';

  const headerLabel = useMemo(() => {
    if (view === 'month') return `${MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
    if (view === 'week') {
      const end = new Date(weekStart);
      end.setDate(end.getDate() + 6);
      return `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    if (view === 'day') return selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (view === 'today') return 'Today';
    return 'Agenda';
  }, [view, currentMonth, weekStart, selectedDate]);

  const prevHandler = view === 'month' ? prevMonth : view === 'week' ? prevWeek : view === 'day' ? prevDay : view === 'today' ? () => {} : () => { const d = new Date(selectedDate); d.setDate(d.getDate() - 7); setSelectedDate(d); };
  const nextHandler = view === 'month' ? nextMonth : view === 'week' ? nextWeek : view === 'day' ? nextDay : view === 'today' ? () => {} : () => { const d = new Date(selectedDate); d.setDate(d.getDate() + 7); setSelectedDate(d); };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-800">{contextLabel} Calendar</h1>
          <p className="text-stone-500 text-sm">Your authoritative Interactive calendar</p>
        </div>
        <div className="flex items-center gap-3">
          <CalendarSearchBar search={search} onSearchChange={setSearch} filters={filters} onFiltersChange={setFilters} />
          <button
            onClick={() => { setEditingEvent(null); setShowEventModal(true); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> New Event
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {view !== 'today' && (
            <button onClick={prevHandler} aria-label="Previous period" className="p-2 hover:bg-stone-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><ChevronLeft className="w-4 h-4 text-stone-600" /></button>
          )}
          <h2 className="text-lg font-semibold text-stone-800 min-w-[200px] text-center">{headerLabel}</h2>
          {view !== 'today' && (
            <button onClick={nextHandler} aria-label="Next period" className="p-2 hover:bg-stone-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><ChevronRight className="w-4 h-4 text-stone-600" /></button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={goToday} aria-label="Jump to today's date" title="Jump to today" className="px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 rounded-lg transition-colors">Jump to Today</button>
            <CalendarViewSwitcher view={view} onChange={setView} />
        </div>
      </div>

      {/* Query failure observability (Phase 3 hardening) — a failed sub-query
          must never masquerade as a legitimate empty result. */}
      {queryErrors.length > 0 && !loading && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2" role="alert">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" aria-hidden="true" />
          <p className="text-sm text-amber-700">
            Some calendar data could not be loaded ({queryErrors.map(e => e.query).join(', ')}).
            Your events may be incomplete — try refreshing.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : view === 'today' ? (
        <TodayView occurrences={filteredOccurrences} timezone={timezone} onSelectEvent={handleSelectEvent} participationMap={participationMap} onParticipationResponse={handleParticipationResponse} />
      ) : view === 'week' ? (
        <WeekView occurrences={filteredOccurrences} weekStart={weekStart} timezone={timezone} onSelectEvent={handleSelectEvent} selectedDate={selectedDate} participationMap={participationMap} onParticipationResponse={handleParticipationResponse} />
      ) : view === 'day' ? (
        <DayView occurrences={filteredOccurrences} date={selectedDate} timezone={timezone} onSelectEvent={handleSelectEvent} participationMap={participationMap} onParticipationResponse={handleParticipationResponse} />
      ) : view === 'agenda' ? (
        <AgendaView occurrences={filteredOccurrences} timezone={timezone} onSelectEvent={handleSelectEvent} selectedDate={selectedDate} participationMap={participationMap} onParticipationResponse={handleParticipationResponse} />
      ) : (
        /* Month view — existing grid + side panel */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl border border-stone-200 p-4 md:p-6">
            <div className="grid grid-cols-7 gap-1 mb-2">
              {WEEKDAYS.map((day) => (
                <div key={day} className="text-center text-xs font-medium text-stone-500 py-2">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, i) => {
                const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                const isToday = day.toDateString() === new Date().toDateString();
                const isSelected = day.toDateString() === selectedDate.toDateString();
                const dayEvents = eventsForDay(day);
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(day)}
                    aria-label={`${day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}, ${dayEvents.length} event${dayEvents.length !== 1 ? 's' : ''}`}
                    className={`min-h-[70px] md:min-h-[90px] p-1.5 rounded-lg text-left border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      isSelected ? 'border-indigo-400 bg-indigo-50' : 'border-stone-100 hover:bg-stone-50'
                    } ${!isCurrentMonth ? 'opacity-40' : ''}`}
                  >
                    <div className={`text-xs font-medium mb-1 ${isToday ? 'w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center' : 'text-stone-700'}`}>
                      <time dateTime={day.toISOString().split('T')[0]}>{day.getDate()}</time>
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((occ) => {
                        const safe = getSafeDisplayValues(occ.event);
                        const unavailable = isSourceUnavailable(occ.event);
                        return (
                          <div
                            key={occ.occurrenceId}
                            className={`text-[10px] px-1.5 py-0.5 rounded truncate font-medium ${
                              unavailable ? 'bg-amber-100 text-amber-700' :
                              occ.event.source_system === 'booking' ? 'bg-emerald-100 text-emerald-700' :
                              occ.isRecurring ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'
                            }`}
                          >
                            {safe.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && <div className="text-[10px] text-stone-400 px-1">+{dayEvents.length - 3} more</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected date events panel */}
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <h3 className="font-semibold text-stone-800 mb-1">
              {selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            <p className="text-sm text-stone-500 mb-4">{selectedDateEvents.length} event{selectedDateEvents.length !== 1 ? 's' : ''}</p>

            {selectedDateEvents.length === 0 ? (
              <div className="text-center py-8">
                <CalendarIcon className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                <p className="text-sm text-stone-400">No events on this day</p>
                <button onClick={() => { setEditingEvent(null); setShowEventModal(true); }} className="mt-3 text-sm text-indigo-600 font-medium hover:text-indigo-700">Add event</button>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedDateEvents.map((occ) => {
                  const e = occ.event;
                  const safe = getSafeDisplayValues(e);
                  const sourceLabel = getSourceTypeLabel(e.source_system);
                  const stateLabel = getLifecycleStateLabel(e.lifecycle_state);
                  const unavailableLabel = getSourceUnavailableLabel(e);
                  const unavailable = isSourceUnavailable(e);
                  const participationState = getParticipationState(e, participationMap);
                  return (
                    <div key={occ.occurrenceId} className={`border rounded-lg p-3 hover:border-stone-300 transition-colors ${unavailable ? 'border-amber-200 bg-amber-50/50' : 'border-stone-200'}`}>
                      <div className="flex items-start justify-between mb-1 gap-1">
                        <h4 className="font-medium text-stone-800 text-sm truncate">{safe.title}</h4>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[10px] px-1 py-0.5 rounded bg-stone-100 text-stone-600">{sourceLabel}</span>
                          {stateLabel && <span className="text-xs text-red-500">{stateLabel}</span>}
                          {unavailable && <AlertCircle className="w-3 h-3 text-amber-500" />}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-stone-500 mb-1">
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        <time dateTime={occ.start}>{e.all_day ? 'All day' : formatTimeRange(occ.start, occ.end, e.timezone || timezone)}</time>
                      </div>
                      {safe.meetingUrl && (
                        <div className="flex items-center gap-1.5 text-xs text-stone-500 mb-1">
                          <MapPin className="w-3 h-3" aria-hidden="true" />
                          <span className="truncate">{safe.meetingUrl}</span>
                        </div>
                      )}
                      {occ.isRecurring && !unavailable && (
                        <div className="text-[10px] text-purple-500 mb-1">Recurring{occ.isException ? ' (modified)' : ''}</div>
                      )}
                      {unavailableLabel && (
                        <div className="text-[10px] text-amber-600 mb-1">{unavailableLabel}</div>
                      )}
                      {safe.description && !unavailable && <p className="text-xs text-stone-600 mt-1.5">{safe.description}</p>}
                      {participationState && participationState !== 'revoked' && (
                        <div className="mt-2 pt-2 border-t border-stone-100">
                          <InvitationActions
                            event={e}
                            participationState={participationState}
                            onResponse={handleParticipationResponse}
                          />
                        </div>
                      )}
                      <div className="flex gap-2 mt-2">
                        {!unavailable && !participationState && (
                          <button onClick={() => handleSelectEvent(occ)} className="text-xs text-indigo-600 font-medium hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">Edit</button>
                        )}
                        {e.lifecycle_state !== 'cancelled' && e.lifecycle_state !== 'removed' && e.source_system !== 'booking' && !unavailable && (
                          <button
                            onClick={() => handleCancelEvent(occ)}
                            disabled={cancellingId === e.id}
                            className="text-xs text-red-500 font-medium hover:text-red-600 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded"
                          >
                            {cancellingId === e.id
                              ? <><Loader2 className="w-3 h-3 animate-spin" /> Cancelling...</>
                              : <><Trash2 className="w-3 h-3" /> Cancel</>}
                          </button>
                        )}
                        {e.lifecycle_state !== 'cancelled' && e.lifecycle_state !== 'removed' && e.source_system === 'booking' && (
                          <span className="text-xs text-stone-400 flex items-center gap-1">
                            <CalendarOff className="w-3 h-3" /> Cancel via Bookings
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showEventModal && (
        <EventModal
          ownerId={ownerId}
          ownerType={ownerType}
          operatingContext={activeContext}
          createdBy={user.id}
          businessId={activeContext === 'business' ? activeBusinessId : null}
          existingEvent={editingEvent}
          timezone={timezone}
          onClose={() => { setShowEventModal(false); setEditingEvent(null); }}
          onSaved={handleEventSaved}
        />
      )}
    </div>
  );
}