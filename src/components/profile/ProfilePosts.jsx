// ProfilePosts — shows a user's published posts on their profile.
// ───────────────────────────────────────────────────────────
// Uses the same authoritative Post data as the Feed (fetchPostsByAuthor).
// No duplicate copies — references the same posts collection.
import { useState, useEffect } from 'react';
import { fetchPostsByAuthor, fetchPostsByBusiness } from '@/services/postService';
import PostCard from '@/components/post/PostCard';
import { Loader2 } from 'lucide-react';

/**
 * Shows a profile's published posts.
 * - identityId + operatingContext: personal or professional wall
 *   (filters by operating_context so the two don't mix)
 * - businessId: business wall (publishing_account_id == businessId)
 *
 * @param {{ identityId?: string, businessId?: string, operatingContext?: string, canView?: boolean }} props
 */
export default function ProfilePosts({ identityId, businessId, operatingContext, canView = true }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canView) { setLoading(false); return; }
    if (businessId) {
      fetchPostsByBusiness(businessId, 10)
        .then(setPosts)
        .catch(() => setPosts([]))
        .finally(() => setLoading(false));
    } else if (identityId) {
      // TEMP DIAG: trace Professional wall query
      console.log('[ProfilePosts DIAG] fetching:', { identityId, operatingContext, canView });
      fetchPostsByAuthor(identityId, 10, { operatingContext })
        .then(posts => {
          console.log('[ProfilePosts DIAG] result:', { identityId, operatingContext, count: posts.length, operating_contexts: posts.map(p => p.operating_context) });
          setPosts(posts);
        })
        .catch((err) => {
          console.error('[ProfilePosts DIAG] error:', { identityId, operatingContext, error: err?.message || err, code: err?.code });
          setPosts([]);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [identityId, businessId, operatingContext, canView]);

  if (loading) {
    return (
      <div className="max-w-[89%] mx-auto px-4 sm:px-6 mt-6">
        <h2 className="text-lg font-semibold text-stone-800 mb-3">Posts</h2>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-stone-300 animate-spin" />
        </div>
      </div>
    );
  }

  if (posts.length === 0) return null;

  return (
    <div className="max-w-[89%] mx-auto px-4 sm:px-6 mt-8">
      <h2 className="text-lg font-semibold text-stone-800 mb-3">Posts</h2>
      <div className="space-y-4">
        {posts.map(post => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}