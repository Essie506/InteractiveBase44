import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { fetchPublicPosts } from '@/services/postService';
import PostCard from '@/components/post/PostCard';
import { Plus, Loader2, PenSquare } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Feed() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchPublicPosts(30);
      setPosts(list);
    } catch (err) {
      console.error('[Feed] Failed to load posts:', err);
      setError(err?.message || 'Failed to load feed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const handleDeleted = (id) => {
    setPosts(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Feed</h1>
          <p className="text-stone-500 text-sm">Public posts from the Interactive community</p>
        </div>
        <Link
          to="/posts/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors whitespace-nowrap"
        >
          <PenSquare className="w-4 h-4" /> New Post
        </Link>
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
          {error}. <button onClick={loadPosts} className="underline font-medium">Try again</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && posts.length === 0 && (
        <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
          <Plus className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-stone-700 mb-1">No posts yet</h3>
          <p className="text-sm text-stone-500 mb-4">Be the first to share something with the community.</p>
          <Link
            to="/posts/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            <PenSquare className="w-4 h-4" /> Create a post
          </Link>
        </div>
      )}

      {/* Posts */}
      {!loading && !error && posts.length > 0 && (
        <div className="space-y-4">
          {posts.map(post => (
            <PostCard key={post.id} post={post} onDeleted={handleDeleted} />
          ))}
        </div>
      )}
    </div>
  );
}