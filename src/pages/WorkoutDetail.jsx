// WorkoutDetail — full workout view with community interaction (Spec 12 + Spec 20).
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Clock, Dumbbell, ArrowLeft, Pencil, Loader2 } from 'lucide-react';
import { getWorkout } from '@/services/workoutService';
import { useAuth } from '@/lib/AuthContext';
import ReactionBar from '@/components/community/ReactionBar';
import CommentSection from '@/components/community/CommentSection';

const TYPE_LABELS = {
  individual: 'Individual', programme: 'Programme', training_plan: 'Training Plan',
  challenge: 'Challenge', rehab: 'Rehab', mobility: 'Mobility', stretching: 'Stretching',
  yoga: 'Yoga', pilates: 'Pilates', cardio: 'Cardio', strength: 'Strength',
  sports_specific: 'Sports', educational: 'Educational', assessment: 'Assessment', recovery: 'Recovery',
};

export default function WorkoutDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [workout, setWorkout] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        setWorkout(await getWorkout(id));
      } catch (err) {
        console.error('Failed to load workout:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-stone-300 animate-spin" /></div>;
  if (!workout) return (
    <div className="text-center py-20">
      <p className="text-stone-400 mb-2">Workout not found.</p>
      <Link to="/workouts" className="text-indigo-600 text-sm font-medium">Back to Workouts</Link>
    </div>
  );

  const isOwner = user && workout.creator_identity_id === user.id;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <Link to="/workouts" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Workouts
      </Link>

      {workout.cover_url && (
        <div className="aspect-video rounded-xl overflow-hidden mb-6 bg-stone-100">
          <img src={workout.cover_url} alt={workout.title} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">{TYPE_LABELS[workout.workout_type] || workout.workout_type}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-medium">{workout.difficulty?.replace('_', ' ')}</span>
            <span className="text-xs text-stone-400 capitalize">{workout.lifecycle_state}</span>
          </div>
          <h1 className="text-2xl font-bold text-stone-800">{workout.title}</h1>
        </div>
        {isOwner && (
          <Link to={`/workouts/${workout.id}/edit`} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 rounded-lg flex-shrink-0">
            <Pencil className="w-4 h-4" /> Edit
          </Link>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm text-stone-500 mb-6">
        <span className="inline-flex items-center gap-1"><Clock className="w-4 h-4" /> {workout.duration_minutes} min</span>
        {workout.exercises?.length > 0 && <span className="inline-flex items-center gap-1"><Dumbbell className="w-4 h-4" /> {workout.exercises.length} exercises</span>}
      </div>

      {workout.description && <p className="text-stone-600 mb-6 whitespace-pre-wrap">{workout.description}</p>}

      {workout.media_url && (
        <div className="mb-8">
          <video src={workout.media_url} controls className="w-full rounded-lg bg-black">
            Your browser does not support video playback.
          </video>
        </div>
      )}

      {workout.exercises?.length > 0 && (
        <div className="mb-8">
          <h2 className="font-semibold text-stone-800 mb-3">Exercises</h2>
          <div className="space-y-2">
            {workout.exercises.map((ex, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-lg p-3">
                <div className="font-medium text-stone-800">{i + 1}. {ex.name}</div>
                {ex.description && <p className="text-sm text-stone-500 mt-1">{ex.description}</p>}
                <div className="flex gap-3 mt-1 text-xs text-stone-400">
                  {ex.sets && <span>{ex.sets} sets</span>}
                  {ex.reps && <span>{ex.reps} reps</span>}
                  {ex.duration_seconds && <span>{ex.duration_seconds}s</span>}
                  {ex.rest_seconds && <span>{ex.rest_seconds}s rest</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Community Interaction (Spec 20) */}
      <div className="border-t border-stone-100 pt-6">
        <ReactionBar targetSystem="workout" targetType="workout" targetId={workout.id} />
        <div className="mt-6">
          <CommentSection targetSystem="workout" targetType="workout" targetId={workout.id} />
        </div>
      </div>
    </div>
  );
}