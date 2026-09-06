// SavedItemCard — renders a single saved content item with its actual
// title and a deep link to the content detail page. Fetches the
// referenced content from the appropriate system collection so the
// Saved page shows meaningful previews instead of truncated IDs.
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Dumbbell, Calendar, FileText, Loader2, Bookmark } from 'lucide-react';
import { fetchPostById } from '@/services/postService';
import { getWorkout } from '@/services/workoutService';
import { db } from '@/firebase/firebaseClient';
import { doc, getDoc } from 'firebase/firestore';

const SYSTEM_META = {
  post: { icon: FileText, label: 'Post', link: () => '/feed' },
  workout: { icon: Dumbbell, label: 'Workout', link: (id) => `/workouts/${id}` },
  event: { icon: Calendar, label: 'Event', link: (id) => `/e/${id}` },
};

export default function SavedItemCard({ save, onRemove }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const sys = save.target_system || save.target_type;
        if (sys === 'post') {
          const post = await fetchPostById(save.target_id);
          if (!cancelled) setPreview(post ? { title: post.body?.slice(0, 100) || 'Post' } : null);
        } else if (sys === 'workout') {
          const workout = await getWorkout(save.target_id);
          if (!cancelled) setPreview(workout ? { title: workout.title, subtitle: workout.workout_type } : null);
        } else if (sys === 'event') {
          const snap = await getDoc(doc(db, 'calendarEventsPublic', save.target_id));
          if (!cancelled) {
            const event = snap.exists() ? snap.data() : null;
            setPreview(event ? { title: event.title, subtitle: event.location } : null);
          }
        }
      } catch (err) {
        console.error('[SavedItemCard] Failed to load:', err);
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [save.target_id, save.target_system, save.target_type]);

  const sys = save.target_system || save.target_type;
  const meta = SYSTEM_META[sys] || { icon: FileText, label: sys, link: () => '/feed' };
  const Icon = meta.icon;
  const link = meta.link(save.target_id);

  return (
    <div className="flex items-center gap-3 bg-white rounded-xl border border-stone-200 p-4 hover:border-stone-300 transition-colors group">
      <Link to={link} className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          {loading ? (
            <>
              <div className="text-sm font-medium text-stone-400 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading…
              </div>
              <div className="text-xs text-stone-400">{meta.label}</div>
            </>
          ) : preview ? (
            <>
              <div className="text-sm font-medium text-stone-800 truncate">{preview.title}</div>
              <div className="text-xs text-stone-500 truncate">
                {meta.label}{preview.subtitle ? ` · ${preview.subtitle?.replace(/_/g, ' ')}` : ''}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-medium text-stone-400">{meta.label} no longer available</div>
              <div className="text-xs text-stone-400">Removed or deleted</div>
            </>
          )}
        </div>
      </Link>
      <button
        onClick={() => onRemove?.(save)}
        className="p-2 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
        aria-label="Remove from saved"
      >
        <Bookmark className="w-4 h-4 fill-current" />
      </button>
    </div>
  );
}