import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { fetchPublicPosts } from '@/services/postService';
import { blockRepository } from '@/data/firebase';
import { fetchPublicCommentaryShares } from '@/services/shareService';
import { listPublishedWorkouts } from '@/services/workoutService';
import { loadDirectory } from '@/services/discoveryService';
import PostCard from '@/components/post/PostCard';
import ShareCard from '@/components/community/ShareCard';
import FeedDiscoverySection from '@/components/feed/FeedDiscoverySection';
import FeedLocationControl from '@/components/feed/FeedLocationControl';
import { Plus, Loader2, PenSquare, LogIn, RefreshCw } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import NavTrigger from '@/components/nav/NavTrigger';

export default function Feed() {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const returnTo = encodeURIComponent(location.pathname + location.search);
  const [feedItems, setFeedItems] = useState([]);
  const [visibleCount, setVisibleCount] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [discoveryItems, setDiscoveryItems] = useState({ workouts: [], events: [] });
  const [discoveryLocation, setDiscoveryLocation] = useState(null);

  // Fetch public posts AND public commentary shares (§14.4), then merge
  // by date descending. Commentary shares are new posts that accompany a
  // shared reference — they belong in the Feed alongside original posts.
  // Simple shares are internal records and are NOT fetched here.
  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch blocked identity IDs for the current user (authoritative filter)
      let blockedIds = new Set();
      if (user?.id) {
        try {
          const blocks = await blockRepository.listBlocksForBlocker(user.id);
          blockedIds = new Set(blocks.map(b => b.blocked_id).filter(Boolean));
        } catch (e) {
          console.error('[Feed] Failed to load blocks:', e);
        }
      }

      const isAuthed = isAuthenticated === true;
      const dirResult = await loadDirectory().catch(() => ({ events: [] }));
      const eventList = (dirResult.events || []).filter(e =>
        e.visibility === 'public' && e.lifecycle_state !== 'cancelled' && e.lifecycle_state !== 'removed'
      ).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()).slice(0, 6);

      let postsError = null;
      const [postList, shareList, workoutList] = await Promise.all([
        fetchPublicPosts(30, { isAuthenticated: isAuthed }).catch((err) => {
          console.error('[Feed] Failed to load posts:', err);
          postsError = err;
          return [];
        }),
        fetchPublicCommentaryShares(30, { isAuthenticated: isAuthed }).catch((err) => {
          console.error('[Feed] Failed to load shares:', err);
          return [];
        }),
        listPublishedWorkouts(6).catch(() => []),
      ]);

      const merged = [
        ...postList.map((p) => ({ ...p, _feedType: 'post' })),
        ...shareList.map((s) => ({ ...s, _feedType: 'share' })),
      ].filter((item) => {
        const authorId = item.author_identity_id || item.sharer_identity_id;
        return !blockedIds.has(authorId);
      }).sort((a, b) => {
        const aDate = a._created_date?.toDate ? a._created_date.toDate().getTime() : new Date(a._created_date || 0).getTime();
        const bDate = b._created_date?.toDate ? b._created_date.toDate().getTime() : new Date(b._created_date || 0).getTime();
        return bDate - aDate;
      });

      setFeedItems(merged);
      setDiscoveryItems({ workouts: workoutList, events: eventList });
      if (postsError && merged.length === 0) {
        setError(postsError?.message || 'Failed to load posts. Check your connection and try again.');
      }
    } catch (err) {
      console.error('[Feed] Failed to load feed:', err);
      setError(err?.message || 'Failed to load feed');
    } finally {
      setLoading(false);
    }
  }, [user?.id, isAuthenticated]);

  // Re-fetch when navigating to the Feed (e.g. after publishing a post).
  // Without location.pathname in deps, navigating from PostEditor → /feed
  // would NOT re-trigger loadFeed because user?.id doesn't change.
  useEffect(() => { loadFeed(); }, [loadFeed, location.pathname]);

  const handleDeleted = (id) => {
    setFeedItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto pb-20 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {!user && <NavTrigger />}
          <div>
            <h1 className="text-xl font-bold text-stone-800">Feed</h1>
            <p className="text-stone-500 text-sm">Public posts and shares from the Interactive community</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadFeed}
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
            title="Refresh feed"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 text-stone-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
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
      </div>

      {/* Location control — public discovery signal (Issue 8) */}
      <div className="mb-4">
        <FeedLocationControl onLocationChange={setDiscoveryLocation} />
      </div>

      {/* Discovery content — connected types (Issue 5) */}
      {!loading && !error && (discoveryItems.workouts.length > 0 || discoveryItems.events.length > 0) && (
        <div className="mb-6">
          <FeedDiscoverySection
            workouts={discoveryItems.workouts}
            events={discoveryItems.events}
            location={discoveryLocation}
          />
        </div>
      )}

      {/* Loading — skeleton cards */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-stone-200 p-4 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-stone-200" />
                <div className="flex-1">
                  <div className="h-3 w-24 bg-stone-200 rounded mb-1.5" />
                  <div className="h-2 w-16 bg-stone-200 rounded" />
                </div>
              </div>
              <div className="h-3 w-full bg-stone-200 rounded mb-2" />
              <div className="h-3 w-3/4 bg-stone-200 rounded" />
            </div>
          ))}
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
          {feedItems.slice(0, visibleCount).map((item) =>
            item._feedType === 'share' ? (
              <ShareCard key={`share-${item.id}`} share={item} onDeleted={handleDeleted} />
            ) : (
              <PostCard key={`post-${item.id}`} post={item} onDeleted={handleDeleted} />
            )
          )}
          {visibleCount < feedItems.length && (
            <div className="flex justify-center pt-4">
              <button
                onClick={() => setVisibleCount((c) => c + 10)}
                className="px-5 py-2.5 text-sm font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}