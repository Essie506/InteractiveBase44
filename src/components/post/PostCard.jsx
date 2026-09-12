import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { getPublicPersonalProfileByIdentity, getPublicProfessionalProfileByIdentity } from '@/services/profileService';
import { callDeletePost } from '@/services/postService';
import ReactionBar from '@/components/community/ReactionBar';
import CommentSection from '@/components/community/CommentSection';
import ShareButton from '@/components/community/ShareButton';
import PostTypeBadge from '@/components/post/PostTypeBadge';
import { MoreHorizontal, Trash2, Clock, MessageCircle, Link2, Tag, Dumbbell, Calendar, Megaphone, Flag, Ban, PenSquare, Building2 } from 'lucide-react';
import { blockUser, reportUser } from '@/lib/messaging';
import { getPublicBusinessProfile } from '@/services/businessService';

const REF_ICONS = { workout: Dumbbell, calendar_event: Calendar, promotion: Megaphone };
const REF_ROUTES = {
  workout: (id) => `/workouts/${id}`,
  calendar_event: (id) => `/e/${id}`,
  promotion: (id) => `/promotions/${id}`,
};

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
  const [businessAuthor, setBusinessAuthor] = useState(null);
  const [showComments, setShowComments] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showReportConfirm, setShowReportConfirm] = useState(false);

  const isBusinessPost = post?.author_type === 'business' && !!post?.business_id;

  useEffect(() => {
    if (isBusinessPost) {
      getPublicBusinessProfile(post.business_id)
        .then(b => setBusinessAuthor(b))
        .catch(() => setBusinessAuthor(null));
    } else if (post?.author_identity_id) {
      const isPersonal = post?.operating_context === 'personal';
      const primary = isPersonal
        ? getPublicPersonalProfileByIdentity(post.author_identity_id)
        : getPublicProfessionalProfileByIdentity(post.author_identity_id);
      const fallback = isPersonal
        ? getPublicProfessionalProfileByIdentity(post.author_identity_id)
        : getPublicPersonalProfileByIdentity(post.author_identity_id);
      primary
        .then(p => {
          if (p) { setAuthor(p); return; }
          fallback.then(fb => setAuthor(fb || {})).catch(() => setAuthor({}));
        })
        .catch(() => setAuthor({}));
    }
  }, [isBusinessPost, post?.author_identity_id, post?.business_id, post?.operating_context]);

  // Author display — business posts show the business, not the individual
  const authorLink = isBusinessPost
    ? `/b/${post.business_id}`
    : (author?.screen_name
        ? (post?.operating_context === 'personal' ? `/u/${author.screen_name}` : `/p/${author.screen_name}`)
        : '#');
  const authorName = isBusinessPost
    ? (businessAuthor?.name || 'Business')
    : (author?.display_name || 'Unknown');
  const authorAvatar = isBusinessPost ? null : author?.avatar_url;

  const isAuthor = isBusinessPost
    ? (user?.id === post?.author_identity_id ||
       (user?.active_context === 'business' && user?.active_business_id === post?.business_id))
    : user?.id === post?.author_identity_id;

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

  const handleBlock = async () => {
    if (!user || !post?.author_identity_id) return;
    try {
      await blockUser(user.id, post.author_identity_id, user.active_context || 'personal', null);
      onDeleted?.(post.id);
    } catch (err) {
      console.error('Failed to block:', err);
    } finally {
      setShowBlockConfirm(false);
      setMenuOpen(false);
    }
  };

  const handleReport = async () => {
    if (!user || !post?.author_identity_id) return;
    try {
      await reportUser(user.id, post.author_identity_id, 'Inappropriate post content', user.active_context || 'personal');
    } catch (err) {
      console.error('Failed to report:', err);
    } finally {
      setShowReportConfirm(false);
      setMenuOpen(false);
    }
  };

  if (!post) return null;

  return (
    <article className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-4">
        <div className="flex items-center gap-3">
          <Link to={authorLink}>
            {isBusinessPost ? (
              businessAuthor?.logo_url ? (
                <img src={businessAuthor.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                </div>
              )
            ) : authorAvatar ? (
              <img src={authorAvatar} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center text-stone-500 text-sm font-medium">
                {(authorName || '?').charAt(0).toUpperCase()}
              </div>
            )}
          </Link>
          <div>
            <Link to={authorLink} className="text-sm font-medium text-stone-800 hover:text-indigo-600">
              {authorName}
            </Link>
            <div className="text-xs text-stone-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo(post._created_date)}
              {post.edited_at && ' · edited'}
            </div>
          </div>
        </div>
        {user && (
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
                  {isAuthor ? (
                    <>
                      <Link
                        to={`/posts/${post.id}/edit`}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
                      >
                        <PenSquare className="w-3.5 h-3.5" />
                        Edit post
                      </Link>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {deleting ? 'Deleting...' : 'Delete post'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setShowReportConfirm(true); setMenuOpen(false); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
                      >
                        <Flag className="w-3.5 h-3.5" />
                        Report post
                      </button>
                      <button
                        onClick={() => { setShowBlockConfirm(true); setMenuOpen(false); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Block author
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Post type badge + title */}
      <div className="px-4 pb-2">
        {post.post_type && post.post_type !== 'standard' && (
          <div className="mb-2"><PostTypeBadge type={post.post_type} /></div>
        )}
        {post.title && (
          <h2 className="text-base font-semibold text-stone-800 mb-1">{post.title}</h2>
        )}
        {post.summary && (
          <p className="text-xs text-stone-500 mb-2">{post.summary}</p>
        )}
      </div>

      {/* Body */}
      <div className="px-4 pb-3">
        <p className="text-sm text-stone-700 whitespace-pre-wrap break-words">{post.body}</p>
      </div>

      {/* Linked content references */}
      {post.linked_content_references && post.linked_content_references.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          {post.linked_content_references.map((ref, i) => {
            const RefIcon = REF_ICONS[ref.system] || Link2;
            const route = REF_ROUTES[ref.system]?.(ref.id);
            const content = (
              <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors">
                <RefIcon className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-sm text-indigo-700 truncate">{ref.type || ref.system} reference</span>
              </div>
            );
            return route ? <Link key={i} to={route}>{content}</Link> : <div key={i}>{content}</div>;
          })}
        </div>
      )}

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {post.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-stone-100 text-stone-500 rounded-full text-xs">
              <Tag className="w-2.5 h-2.5" />{t}
            </span>
          ))}
        </div>
      )}

      {/* Media — images and video via Media System */}
      {post.media_urls && post.media_urls.length > 0 && (
        <div className={`grid gap-1 ${post.media_urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {post.media_urls.map((url, i) => {
            const isVideo = post.media_asset_ids?.length > 0 && url.includes('video');
            return isVideo ? (
              <video key={i} src={url} controls className="w-full max-h-96 object-cover" />
            ) : (
              <img key={i} src={url} alt="" className="w-full max-h-96 object-cover" loading="lazy" />
            );
          })}
        </div>
      )}

      {/* Link preview / link attachment */}
      {post.link_url && post.link_preview?.title ? (
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
      ) : post.link_url ? (
        <a href={post.link_url} target="_blank" rel="noopener noreferrer" className="mx-4 mb-3 flex items-center gap-2 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm text-indigo-600 hover:bg-stone-100 transition-colors">
          <Link2 className="w-4 h-4 shrink-0" />
          <span className="truncate">{post.link_url}</span>
        </a>
      ) : null}

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

      {/* Block confirmation */}
      {showBlockConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowBlockConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Ban className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-lg font-bold text-stone-800">Block {author?.display_name || 'this author'}?</h2>
            </div>
            <p className="text-sm text-stone-500 mb-5">They will not be able to send you messages. This post will be removed from your feed.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowBlockConfirm(false)} className="flex-1 px-4 py-2.5 text-stone-600 hover:bg-stone-100 rounded-lg font-medium transition-colors">Cancel</button>
              <button onClick={handleBlock} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors">Block</button>
            </div>
          </div>
        </div>
      )}

      {/* Report confirmation */}
      {showReportConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowReportConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <Flag className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="text-lg font-bold text-stone-800">Report this post?</h2>
            </div>
            <p className="text-sm text-stone-500 mb-5">This will submit a report to Trust & Safety for review.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowReportConfirm(false)} className="flex-1 px-4 py-2.5 text-stone-600 hover:bg-stone-100 rounded-lg font-medium transition-colors">Cancel</button>
              <button onClick={handleReport} className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors">Report</button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}