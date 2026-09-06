// ShareCard — renders a commentary share in the Feed (§14.4).
// A commentary share is a new post (commentary_body) that accompanies
// a shared reference to existing content. The card shows the sharer's
// commentary, a preview of the original content, and full community
// interaction (reactions, comments, share).
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { callResolveParticipants } from '@/services/firebaseFunctions';
import { callDeleteShare } from '@/services/shareService';
import ReactionBar from '@/components/community/ReactionBar';
import CommentSection from '@/components/community/CommentSection';
import ShareButton from '@/components/community/ShareButton';
import SharedContentPreview from '@/components/community/SharedContentPreview';
import { MoreHorizontal, Trash2, Clock, MessageCircle, Repeat2 } from 'lucide-react';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const date = dateStr.toDate ? dateStr.toDate() : new Date(dateStr);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function ShareCard({ share, onDeleted }) {
  const { user } = useAuth();
  const [sharer, setSharer] = useState(null);
  const [showComments, setShowComments] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!share?.sharer_identity_id) return;
    callResolveParticipants({ identity_ids: [share.sharer_identity_id] })
      .then((res) => setSharer(res.results?.[share.sharer_identity_id] || {}))
      .catch(() => setSharer({}));
  }, [share?.sharer_identity_id]);

  const isSharer = user?.id === share?.sharer_identity_id;

  const handleDelete = async () => {
    if (!window.confirm('Delete this share? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await callDeleteShare(share.id);
      onDeleted?.(share.id);
    } catch (err) {
      console.error('Failed to delete share:', err);
    } finally {
      setDeleting(false);
      setMenuOpen(false);
    }
  };

  if (!share) return null;

  return (
    <article className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-4">
        <div className="flex items-center gap-3">
          <Link to={sharer?.screen_name ? `/p/${sharer.screen_name}` : '#'}>
            {sharer?.avatar_url ? (
              <img src={sharer.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center text-stone-500 text-sm font-medium">
                {(sharer?.display_name || '?').charAt(0).toUpperCase()}
              </div>
            )}
          </Link>
          <div>
            <Link to={sharer?.screen_name ? `/p/${sharer.screen_name}` : '#'} className="text-sm font-medium text-stone-800 hover:text-indigo-600">
              {sharer?.display_name || 'Unknown'}
            </Link>
            <div className="text-xs text-stone-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo(share._created_date)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-indigo-500 font-medium">
            <Repeat2 className="w-3.5 h-3.5" /> Shared
          </span>
          {isSharer && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
                aria-label="Share options"
              >
                <MoreHorizontal className="w-4 h-4 text-stone-500" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-stone-200 rounded-lg shadow-lg py-1 min-w-[160px]">
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {deleting ? 'Deleting...' : 'Delete share'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Commentary body */}
      {share.commentary_body && (
        <div className="px-4 pb-3">
          <p className="text-sm text-stone-700 whitespace-pre-wrap break-words">{share.commentary_body}</p>
        </div>
      )}

      {/* Shared content preview */}
      <div className="px-4 pb-3">
        <SharedContentPreview
          targetSystem={share.target_system}
          targetType={share.target_type}
          targetId={share.target_id}
        />
      </div>

      {/* Interaction bar */}
      <div className="px-4 py-3 border-t border-stone-100">
        <ReactionBar targetSystem="share" targetType="share" targetId={share.id} />
        <div className="flex items-center gap-4 mt-2">
          <button
            onClick={() => setShowComments(!showComments)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-700"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {showComments ? 'Hide comments' : 'Comments'}
          </button>
          <ShareButton targetSystem="share" targetType="share" targetId={share.id} />
        </div>
      </div>

      {/* Comments (expanded) */}
      {showComments && (
        <div className="px-4 pb-4 border-t border-stone-100 pt-3">
          <CommentSection targetSystem="share" targetType="share" targetId={share.id} />
        </div>
      )}
    </article>
  );
}