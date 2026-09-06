import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { listBlocksForBlocker, removeBlock } from '@/data/firebase/firebaseBlockRepository';
import { callResolveParticipants } from '@/services/firebaseFunctions';
import { Loader2, Ban, X } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function BlockedUsersPage() {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState([]);
  const [resolvedNames, setResolvedNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(null);

  useEffect(() => {
    if (!user) return;
    listBlocksForBlocker(user.id).then(async (list) => {
      const active = list.filter(b => b.status === 'active');
      setBlocks(active);
      if (active.length > 0) {
        try {
          const res = await callResolveParticipants({ identity_ids: active.map(b => b.blocked_id) });
          setResolvedNames(res.results || {});
        } catch {
          // fallback: show IDs only
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  const handleUnblock = async (blockedId) => {
    setRemoving(blockedId);
    try {
      await removeBlock(user.id, blockedId);
      setBlocks(prev => prev.filter(b => b.blocked_id !== blockedId));
    } finally {
      setRemoving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-stone-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link to="/settings" className="text-sm text-stone-500 hover:text-indigo-600 mb-2 inline-block">← Back to Settings</Link>
        <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1 flex items-center gap-2"><Ban className="w-7 h-7 text-stone-500" /> Blocked Users</h1>
        <p className="text-stone-500">Manage users you've blocked from contacting you or viewing your profile.</p>
      </div>

      {blocks.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
          <Ban className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <p className="text-stone-500">You haven't blocked anyone.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100">
          {blocks.map((block) => {
            const info = resolvedNames[block.blocked_id] || {};
            return (
              <div key={block.blocked_id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  {info.avatar_url ? (
                    <img src={info.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center text-stone-500 text-sm font-medium">
                      {(info.display_name || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium text-stone-800">{info.display_name || 'Unknown User'}</div>
                    <div className="text-xs text-stone-400">Blocked ID: {block.blocked_id.slice(0, 8)}…</div>
                  </div>
                </div>
                <button
                  onClick={() => handleUnblock(block.blocked_id)}
                  disabled={removing === block.blocked_id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50 disabled:opacity-50"
                >
                  {removing === block.blocked_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                  Unblock
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}