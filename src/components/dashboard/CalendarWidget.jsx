import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getAllEventsForIdentity, getLocalTimezone, formatTimeRange } from '@/lib/calendar';
import { normalizeToOccurrences } from '@/lib/calendarOccurrences';
import { getEventChipClasses } from '@/lib/calendarCategory';
import { getSafeDisplayValues, isSourceUnavailable } from '@/lib/sourceUnavailable';
import { Calendar as CalendarIcon, Clock, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

// Dashboard Calendar module (§82). A compact "upcoming events" widget
// for the Dashboard. Uses the authoritative getCalendarView read path
// (Firebase mode) and the shared occurrence model. Clicking an event
// deep-links into the Calendar with the event focused.
export default function CalendarWidget() {
  const { user } = useAuth();
  const [occurrences, setOccurrences] = useState([]);
  const [loading, setLoading] = useState(true);
  const timezone = getLocalTimezone();

  useEffect(() => {
    if (!user) return;
    let active = true;
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setDate(end.getDate() + 14);
    (async () => {
      try {
        const activeContext = user.active_context || 'personal';
        const businessId = activeContext === 'business' ? user.active_business_id : null;
        const events = await getAllEventsForIdentity(user.id, activeContext, businessId, start, end);
        if (!active) return;
        const occs = normalizeToOccurrences(events, [], start, end)
          .filter((o) => new Date(o.start).getTime() >= Date.now())
          .sort((a, b) => new Date(a.start) - new Date(b.start))
          .slice(0, 5);
        setOccurrences(occs);
      } catch (err) {
        console.error('[CalendarWidget] load failed:', err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user]);

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-stone-800 flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-indigo-600" /> Upcoming
        </h3>
        <Link to="/calendar" className="text-xs text-indigo-600 font-medium hover:text-indigo-700 flex items-center gap-0.5">
          Calendar <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-6"><div className="w-5 h-5 border-2 border-stone-200 border-t-indigo-600 rounded-full animate-spin" /></div>
      ) : occurrences.length === 0 ? (
        <p className="text-sm text-stone-400 py-4 text-center">No upcoming events in the next 14 days.</p>
      ) : (
        <div className="space-y-2">
          {occurrences.map((occ) => {
            const e = occ.event;
            const safe = getSafeDisplayValues(e);
            const unavailable = isSourceUnavailable(e);
            return (
              <Link
                key={occ.occurrenceId}
                to={`/calendar?event=${e.id}`}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-stone-50 transition-colors"
              >
                <div className={`w-1.5 h-10 rounded-full ${unavailable ? 'bg-amber-400' : getEventChipClasses(e, occ).split(' ')[0]}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-stone-800 truncate">{safe.title}</div>
                  <div className="text-xs text-stone-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {e.all_day ? 'All day' : formatTimeRange(occ.start, occ.end, e.timezone || timezone)}
                  </div>
                </div>
                <div className="text-xs text-stone-400 text-right">
                  {new Date(occ.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}