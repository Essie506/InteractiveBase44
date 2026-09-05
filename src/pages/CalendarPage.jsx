import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getAllEventsForIdentity, getCombinedBusinessCalendar, getExceptionsForEvents, formatTimeRange, getLocalTimezone, cancelEvent, setEventLifecycle, deleteEvent, subscribeToCalendarSignal } from '@/lib/calendar';
import { rescheduleOccurrence, isConflictError } from '@/lib/calendarReschedule';
import { suggestAlternativeSlots } from '@/lib/calendarAlternatives';
import { normalizeToOccurrences, groupOccurrencesByDate, filterOccurrences } from '@/lib/calendarOccurrences';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Clock, MapPin, AlertCircle } from 'lucide-react';
import { buildEventAriaLabel, getSourceTypeLabel, getLifecycleStateLabel } from '@/lib/calendarAccessibility';
import { isSourceUnavailable, getSafeDisplayValues, getSourceUnavailableLabel } from '@/lib/sourceUnavailable';
import { getEventChipClasses } from '@/lib/calendarCategory';
import EventModal from '@/components/calendar/EventModal';
import CalendarViewSwitcher from '@/components/calendar/CalendarViewSwitcher';
import CalendarSearchBar from '@/components/calendar/CalendarSearchBar';
import TodayView from '@/components/calendar/TodayView';
import WeekView from '@/components/calendar/WeekView';
import DayView from '@/components/calendar/DayView';
import AgendaView from '@/components/calendar/AgendaView';
import InvitationActions from '@/components/calendar/InvitationActions';
import { loadParticipationForEvents, getParticipationState, isInvitedEvent, setPersonalTimelineState } from '@/lib/calendarParticipation';
import { canEditEvent } from '@/lib/calendarAuthority';
import EventDetailModal from '@/components/calendar/EventDetailModal';
import EventHistoryTimeline from '@/components/calendar/EventHistoryTimeline';
import OccurrenceActions from '@/components/calendar/OccurrenceActions';
import EventLifecycleActions from '@/components/calendar/EventLifecycleActions';
import OfflineIndicator from '@/components/calendar/OfflineIndicator';
import { useToast } from '@/components/ui/use-toast';

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
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [viewingEvent, setViewingEvent] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [reschedulingId, setReschedulingId] = useState(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ visibility: '', sourceSystem: '', lifecycleState: '', category: '', context: '', period: '' });
  const [participationMap, setParticipationMap] = useState(new Map());
  const [queryErrors, setQueryErrors] = useState([]);
  const [showHidden, setShowHidden] = useState(false);
  const [personalStateLoadingId, setPersonalStateLoadingId] = useState(null);
  const { toast } = useToast();

  const focusEventId = useMemo(() => new URLSearchParams(window.location.search).get('event'), []);
  const focusedRef = useRef(false);

  const activeContext = user?.active_context || 'personal';
  const activeBusinessId = user?.active_business_id;
  const timezone = getLocalTimezone();

  const ownerType = activeContext === 'business' ? 'business' : 'identity';
  const ownerId = activeContext === 'business' ? activeBusinessId : user?.id;

  // Pre-populate the New Event date from the clicked/selected calendar day.
  // selectedDate is updated whenever a day is clicked in the month grid (or
  // defaults to today), so New Event opens on the day the user is looking at.
  // The user can still change the date manually in the modal.
  const initialNewEventDate = useMemo(() => {
    if (!selectedDate) return '';
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [selectedDate]);

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
        allEvents = await getAllEventsForIdentity(user.id, activeContext, activeBusinessId, visibleRange.start, visibleRange.end, (err) => errors.push(err), { includeHidden: showHidden });
      } else {
        allEvents = await getAllEventsForIdentity(user.id, activeContext, activeBusinessId, visibleRange.start, visibleRange.end, (err) => errors.push(err), { includeHidden: showHidden });
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

  useEffect(() => { loadEvents(); }, [user, currentMonth, weekStart, selectedDate, view, activeContext, activeBusinessId, showHidden]);

  // ── Realtime propagation (§99) — secure signal channel ─────────
  // Replaces polling. The client subscribes to its OWN single
  // calendarSignals/{identityId} document via onSnapshot. A single-document
  // realtime listen evaluates the document read rule, where the get()-
  // derived identity check (`isOwner(identityId)`) IS allowed by the rules
  // engine — unlike collection LIST queries, which cannot evaluate
  // get()/exists()-derived values and therefore fail with "Missing or
  // insufficient permissions". Cloud Functions bump a version counter on
  // this doc whenever a calendar event / participation / invitation changes
  // for the identity. On any signal change we re-fetch the authoritative
  // view via getCalendarView. The authoritative read stays server-side, so
  // conflict/availability validation is never bypassed (§99). The signal
  // carries NO event data — only a version counter — so it cannot leak.
  //
  // A ref holds the latest loadEvents so the persistent subscription always
  // invokes the current closure (range/view/context-aware) without
  // re-subscribing on every navigation.
  const loadEventsRef = useRef(loadEvents);
  loadEventsRef.current = loadEvents;
  useEffect(() => {
    if (!user?.id) return;
    const unsubscribe = subscribeToCalendarSignal(user.id, () => loadEventsRef.current());
    return () => unsubscribe();
  }, [user?.id]);

  // After events load, jump to + highlight the deep-linked event once.
  // Auto-open the appropriate modal so a user following a notification
  // deep link (/calendar?event=X) lands directly on the event detail —
  // for an invitee that means the read-only EventDetailModal with
  // Accept/Decline; for an editor the EventModal. This mirrors a click
  // (handleSelectEvent) and changes no authority model.
  useEffect(() => {
    if (!focusEventId || focusedRef.current || loading || events.length === 0) return;
    const ev = events.find((e) => e.id === focusEventId);
    if (ev) {
      const evDate = new Date(ev.start_time);
      setCurrentMonth(new Date(evDate.getFullYear(), evDate.getMonth(), 1));
      setSelectedDate(evDate);
      focusedRef.current = true;
      handleSelectEvent(ev);
      // Clean the deep-link param so refresh / return doesn't reopen the modal
      const url = new URL(window.location.href);
      url.searchParams.delete('event');
      window.history.replaceState({}, '', url.toString());
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

  // ── Personal Event Lifecycle (§16) ──────────────────────
  // Mark a personal manual event as completed/skipped/archived. Only
  // personal identity-owned manual events support these states.
  const handleSetLifecycle = async (occ, state) => {
    const event = occ?.event || occ;
    if (!event) return;
    try {
      await setEventLifecycle(event.id, state);
      await loadEvents();
      toast({ title: `Marked as ${state}`, description: undefined });
    } catch (err) {
      toast({
        title: 'Could not update event',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  // ── Personal Timeline State (participant, non-owner) ─────────
  // Sets the viewer's PERSONAL lifecycle state (completed/skipped/archived)
  // and/or hidden_from_timeline on their own participation record. This is
  // personal state — it never alters the canonical event or the organiser's
  // lifecycle_state. "Remove from my timeline" (archived + hidden) hides the
  // event from this viewer's Calendar only; recoverable via "Show hidden".
  const handleSetPersonalTimelineState = async (occ, personalState, hidden) => {
    const event = occ?.event || occ;
    if (!event) return;
    setPersonalStateLoadingId(event.id);
    try {
      await setPersonalTimelineState(event.id, personalState, hidden);
      // Optimistically update the participation map so the UI reflects the
      // personal state immediately, then reload to reconcile with the
      // server-side hidden-from-timeline filtering.
      setParticipationMap((prev) => {
        const next = new Map(prev);
        const existing = next.get(event.id) || { event_id: event.id, identity_id: user.id };
        next.set(event.id, {
          ...existing,
          personal_lifecycle_state: personalState,
          hidden_from_timeline: hidden,
        });
        return next;
      });
      await loadEvents();
    } catch (err) {
      toast({
        title: 'Could not update personal state',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setPersonalStateLoadingId(null);
    }
  };

  // ── §49 Drag-and-drop reschedule ────────────────────────────
  // Invoked by Week/Day view drop targets. Routes through the canonical
  // server-side writers (saveCalendarEvent / saveOccurrenceException) so
  // authority, §39 conflict, booking/source ownership, timezone, recurrence
  // and security rules are preserved exactly. The UI gate (canEditEvent)
  // is applied inside rescheduleOccurrence; the server re-checks.
  const handleReschedule = async (occ, newStartIso) => {
    const event = occ?.event || occ;
    if (!event || reschedulingId) return;
    setReschedulingId(event.id);
    try {
      await rescheduleOccurrence(occ, newStartIso, user);
      await loadEvents();
      toast({ title: 'Event rescheduled' });
    } catch (err) {
      if (isConflictError(err)) {
        const d = new Date(newStartIso);
        const dateStr = d.toISOString().split('T')[0];
        const startTime = d.toTimeString().substring(0, 5);
        const durMs = new Date(occ.end).getTime() - new Date(occ.start).getTime();
        const durationMin = Math.max(15, Math.round(durMs / 60000));
        const alts = suggestAlternativeSlots({ date: dateStr, startTime, durationMinutes: durationMin, events });
        toast({
          title: 'Time slot unavailable',
          description: alts.length > 0
            ? `This time conflicts with an existing event. Try ${alts.slice(0, 3).map(a => `${a.start}–${a.end}`).join(', ')}.`
            : 'This time conflicts with an existing event.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Could not reschedule event',
          description: err?.message || 'Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setReschedulingId(null);
    }
  };

  // ── Delete vs Cancel (§52) ───────────────────────────────
  // Destructive removal of a personal Calendar-owned event. History is
  // preserved server-side (§108).
  const handleDeleteEvent = async (occ) => {
    const event = occ?.event || occ;
    if (!event || deletingId) return;
    if (!window.confirm(`Delete "${event.title}"? This permanently removes the event. History is preserved.`)) return;
    setDeletingId(event.id);
    try {
      await deleteEvent(event.id);
      await loadEvents();
      toast({ title: 'Event deleted' });
    } catch (err) {
      toast({
        title: 'Could not delete event',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  // ── Event selection — authority-gated (V2) ──────────────────
  // V2: visibility ≠ participation ≠ mutation authority. An invited/
  // assigned identity can READ the event and respond to their invitation,
  // but MUST NOT be presented with edit/cancel/reschedule capabilities.
  // Only the creator, identity owner, or business calendar manager gets
  // the edit modal. Everyone else gets the read-only detail modal (with
  // Accept/Decline for invited viewers). The server-side saveCalendarEvent
  // is the authoritative security boundary — this UI gate ensures the
  // UI does not present edit capabilities to non-authorised viewers.
  const handleSelectEvent = (occ) => {
    const event = occ?.event || occ;
    if (canEditEvent(event, user)) {
      setEditingEvent(event);
      setShowEventModal(true);
    } else {
      setViewingEvent(event);
      setShowDetailModal(true);
    }
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
          <CalendarSearchBar search={search} onSearchChange={setSearch} filters={filters} onFiltersChange={setFilters} showHidden={showHidden} onToggleShowHidden={setShowHidden} />
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
      <OfflineIndicator />

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
        <TodayView occurrences={filteredOccurrences} timezone={timezone} onSelectEvent={handleSelectEvent} participationMap={participationMap} onParticipationResponse={handleParticipationResponse} user={user} onSetLifecycle={handleSetLifecycle} onSetPersonalTimelineState={handleSetPersonalTimelineState} onDelete={handleDeleteEvent} onCancel={handleCancelEvent} cancellingId={cancellingId} deletingId={deletingId} personalStateLoadingId={personalStateLoadingId} />
      ) : view === 'week' ? (
        <WeekView occurrences={filteredOccurrences} weekStart={weekStart} timezone={timezone} onSelectEvent={handleSelectEvent} selectedDate={selectedDate} participationMap={participationMap} onParticipationResponse={handleParticipationResponse} user={user} onReschedule={handleReschedule} reschedulingId={reschedulingId} />
      ) : view === 'day' ? (
        <DayView occurrences={filteredOccurrences} date={selectedDate} timezone={timezone} onSelectEvent={handleSelectEvent} participationMap={participationMap} onParticipationResponse={handleParticipationResponse} user={user} onReschedule={handleReschedule} reschedulingId={reschedulingId} />
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
                              unavailable ? 'bg-amber-100 text-amber-700' : getEventChipClasses(occ.event, occ)
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
                        {!unavailable && canEditEvent(e, user) && (
                          <button onClick={() => handleSelectEvent(occ)} className="text-xs text-indigo-600 font-medium hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">Edit</button>
                        )}
                        {!unavailable && !canEditEvent(e, user) && (
                          <button onClick={() => handleSelectEvent(occ)} className="text-xs text-stone-600 font-medium hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">View details</button>
                        )}
                      </div>
                      <EventLifecycleActions
                        occ={occ}
                        user={user}
                        participationMap={participationMap}
                        onSetLifecycle={handleSetLifecycle}
                        onSetPersonalTimelineState={handleSetPersonalTimelineState}
                        onDelete={handleDeleteEvent}
                        onCancel={handleCancelEvent}
                        cancellingId={cancellingId}
                        deletingId={deletingId}
                        personalStateLoadingId={personalStateLoadingId}
                      />
                      {occ.isRecurring && canEditEvent(e, user) && e.source_system !== 'booking' && (
                        <OccurrenceActions occurrence={occ} user={user} onChanged={loadEvents} />
                      )}
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
          existingEvents={events}
          timezone={timezone}
          initialDate={editingEvent ? null : initialNewEventDate}
          onClose={() => { setShowEventModal(false); setEditingEvent(null); }}
          onSaved={handleEventSaved}
        />
      )}

      {showDetailModal && viewingEvent && (
        <EventDetailModal
          event={viewingEvent}
          timezone={timezone}
          user={user}
          participationMap={participationMap}
          onParticipationResponse={handleParticipationResponse}
          onSetPersonalTimelineState={handleSetPersonalTimelineState}
          personalStateLoadingId={personalStateLoadingId}
          onClose={() => { setShowDetailModal(false); setViewingEvent(null); }}
        />
      )}
    </div>
  );
}