/**
 * ProfileContentSection — cross-system discovery surface.
 * ───────────────────────────────────────────────────────────
 * Renders a professional's or business's published workouts and
 * upcoming public events directly on their profile page, connecting
 * the Workout System and Calendar System to the Profile System.
 *
 * Works for both identity-owned and business-owned content because
 * workouts and calendarEventsPublic both key on `owner_id`.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Dumbbell, Calendar, ArrowRight, MapPin, Clock } from 'lucide-react';
import { listPublishedWorkoutsByOwner } from '@/services/workoutService';
import { listPublicEventsByOwner } from '@/services/discoveryService';
import WorkoutCard from '@/components/workout/WorkoutCard';

function formatEventDateParts(startIso) {
  if (!startIso) return null;
  try {
    const d = new Date(startIso);
    return {
      day: d.toLocaleDateString('en-GB', { day: 'numeric' }),
      month: d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(),
    };
  } catch {
    return null;
  }
}

function formatEventTime(startIso, endIso) {
  if (!startIso) return '';
  try {
    const s = new Date(startIso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
    if (endIso) {
      return `${s} – ${new Date(endIso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })}`;
    }
    return s;
  } catch {
    return '';
  }
}

export default function ProfileContentSection({ ownerId }) {
  const [workouts, setWorkouts] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerId) return;
    setLoading(true);
    Promise.allSettled([
      listPublishedWorkoutsByOwner(ownerId),
      listPublicEventsByOwner(ownerId),
    ]).then(([wRes, eRes]) => {
      setWorkouts(wRes.status === 'fulfilled' ? wRes.value : []);
      setEvents(eRes.status === 'fulfilled' ? eRes.value : []);
    }).finally(() => setLoading(false));
  }, [ownerId]);

  if (loading) return null;
  if (workouts.length === 0 && events.length === 0) return null;

  return (
    <div className="space-y-8">
      {events.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-stone-800 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-500" />
            Upcoming Events
          </h2>
          <div className="grid gap-3">
            {events.map((e) => {
              const dt = formatEventDateParts(e.start_time);
              const eventId = e.event_id || e.id;
              return (
                <Link
                  key={eventId}
                  to={`/e/${eventId}`}
                  className="group flex items-center gap-4 bg-white rounded-xl border border-stone-200 p-4 hover:border-indigo-300 hover:shadow-sm transition-all"
                >
                  {dt && (
                    <div className="w-14 h-14 rounded-lg bg-indigo-50 flex flex-col items-center justify-center shrink-0">
                      <span className="text-[10px] text-indigo-500 font-semibold tracking-wide">{dt.month}</span>
                      <span className="text-xl font-bold text-indigo-700">{dt.day}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-stone-800 truncate group-hover:text-indigo-600 transition-colors">
                      {e.title}
                    </h3>
                    <div className="flex items-center gap-3 text-sm text-stone-500 flex-wrap">
                      {e.start_time && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatEventTime(e.start_time, e.end_time)}
                        </span>
                      )}
                      {(e.location || e.location_label) && (
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{e.location || e.location_label}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-stone-300 group-hover:text-indigo-500 transition-colors shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {workouts.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-stone-800 mb-3 flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-indigo-500" />
            Workouts
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {workouts.map((w) => (
              <WorkoutCard key={w.id} workout={w} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}