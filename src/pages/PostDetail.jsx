// PostDetail — in-app view for blog_share posts that carry body/rich_text
// content but no external link_url.
//
// ARCHITECTURE BOUNDARY:
//   Article/Blog System   = owns the long-form article (no approved owner
//                            spec exists yet — NOT invented here)
//   Post/Blog Share       = owns the Feed/discovery representation
//
// This route renders the blog_share POST's content — the discovery/share
// object — NOT an authoritative Article. When a blog_share post has an
// external link_url, the Articles page routes to the external source
// (the authoritative article). This page is the fallback for blog_share
// posts that embed their content directly in the Post record.
//
// No Article CMS or ownership model is fabricated. If a dedicated Article
// owner specification is later approved, "Read article" should route to
// that authoritative owner instead.
import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { fetchPostById } from '@/services/postService';
import { ArrowLeft, Clock, ExternalLink, Image as ImageIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchPostById(id)
      .then(p => setPost(p))
      .catch(() => setPost(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center">
        <p className="text-stone-500 mb-4">Post not found.</p>
        <Link to="/feed" className="text-indigo-600 font-medium">Back to Feed</Link>
      </div>
    );
  }

  const dateStr = post._created_date?.toDate
    ? post._created_date.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date(post._created_date || 0).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto pb-20 md:pb-6">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <article className="bg-white rounded-xl border border-stone-200 p-6">
        {post.title && <h1 className="text-2xl font-bold text-stone-800 mb-2">{post.title}</h1>}
        {post.summary && <p className="text-stone-500 mb-4">{post.summary}</p>}
        <div className="flex items-center gap-2 text-xs text-stone-400 mb-4">
          <Clock className="w-3 h-3" />
          <span>{dateStr}</span>
        </div>

        {post.media_urls?.length > 0 && (
          <div className="space-y-2 mb-4">
            {post.media_urls.map((url, i) => (
              <img key={i} src={url} alt="" className="w-full rounded-lg" />
            ))}
          </div>
        )}

        {post.rich_text ? (
          <div className="prose prose-stone max-w-none">
            <ReactMarkdown>{post.rich_text}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-stone-700 whitespace-pre-wrap">{post.body}</p>
        )}

        {post.link_url && (
          <a
            href={post.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-indigo-600 font-medium hover:text-indigo-700"
          >
            <ExternalLink className="w-4 h-4" /> {post.link_url}
          </a>
        )}

        {post.tags?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {post.tags.map(tag => (
              <span key={tag} className="px-2 py-1 bg-stone-100 text-stone-600 rounded-full text-xs">#{tag}</span>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}