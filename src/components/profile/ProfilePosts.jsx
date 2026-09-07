// ProfilePosts — shows a user's published posts on their profile.
// ───────────────────────────────────────────────────────────
// Uses the same authoritative Post data as the Feed (fetchPostsByAuthor).
// No duplicate copies — references the same posts collection.
import { useState, useEffect } from 'react';
import { fetchPostsByAuthor } from '@/services/postService';
import PostCard from '@/components/post/PostCard';
import { Loader2 } from 'lucide-react';

export default function ProfilePosts({ identityId, canView = true }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!identityId || !canView) { setLoading(false); return; }
    fetchPostsByAuthor(identityId, 10)
      .then(setPosts)
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [identityId, canView]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 mt-6">
        <h2 className="text-lg font-semibold text-stone-800 mb-3">Posts</h2>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-stone-300 animate-spin" />
        </div>
      </div>
    );
  }

  if (posts.length === 0) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 mt-8">
      <h2 className="text-lg font-semibold text-stone-800 mb-3">Posts</h2>
      <div className="space-y-4">
        {posts.map(post => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}