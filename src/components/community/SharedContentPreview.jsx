// SharedContentPreview — renders a compact preview of the original
// content referenced by a commentary share (§14.4). Fetches the
// referenced content from the appropriate system collection and
// displays a clickable card linking to the content detail page.
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Dumbbell, Calendar, FileText, Loader2, ArrowRight } from 'lucide-react';
import { fetchPostById } from '@/services/postService';
import { getWorkout } from '@/services/workoutService';
import { getPublicPersonalProfileByIdentity, getPublicProfessionalProfileByIdentity } from '@/services/profileService';
import { getPublicBusinessProfile } from '@/services/businessService';
import { db } from '@/firebase/firebaseClient';
import { doc, getDoc } from 'firebase/firestore';

const SYSTEM_META = {
  post: { icon: FileText, label: 'Post', link: (id) => '/feed' },
  workout: { icon: Dumbbell, label: 'Workout', link: (id) => `/workouts/${id}` },
  event: { icon: Calendar, label: 'Event', link: (id) => `/e/${id}` },
};

export default function SharedContentPreview({ targetSystem, targetType, targetId }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        if (targetSystem === 'post' || targetType === 'post') {
          const post = await fetchPostById(targetId);
          if (cancelled) return;
          if (!post) { setContent(null); return; }
          // Resolve the ORIGINAL author — preserves the distinction between
          // the sharer (ShareCard header) and the original post author (here).
          let authorName = null;
          try {
            if (post.author_type === 'business' && post.business_id) {
              const biz = await getPublicBusinessProfile(post.business_id);
              authorName = biz?.name || null;
            } else if (post.author_identity_id) {
              const isPersonal = post.operating_context === 'personal';
              const profile = isPersonal
                ? await getPublicPersonalProfileByIdentity(post.author_identity_id)
                : await getPublicProfessionalProfileByIdentity(post.author_identity_id);
              authorName = profile?.display_name || null;
            }
          } catch { /* non-critical */ }
          if (!cancelled) setContent({ title: post.body?.slice(0, 120) || 'Post', system: 'post', authorName });
        } else if (targetSystem === 'workout' || targetType === 'workout') {
          const workout = await getWorkout(targetId);
          if (!cancelled) setContent(workout ? { title: workout.title, subtitle: workout.workout_type, system: 'workout', image: workout.cover_url } : null);
        } else if (targetSystem === 'event' || targetType === 'event') {
          const snap = await getDoc(doc(db, 'calendarEventsPublic', targetId));
          if (!cancelled) {
            const eventData = /** @type {any} */ (snap.data());
            /** @type {import('@/types/domain').CalendarEvent | null} */
            const event = snap.exists() && eventData ? { id: snap.id, ...eventData } : null;
            setContent(event ? { title: event.title, subtitle: event.location, system: 'event', image: event.cover_url } : null);
          }
        }
      } catch (err) {
        console.error('[SharedContentPreview] Failed to load:', err);
        if (!cancelled) setContent(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [targetSystem, targetType, targetId]);

  const meta = SYSTEM_META[targetSystem] || SYSTEM_META[targetType] || { icon: FileText, label: targetSystem, link: () => '/feed' };
  const Icon = meta.icon;

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-stone-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading shared content…
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-stone-400">
        <Icon className="w-3.5 h-3.5" /> {meta.label} no longer available
      </div>
    );
  }

  const link = meta.link(targetId);

  return (
    <Link
      to={link}
      className="block border border-stone-200 rounded-lg overflow-hidden hover:border-stone-300 transition-colors group"
    >
      <div className="flex items-stretch">
        {content.image && (
          <div className="w-20 h-20 shrink-0 bg-stone-100 overflow-hidden">
            <img src={content.image} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0 p-3">
          <div className="flex items-center gap-1.5 text-xs text-stone-400 mb-1">
            <Icon className="w-3.5 h-3.5" />
            <span className="font-medium uppercase tracking-wide">{meta.label}</span>
          </div>
          <div className="text-sm font-medium text-stone-800 line-clamp-2">{content.title}</div>
          {content.authorName && (
            <div className="text-xs text-stone-500 mt-0.5">by {content.authorName}</div>
          )}
          {content.subtitle && (
            <div className="text-xs text-stone-500 mt-0.5 capitalize">{content.subtitle?.replace(/_/g, ' ')}</div>
          )}
        </div>
        <div className="flex items-center pr-3 text-stone-300 group-hover:text-stone-500 transition-colors">
          <ArrowRight className="w-4 h-4" />
        </div>
      </div>
    </Link>
  );
}