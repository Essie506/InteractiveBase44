// ReactionBar — reusable reaction + save bar for any target (Spec 20).
// Shows the 6 standard reaction types (§14) with live counts and the
// caller's active state, plus a save/bookmark toggle.
import { useState, useEffect, useCallback } from 'react';
import { Heart, Award, Dumbbell, ThumbsUp, Lightbulb, Flame, Bookmark, Loader2 } from 'lucide-react';
import { listReactions, toggleReaction, toggleSave, getInteractionState } from '@/services/communityService';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';

const REACTION_TYPES = [
  { type: 'support', icon: Heart, label: 'Support', activeClass: 'text-rose-600 bg-rose-50' },
  { type: 'celebrate', icon: Award, label: 'Celebrate', activeClass: 'text-amber-600 bg-amber-50' },
  { type: 'strong', icon: Dumbbell, label: 'Strong', activeClass: 'text-indigo-600 bg-indigo-50' },
  { type: 'nice_work', icon: ThumbsUp, label: 'Nice Work', activeClass: 'text-emerald-600 bg-emerald-50' },
  { type: 'helpful', icon: Lightbulb, label: 'Helpful', activeClass: 'text-yellow-600 bg-yellow-50' },
  { type: 'inspiring', icon: Flame, label: 'Inspiring', activeClass: 'text-orange-600 bg-orange-50' },
];

export default function ReactionBar({ targetSystem, targetId, targetType }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [counts, setCounts] = useState({});
  const [myReactions, setMyReactions] = useState([]);
  const [saveActive, setSaveActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);
  const [saveToggling, setSaveToggling] = useState(false);

  const load = useCallback(async () => {
    if (!targetSystem || !targetId) return;
    setLoading(true);
    try {
      const [c, state] = await Promise.all([
        listReactions(targetSystem, targetId),
        user ? getInteractionState(targetSystem, targetId).catch(() => null) : Promise.resolve(null),
      ]);
      setCounts(c);
      if (state) {
        setMyReactions(state.my_reaction_types || []);
        setSaveActive(state.my_save_state === 'active');
      }
    } catch (err) {
      console.error('Failed to load reactions:', err);
    } finally {
      setLoading(false);
    }
  }, [targetSystem, targetId, user]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (reactionType) => {
    if (!user) { toast({ title: 'Sign in to react', variant: 'destructive' }); return; }
    setToggling(reactionType);
    try {
      const result = await toggleReaction(targetSystem, targetType, targetId, reactionType);
      const active = result.state === 'active';
      setMyReactions((prev) => active ? [...new Set([...prev, reactionType])] : prev.filter((r) => r !== reactionType));
      setCounts((prev) => ({ ...prev, [reactionType]: Math.max(0, (prev[reactionType] || 0) + (active ? 1 : -1)) }));
    } catch (err) {
      toast({ title: 'Could not react', variant: 'destructive' });
    } finally {
      setToggling(null);
    }
  };

  const handleSave = async () => {
    if (!user) { toast({ title: 'Sign in to save', variant: 'destructive' }); return; }
    setSaveToggling(true);
    try {
      const result = await toggleSave(targetSystem, targetType, targetId);
      setSaveActive(result.state === 'active');
    } catch (err) {
      toast({ title: 'Could not save', variant: 'destructive' });
    } finally {
      setSaveToggling(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {REACTION_TYPES.map(({ type, icon: Icon, label, activeClass }) => {
        const count = counts[type] || 0;
        const active = myReactions.includes(type);
        return (
          <button
            key={type}
            onClick={() => handleToggle(type)}
            disabled={toggling === type || loading}
            aria-label={label}
            title={label}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
              active ? activeClass : 'text-stone-500 hover:bg-stone-100'
            } disabled:opacity-50`}
          >
            {toggling === type ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
            {count > 0 && <span>{count}</span>}
          </button>
        );
      })}
      <button
        onClick={handleSave}
        disabled={saveToggling || loading}
        aria-label="Save"
        title="Save"
        className={`ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
          saveActive ? 'text-indigo-600 bg-indigo-50' : 'text-stone-500 hover:bg-stone-100'
        } disabled:opacity-50`}
      >
        {saveToggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bookmark className={`w-3.5 h-3.5 ${saveActive ? 'fill-current' : ''}`} />}
      </button>
    </div>
  );
}