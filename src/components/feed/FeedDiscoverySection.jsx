// FeedDiscoverySection — surfaces connected content types in the Feed
// (Issue 5). Displays workouts, events, and professionals/businesses as
// discovery cards with click-through to the owning system. Each card
// references the authoritative domain object — no duplication.
import { Link } from 'react-router-dom';
import { Dumbbell, Calendar, ArrowRight, MapPin } from 'lucide-react';

function WorkoutDiscoveryCard({ workout }) {
  return (
    <Link
      to={`/workouts/${workout.id}`}
      className="group bg-white rounded-xl border border-stone-200 p-4 hover:border-indigo-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-3">
        {workout.cover_url ? (
          <img src={workout.cover_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
            <Dumbbell className="w-6 h-6 text-indigo-500" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-stone-800 truncate group-hover:text-indigo-600">{workout.title}</h3>
          <p className="text-xs text-stone-500 truncate">{workout.workout_type?.replace(/_/g, ' ')}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-stone-400">
            <span>{workout.duration_minutes || 30}m</span>
            {workout.difficulty && <span>· {workout.difficulty}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}

function EventDiscoveryCard({ event }) {
  const dateStr = event.start_time
    ? new Date(event.start_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : '';
  const timeStr = event.start_time
    ? new Date(event.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <Link
      to={`/e/${event.id}`}
      className="group bg-white rounded-xl border border-stone-200 p-4 hover:border-indigo-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-3">
        {event.cover_url ? (
          <img src={event.cover_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <Calendar className="w-6 h-6 text-emerald-500" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-stone-800 truncate group-hover:text-indigo-600">{event.title}</h3>
          <div className="flex items-center gap-2 mt-1 text-xs text-stone-400">
            <span>{dateStr} · {timeStr}</span>
          </div>
          {event.location && (
            <div className="flex items-center gap-1 mt-0.5 text-xs text-stone-400">
              <MapPin className="w-3 h-3" /> <span className="truncate">{event.location}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

/**
 * @param {{
 *   workouts: Array,
 *   events: Array,
 *   location: object | null,
 * }} props
 */
export default function FeedDiscoverySection({ workouts, events, location }) {
  const hasWorkouts = workouts && workouts.length > 0;
  const hasEvents = events && events.length > 0;

  if (!hasWorkouts && !hasEvents) return null;

  return (
    <div className="space-y-4">
      {hasWorkouts && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-stone-700 flex items-center gap-1.5">
              <Dumbbell className="w-4 h-4 text-indigo-600" /> Workouts
            </h2>
            <Link to="/workouts" className="text-xs text-indigo-600 font-medium hover:text-indigo-700 flex items-center gap-0.5">
              See all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {workouts.slice(0, 4).map(w => <WorkoutDiscoveryCard key={w.id} workout={w} />)}
          </div>
        </div>
      )}
      {hasEvents && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-stone-700 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-emerald-600" /> Upcoming events
              {location && <span className="text-xs text-stone-400 font-normal">· near {location.label}</span>}
            </h2>
            <Link to="/directory?type=event" className="text-xs text-indigo-600 font-medium hover:text-indigo-700 flex items-center gap-0.5">
              See all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {events.slice(0, 4).map(e => <EventDiscoveryCard key={e.id} event={e} />)}
          </div>
        </div>
      )}
    </div>
  );
}