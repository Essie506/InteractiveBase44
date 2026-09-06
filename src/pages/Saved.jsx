import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/firebase/firebaseClient';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { toggleSave } from '@/services/communityService';
import { Bookmark, Loader2 } from 'lucide-react';
import SavedItemCard from '@/components/community/SavedItemCard';
import { useToast } from '@/components/ui/use-toast';

export default function Saved() {
  const { user } = useAuth();
  const { toast } = useToast();
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

  const handleRemove = async (save) => {
    try {
      await toggleSave(save.target_system, save.target_type, save.target_id);
      setSaves(prev => prev.filter(s => s.id !== save.id));
      toast({ title: 'Removed from saved' });
    } catch (err) {
      toast({ title: 'Could not remove', variant: 'destructive' });
    }
  };

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
          {saves.map(save => (
            <SavedItemCard key={save.id} save={save} onRemove={handleRemove} />
          ))}
        </div>
      )}
    </div>
  );
}