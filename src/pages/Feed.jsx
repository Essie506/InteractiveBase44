import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { fetchPublicPosts } from '@/services/postService';
import { fetchPublicCommentaryShares } from '@/services/shareService';
import PostCard from '@/components/post/PostCard';
import ShareCard from '@/components/community/ShareCard';
import { Plus, Loader2, PenSquare, LogIn } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function Feed() {
  const { user } = useAuth();
  const location = useLocation();
  const returnTo = encodeURIComponent(location.pathname + location.search);
  const [feedItems, setFeedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch public posts AND public commentary shares (§14.4), then merge
  // by date descending. Commentary shares are new posts that accompany a
  // shared reference — they belong in the Feed alongside original posts.
  // Simple shares are internal records and are NOT fetched here.
  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [postList, shareList] = await Promise.all([
        fetchPublicPosts(30).catch((err) => {
          console.error('[Feed] Failed to load posts:', err);
          return [];
        }),
        fetchPublicCommentaryShares(30).catch((err) => {
          console.error('[Feed] Failed to load shares:', err);
          return [];
        }),
      ]);

      const merged = [
        ...postList.map((p) => ({ ...p, _feedType: 'post' })),
        ...shareList.map((s) => ({ ...s, _feedType: 'share' })),
      ].sort((a, b) => {
        const aDate = a._created_date?.toDate ? a._created_date.toDate().getTime() : new Date(a._created_date || 0).getTime();
        const bDate = b._created_date?.toDate ? b._created_date.toDate().getTime() : new Date(b._created_date || 0).getTime();
        return bDate - aDate;
      });

      setFeedItems(merged);
    } catch (err) {
      console.error('[Feed] Failed to load feed:', err);
      setError(err?.message || 'Failed to load feed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFeed(); }, [loadFeed]);

  const handleDeleted = (id) => {
    setFeedItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Feed</h1>
          <p className="text-stone-500 text-sm">Public posts and shares from the Interactive community</p>
        </div>
        {user ? (
          <Link
            to="/posts/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors whitespace-nowrap"
          >
            <PenSquare className="w-4 h-4" /> New Post
          </Link>
        ) : (
          <Link
            to={`/login?returnTo=${returnTo}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors whitespace-nowrap"
          >
            <LogIn className="w-4 h-4" /> Sign in to post
          </Link>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-stone-300 animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700 mb-4">
          {error}. <button onClick={loadFeed} className="underline font-medium">Try again</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && feedItems.length === 0 && (
        <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
          <Plus className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-stone-700 mb-1">Nothing here yet</h3>
          <p className="text-sm text-stone-500 mb-4">Be the first to share something with the community.</p>
          {user ? (
            <Link
              to="/posts/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              <PenSquare className="w-4 h-4" /> Create a post
            </Link>
          ) : (
            <Link
              to={`/login?returnTo=${returnTo}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              <LogIn className="w-4 h-4" /> Sign in to post
            </Link>
          )}
        </div>
      )}

      {/* Feed — merged posts + commentary shares */}
      {!loading && !error && feedItems.length > 0 && (
        <div className="space-y-4">
          {feedItems.map((item) =>
            item._feedType === 'share' ? (
              <ShareCard key={`share-${item.id}`} share={item} onDeleted={handleDeleted} />
            ) : (
              <PostCard key={`post-${item.id}`} post={item} onDeleted={handleDeleted} />
            )
          )}
        </div>
      )}
    </div>
  );
}