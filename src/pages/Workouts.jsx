// Workouts — browse published workouts + manage your own (Spec 12).
import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Plus, Loader2, LogIn } from 'lucide-react';
import { listPublishedWorkouts, listMyWorkouts, listSavedWorkouts, listBusinessWorkouts } from '@/services/workoutService';
import { useAuth } from '@/lib/AuthContext';
import WorkoutCard from '@/components/workout/WorkoutCard';

const TYPE_FILTERS = ['all', 'individual', 'programme', 'strength', 'cardio', 'yoga', 'mobility', 'recovery', 'stretching', 'challenge'];

export default function Workouts() {
  const { user } = useAuth();
  const location = useLocation();
  const returnTo = encodeURIComponent(location.pathname + location.search);
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('discover');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        let list;
        if (tab === 'mine' && user) {
          if (user.active_context === 'business' && user.active_business_id) {
            list = await listBusinessWorkouts(user.active_business_id);
          } else if (user.active_context === 'personal' || !user.professional_activated) {
            list = await listSavedWorkouts(user.id);
          } else {
            list = await listMyWorkouts(user.id);
          }
        } else {
          list = await listPublishedWorkouts();
        }
        setWorkouts(list);
      } catch (err) {
        console.error('Failed to load workouts:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tab, user]);

  const filtered = typeFilter === 'all' ? workouts : workouts.filter((w) => w.workout_type === typeFilter);

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Workouts</h1>
          <p className="text-stone-500 text-sm">Discover and manage workout content</p>
        </div>
        {user && (user.professional_activated || (user.active_context === 'business' && user.active_business_id)) ? (
          <Link to="/workouts/new" className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> New Workout
          </Link>
        ) : user ? null : (
          <Link to={`/login?returnTo=${returnTo}`} className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <LogIn className="w-4 h-4" /> Sign in to create
          </Link>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('discover')} className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === 'discover' ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>Discover</button>
        {user && (
          <button onClick={() => setTab('mine')} className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === 'mine' ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>My Workouts</button>
        )}
      </div>

      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
        {TYPE_FILTERS.map((t) => (
          <button key={t} onClick={() => setTypeFilter(t)} className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${typeFilter === t ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
            {t === 'all' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1).replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-stone-300 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-stone-400 mb-2">No workouts found.</p>
          {tab === 'mine' && user && (user.professional_activated || (user.active_context === 'business' && user.active_business_id)) && <Link to="/workouts/new" className="text-indigo-600 text-sm font-medium">Create your first workout</Link>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((w) => <WorkoutCard key={w.id} workout={w} />)}
        </div>
      )}
    </div>
  );
}