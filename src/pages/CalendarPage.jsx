import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getAllEventsForIdentity, formatTimeRange, getLocalTimezone, cancelEvent } from '@/lib/calendar';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Clock, MapPin, Trash2, Loader2, CalendarOff } from 'lucide-react';
import EventModal from '@/components/calendar/EventModal';
import { useToast } from '@/components/ui/use-toast';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CalendarPage() {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const { toast } = useToast();

  const activeContext = user?.active_context || 'personal';
  const activeBusinessId = user?.active_business_id;
  const timezone = getLocalTimezone();

  // Personal and Professional are operating CONTEXTS of one identity, not
  // separate owners. Both use owner_type 'identity' + owner_id = identityId.
  // Only Business is a separate (organisational) owner.
  const ownerType = activeContext === 'business' ? 'business' : 'identity';
  const ownerId = activeContext === 'business' ? activeBusinessId : user?.id;

  // Load events for the current month
  const loadEvents = async () => {
    if (!user) return;
    setLoading(true);
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59);
    const allEvents = await getAllEventsForIdentity(user.id, activeContext, activeBusinessId, startOfMonth, endOfMonth);
    setEvents(allEvents);
    setLoading(false);
  };

  useEffect(() => {loadEvents();}, [user, currentMonth, activeContext, activeBusinessId]);

  // Generate calendar grid days
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Monday = 0
    const startDate = new Date(year, month, 1 - startDayOfWeek);
    const days = [];
    for (let i = 0; i < 42; i++) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + i);
      days.push(day);
    }
    return days;
  }, [currentMonth]);

  // Events for a specific day
  const eventsForDay = (date) => {
    const dateStr = date.toDateString();
    return events.filter((e) => new Date(e.start_time).toDateString() === dateStr);
  };

  // Events for the selected date
  const selectedDateEvents = eventsForDay(selectedDate);

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const goToday = () => {setCurrentMonth(new Date());setSelectedDate(new Date());};

  const handleEventSaved = () => {
    setShowEventModal(false);
    setEditingEvent(null);
    loadEvents();
  };

  // Cancel an existing manual Calendar event through the canonical
  // server-side writer (saveCalendarEvent). Booking-owned events are not
  // cancellable here — the button is hidden for them and the server
  // rejects the request; they must go through the Booking cancellation
  // flow which evaluates refund policy and releases the slot hold.
  const handleCancelEvent = async (event) => {
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

  const contextLabel = activeContext === 'business' ? 'Business' : activeContext === 'professional' ? 'Professional' : 'Personal';

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          
          <p className="text-stone-500">Your authoritative Interactive calendar</p>
        </div>
        <button
          onClick={() => {setEditingEvent(null);setShowEventModal(true);}}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          
          <Plus className="w-4 h-4" /> New Event
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar grid */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-stone-200 p-4 md:p-6">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-stone-800">{MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}</h2>
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="p-2 hover:bg-stone-100 rounded-lg transition-colors"><ChevronLeft className="w-4 h-4 text-stone-600" /></button>
              <button onClick={goToday} className="px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 rounded-lg transition-colors">Today</button>
              <button onClick={nextMonth} className="p-2 hover:bg-stone-100 rounded-lg transition-colors"><ChevronRight className="w-4 h-4 text-stone-600" /></button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {WEEKDAYS.map((day) =>
            <div key={day} className="text-center text-xs font-medium text-stone-500 py-2">{day}</div>
            )}
          </div>

          {/* Day cells */}
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
                  className={`min-h-[70px] md:min-h-[90px] p-1.5 rounded-lg text-left border transition-colors ${
                  isSelected ? 'border-indigo-400 bg-indigo-50' : 'border-stone-100 hover:bg-stone-50'} ${
                  !isCurrentMonth ? 'opacity-40' : ''}`}>
                  
                  <div className={`text-xs font-medium mb-1 ${isToday ? 'w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center' : 'text-stone-700'}`}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((e) =>
                    <div key={e.id} className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded truncate font-medium">
                        {e.title}
                      </div>
                    )}
                    {dayEvents.length > 3 && <div className="text-[10px] text-stone-400 px-1">+{dayEvents.length - 3} more</div>}
                  </div>
                </button>);

            })}
          </div>
        </div>

        {/* Selected date events */}
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <h3 className="font-semibold text-stone-800 mb-1">
            {selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          <p className="text-sm text-stone-500 mb-4">{selectedDateEvents.length} event{selectedDateEvents.length !== 1 ? 's' : ''}</p>

          {loading ?
          <div className="flex items-center justify-center py-8"><div className="w-6 h-6 border-2 border-stone-200 border-t-indigo-600 rounded-full animate-spin" /></div> :
          selectedDateEvents.length === 0 ?
          <div className="text-center py-8">
              <CalendarIcon className="w-8 h-8 text-stone-300 mx-auto mb-2" />
              <p className="text-sm text-stone-400">No events on this day</p>
              <button onClick={() => {setEditingEvent(null);setShowEventModal(true);}} className="mt-3 text-sm text-indigo-600 font-medium hover:text-indigo-700">Add event</button>
            </div> :

          <div className="space-y-3">
              {selectedDateEvents.map((e) =>
            <div key={e.id} className="border border-stone-200 rounded-lg p-3 hover:border-stone-300 transition-colors">
                  <div className="flex items-start justify-between mb-1">
                    <h4 className="font-medium text-stone-800 text-sm">{e.title}</h4>
                    {e.lifecycle_state === 'cancelled' && <span className="text-xs text-red-500">Cancelled</span>}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-stone-500 mb-1">
                    <Clock className="w-3 h-3" />
                    {e.all_day ? 'All day' : formatTimeRange(e.start_time, e.end_time, e.timezone || timezone)}
                  </div>
                  {e.location_type !== 'physical' && e.meeting_url &&
              <div className="flex items-center gap-1.5 text-xs text-stone-500 mb-1">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">{e.meeting_url}</span>
                    </div>
              }
                  {e.description && <p className="text-xs text-stone-600 mt-1.5">{e.description}</p>}
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => {setEditingEvent(e);setShowEventModal(true);}} className="text-xs text-indigo-600 font-medium hover:text-indigo-700">Edit</button>
                    {e.lifecycle_state !== 'cancelled' && e.source_system !== 'booking' &&
                      <button
                        onClick={() => handleCancelEvent(e)}
                        disabled={cancellingId === e.id}
                        className="text-xs text-red-500 font-medium hover:text-red-600 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
                        {cancellingId === e.id
                          ? <><Loader2 className="w-3 h-3 animate-spin" /> Cancelling...</>
                          : <><Trash2 className="w-3 h-3" /> Cancel</>}
                      </button>
                    }
                    {e.lifecycle_state !== 'cancelled' && e.source_system === 'booking' &&
                      <span className="text-xs text-stone-400 flex items-center gap-1">
                        <CalendarOff className="w-3 h-3" /> Cancel via Bookings
                      </span>
                    }
                  </div>
                </div>
            )}
            </div>
          }
        </div>
      </div>

      {showEventModal &&
      <EventModal
        ownerId={ownerId}
        ownerType={ownerType}
        operatingContext={activeContext}
        createdBy={user.id}
        businessId={activeContext === 'business' ? activeBusinessId : null}
        existingEvent={editingEvent}
        timezone={timezone}
        onClose={() => {setShowEventModal(false);setEditingEvent(null);}}
        onSaved={handleEventSaved} />

      }
    </div>);

}