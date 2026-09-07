// Articles — public Article/Blog discovery surface (Issue 6/7).
// Displays blog_share posts from the Post System as article previews.
// Preserves the Blog Share architecture: the Post System owns the post,
// this page provides discovery/sharing. "Read article" navigates to the
// authoritative long-form content (external link or in-app post detail).
//
// No dedicated Article/Blog CMS is invented here — the dedicated Article
// product specification is incomplete. This page uses the existing
// blog_share post type boundary.
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '@/firebase/firebaseClient';
import { FileText, ArrowRight, Clock, ExternalLink } from 'lucide-react';

function sortByCreatedDesc(items) {
  return items.sort((a, b) => {
    const aT = a._created_date?.toDate ? a._created_date.toDate().getTime() : new Date(a._created_date || 0).getTime();
    const bT = b._created_date?.toDate ? b._created_date.toDate().getTime() : new Date(b._created_date || 0).getTime();
    return bT - aT;
  });
}

export default function Articles() {
  const { isAuthenticated } = useAuth();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const isAuthed = isAuthenticated === true;
      let q;
      if (isAuthed) {
        // Authenticated — single-field query, filter client-side.
        q = query(collection(db, 'posts'), where('post_type', '==', 'blog_share'), limit(30));
      } else {
        // Unauthenticated — rules require visibility + lifecycle in query.
        q = query(
          collection(db, 'posts'),
          where('post_type', '==', 'blog_share'),
          where('visibility', '==', 'public'),
          where('lifecycle_state', '==', 'published'),
          limit(30),
        );
      }
      const snap = await getDocs(q);
      let all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (isAuthed) {
        all = all.filter(p => p.visibility === 'public' && p.lifecycle_state === 'published');
      }
      setArticles(sortByCreatedDesc(all));
    } catch {
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto pb-20 md:pb-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-stone-800 flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-600" /> Articles
        </h1>
        <p className="text-stone-500 text-sm">Blog shares and long-form content from the community</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : articles.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
          <FileText className="w-10 h-10 text-stone-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-stone-700 mb-1">No articles yet</h3>
          <p className="text-sm text-stone-500">Blog shares will appear here when community members share articles.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {articles.map(article => {
            const hasExternalLink = !!article.link_url;
            const ArticleLink = ({ children }) => hasExternalLink ? (
              <a href={article.link_url} target="_blank" rel="noopener noreferrer" className="block">{children}</a>
            ) : (
              <Link to={`/posts/${article.id}`}>{children}</Link>
            );
            return (
              <div key={article.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden hover:shadow-sm transition-shadow">
                <ArticleLink>
                  {article.media_urls?.[0] && (
                    <img src={article.media_urls[0]} alt="" className="w-full h-40 object-cover" />
                  )}
                  <div className="p-4">
                    {article.title && (
                      <h2 className="text-base font-semibold text-stone-800 mb-1">{article.title}</h2>
                    )}
                    {article.summary && (
                      <p className="text-sm text-stone-500 line-clamp-2 mb-2">{article.summary}</p>
                    )}
                    <div className="flex items-center justify-between text-xs text-stone-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {article._created_date?.toDate
                          ? article._created_date.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                          : new Date(article._created_date || 0).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <span className="flex items-center gap-1 text-indigo-600 font-medium">
                        {hasExternalLink ? <><ExternalLink className="w-3 h-3" /> Read article</> : <><ArrowRight className="w-3 h-3" /> Read more</>}
                      </span>
                    </div>
                  </div>
                </ArticleLink>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}