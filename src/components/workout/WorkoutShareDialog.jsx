// WorkoutShareDialog — targeted Workout share to specific connections (Spec 12).
// ───────────────────────────────────────────────────────────
// Distinct from the Share Engine (Feed/commentary shares). This sends a
// direct in-app notification to selected accepted connections with a link
// to the Workout. Reuses the existing Connections system for recipient
// resolution — no new contact system.
import { useState, useEffect, useMemo } from 'react';
import { Loader2, Search, Send, X, User } from 'lucide-react';
import { listMyConnections } from '@/services/connectionService';
import { shareWorkoutWithConnections } from '@/services/workoutService';
import { useToast } from '@/components/ui/use-toast';

/**
 * @param {{ workoutId: string, workoutTitle?: string, onClose: () => void }} props
 */
export default function WorkoutShareDialog({ workoutId, workoutTitle, onClose }) {
  const { toast } = useToast();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [emailInput, setEmailInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listMyConnections()
      .then((res) => setConnections(res?.connections || []))
      .catch(() => setConnections([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return connections;
    const q = search.toLowerCase();
    return connections.filter((c) =>
      (c.display_name || '').toLowerCase().includes(q) ||
      (c.screen_name || '').toLowerCase().includes(q),
    );
  }, [connections, search]);

  const toggleRecipient = (identityId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(identityId)) next.delete(identityId);
      else next.add(identityId);
      return next;
    });
  };

  const handleAddEmail = () => {
    const email = emailInput.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.add(`email:${email}`);
      return next;
    });
    setEmailInput('');
  };

  const handleSubmit = async () => {
    const identityIds = Array.from(selected).filter((s) => !s.startsWith('email:'));
    const emails = Array.from(selected).filter((s) => s.startsWith('email:')).map((s) => s.slice(6));
    if (identityIds.length === 0 && emails.length === 0) {
      toast({ title: 'Select at least one recipient', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const result = await shareWorkoutWithConnections(workoutId, identityIds, emails);
      const msg = result.shared > 0
        ? `Shared with ${result.shared} connection${result.shared === 1 ? '' : 's'}`
        : 'No eligible recipients found';
      toast({ title: msg, description: result.skipped > 0 ? `${result.skipped} skipped (not a connection or blocked)` : undefined });
      onClose();
    } catch (err) {
      toast({ title: 'Could not share workout', description: err?.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-stone-800">Share workout</h2>
            <p className="text-sm text-stone-500 mt-0.5">{workoutTitle || 'Share with your connections'}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-stone-100">
            <X className="w-5 h-5 text-stone-400" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search connections by name..."
              className="w-full pl-9 pr-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          {/* Email input */}
          <div className="flex gap-2 mb-3">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddEmail(); } }}
              placeholder="Add by email..."
              className="flex-1 px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
            />
            <button
              onClick={handleAddEmail}
              disabled={!emailInput.trim()}
              className="px-3 py-2 text-sm font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50"
            >
              Add
            </button>
          </div>

          {/* Selected recipients */}
          {selected.size > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {Array.from(selected).map((s) => {
                const isEmail = s.startsWith('email:');
                const conn = isEmail ? null : connections.find((c) => c.identity_id === s);
                const label = isEmail ? s.slice(6) : (conn?.display_name || conn?.screen_name || 'Unknown');
                return (
                  <span key={s} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                    {label}
                    <button onClick={() => toggleRecipient(s)} className="hover:text-indigo-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Connections list */}
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-stone-300 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8">
              <User className="w-8 h-8 text-stone-300 mx-auto mb-2" />
              <p className="text-sm text-stone-400">{connections.length === 0 ? 'No connections yet.' : 'No connections found.'}</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {filtered.map((c) => (
                <button
                  key={c.identity_id}
                  onClick={() => toggleRecipient(c.identity_id)}
                  className={`flex items-center gap-3 w-full p-2.5 rounded-lg text-left transition-colors ${selected.has(c.identity_id) ? 'bg-indigo-50' : 'hover:bg-stone-50'}`}
                >
                  <div className="w-8 h-8 rounded-full bg-stone-200 overflow-hidden shrink-0">
                    {c.avatar_url ? (
                      <img src={c.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-medium text-stone-500">
                        {(c.display_name || '?')[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-800 truncate">{c.display_name || 'Unknown'}</p>
                    {c.screen_name && <p className="text-xs text-stone-400 truncate">@{c.screen_name}</p>}
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 shrink-0 ${selected.has(c.identity_id) ? 'bg-indigo-600 border-indigo-600' : 'border-stone-300'}`}>
                    {selected.has(c.identity_id) && <span className="flex items-center justify-center w-full h-full"><svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-stone-100">
          <button
            onClick={handleSubmit}
            disabled={submitting || selected.size === 0}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submitting ? 'Sharing...' : `Share with ${selected.size} recipient${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}