import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/firebase/firebaseClient';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { Bookmark, Loader2, Dumbbell, Calendar, FileText } from 'lucide-react';

const TARGET_LABELS = {
  post: { label: 'Post', icon: FileText, path: '/feed' },
  workout: { label: 'Workout', icon: Dumbbell, path: '/workouts' },
  event: { label: 'Event', icon: Calendar, path: '/calendar' },
};

export default function Saved() {
  const { user } = useAuth();
  const [saves, setSaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSaves = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const q = query(
        collection(db, 'saves'),
        where('identity_id', '==', user.id),
        where('state', '==', 'active'),
        orderBy('_created_date', 'desc'),
      );
      const snap = await getDocs(q);
      setSaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('[Saved] Failed to load saves:', err);
      setError(err?.message || 'Failed to load saved content');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadSaves(); }, [loadSaves]);

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-stone-800 flex items-center gap-2">
          <Bookmark className="w-5 h-5 text-indigo-600" /> Saved
        </h1>
        <p className="text-stone-500 text-sm">Content you've saved across Interactive</p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-stone-300 animate-spin" />
        </div>
      )}

      {error && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700 mb-4">
          {error}. <button onClick={loadSaves} className="underline font-medium">Try again</button>
        </div>
      )}

      {!loading && !error && saves.length === 0 && (
        <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
          <Bookmark className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-stone-700 mb-1">Nothing saved yet</h3>
          <p className="text-sm text-stone-500">Save posts, workouts and events to find them here later.</p>
        </div>
      )}

      {!loading && !error && saves.length > 0 && (
        <div className="space-y-3">
          {saves.map(save => {
            const meta = TARGET_LABELS[save.target_system] || TARGET_LABELS[save.target_type] || { label: save.target_system, icon: FileText, path: '/feed' };
            const Icon = meta.icon;
            return (
              <Link
                key={save.id}
                to={`${meta.path}`}
                className="flex items-center gap-3 bg-white rounded-xl border border-stone-200 p-4 hover:border-stone-300 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-stone-800">{meta.label}</div>
                  <div className="text-xs text-stone-500 truncate">
                    Saved from {save.target_system} · {save.target_id.slice(0, 8)}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}