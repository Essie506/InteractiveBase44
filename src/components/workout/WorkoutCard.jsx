// WorkoutCard — card for the workout list/grid (Spec 12).
import { Link } from 'react-router-dom';
import { Clock, Dumbbell } from 'lucide-react';

const TYPE_LABELS = {
  individual: 'Individual', programme: 'Programme', training_plan: 'Training Plan',
  challenge: 'Challenge', rehab: 'Rehab', mobility: 'Mobility', stretching: 'Stretching',
  yoga: 'Yoga', pilates: 'Pilates', cardio: 'Cardio', strength: 'Strength',
  sports_specific: 'Sports', educational: 'Educational', assessment: 'Assessment', recovery: 'Recovery',
};

const DIFFICULTY_COLORS = {
  beginner: 'text-emerald-600 bg-emerald-50',
  intermediate: 'text-amber-600 bg-amber-50',
  advanced: 'text-rose-600 bg-rose-50',
  all_levels: 'text-stone-600 bg-stone-100',
};

export default function WorkoutCard({ workout }) {
  return (
    <Link to={`/workouts/${workout.id}`} className="block bg-white rounded-xl border border-stone-200 overflow-hidden hover:border-indigo-300 hover:shadow-sm transition-all">
      {workout.cover_url ? (
        <div className="aspect-video bg-stone-100">
          <img src={workout.cover_url} alt={workout.title} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="aspect-video bg-gradient-to-br from-indigo-50 to-stone-100 flex items-center justify-center">
          <Dumbbell className="w-8 h-8 text-indigo-300" />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">{TYPE_LABELS[workout.workout_type] || workout.workout_type}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLORS[workout.difficulty] || DIFFICULTY_COLORS.all_levels}`}>{workout.difficulty?.replace('_', ' ')}</span>
        </div>
        <h3 className="font-semibold text-stone-800 mb-1 line-clamp-1">{workout.title}</h3>
        <p className="text-sm text-stone-500 line-clamp-2 mb-3">{workout.description || 'No description'}</p>
        <div className="flex items-center gap-3 text-xs text-stone-400">
          <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {workout.duration_minutes}m</span>
          {workout.exercises?.length > 0 && <span className="inline-flex items-center gap-1"><Dumbbell className="w-3 h-3" /> {workout.exercises.length}</span>}
        </div>
      </div>
    </Link>
  );
}