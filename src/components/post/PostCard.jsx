import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { callResolveParticipants } from '@/services/firebaseFunctions';
import { callDeletePost } from '@/services/postService';
import ReactionBar from '@/components/community/ReactionBar';
import CommentSection from '@/components/community/CommentSection';
import ShareButton from '@/components/community/ShareButton';
import { MoreHorizontal, Trash2, Clock, MessageCircle } from 'lucide-react';

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

export default function PostCard({ post, onDeleted }) {
  const { user } = useAuth();
  const [author, setAuthor] = useState(null);
  const [showComments, setShowComments] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!post?.author_identity_id) return;
    callResolveParticipants({ identity_ids: [post.author_identity_id] })
      .then(res => setAuthor(res.results?.[post.author_identity_id] || {}))
      .catch(() => setAuthor({}));
  }, [post?.author_identity_id]);

  const isAuthor = user?.id === post?.author_identity_id;

  const handleDelete = async () => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await callDeletePost({ id: post.id });
      onDeleted?.(post.id);
    } catch (err) {
      console.error('Failed to delete post:', err);
    } finally {
      setDeleting(false);
      setMenuOpen(false);
    }
  };

  if (!post) return null;

  return (
    <article className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-4">
        <div className="flex items-center gap-3">
          <Link to={author?.screen_name ? `/p/${author.screen_name}` : '#'}>
            {author?.avatar_url ? (
              <img src={author.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center text-stone-500 text-sm font-medium">
                {(author?.display_name || '?').charAt(0).toUpperCase()}
              </div>
            )}
          </Link>
          <div>
            <Link to={author?.screen_name ? `/p/${author.screen_name}` : '#'} className="text-sm font-medium text-stone-800 hover:text-indigo-600">
              {author?.display_name || 'Unknown'}
            </Link>
            <div className="text-xs text-stone-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo(post.created_date)}
              {post.edited_at && ' · edited'}
            </div>
          </div>
        </div>
        {isAuthor && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
              aria-label="Post options"
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
                    {deleting ? 'Deleting...' : 'Delete post'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-4 pb-3">
        <p className="text-sm text-stone-700 whitespace-pre-wrap break-words">{post.body}</p>
      </div>

      {/* Media */}
      {post.media_urls && post.media_urls.length > 0 && (
        <div className={`grid gap-1 ${post.media_urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {post.media_urls.map((url, i) => (
            <img key={i} src={url} alt="" className="w-full max-h-96 object-cover" loading="lazy" />
          ))}
        </div>
      )}

      {/* Link preview */}
      {post.link_preview?.title && (
        <a href={post.link_url} target="_blank" rel="noopener noreferrer" className="mx-4 mb-3 block border border-stone-200 rounded-lg overflow-hidden hover:border-stone-300 transition-colors">
          {post.link_preview.image_url && (
            <img src={post.link_preview.image_url} alt="" className="w-full max-h-48 object-cover" />
          )}
          <div className="p-3">
            <div className="text-sm font-medium text-stone-800">{post.link_preview.title}</div>
            {post.link_preview.description && (
              <div className="text-xs text-stone-500 mt-0.5 line-clamp-2">{post.link_preview.description}</div>
            )}
          </div>
        </a>
      )}

      {/* Interaction bar */}
      <div className="px-4 py-3 border-t border-stone-100">
        <ReactionBar targetSystem="post" targetType="post" targetId={post.id} />
        <div className="flex items-center gap-4 mt-2">
          <button
            onClick={() => setShowComments(!showComments)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-700"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {showComments ? 'Hide comments' : 'Comments'}
          </button>
          <ShareButton targetSystem="post" targetType="post" targetId={post.id} />
        </div>
      </div>

      {/* Comments (expanded) */}
      {showComments && (
        <div className="px-4 pb-4 border-t border-stone-100 pt-3">
          <CommentSection targetSystem="post" targetType="post" targetId={post.id} />
        </div>
      )}
    </article>
  );
}