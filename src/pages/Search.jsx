import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Search, Loader2, Sparkles, FileText, ArrowRight } from 'lucide-react';

const EXAMPLES = [
  'How does the booking system handle payments?',
  'What are the trust and reputation verification levels?',
  'How does the notification system manage quiet hours?',
  'What data architecture does the platform use?',
];

export default function SearchPage() {
  const [projects, setProjects] = useState([]);
  const [query, setQuery] = useState('');
  const [projectId, setProjectId] = useState('all');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    base44.entities.Project.list().then(setProjects);
  }, []);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setSearched(true);

    try {
      const response = await base44.functions.invoke('SearchSpecs', {
        query: query.trim(),
        project_id: projectId !== 'all' ? projectId : undefined,
      });
      if (response.data?.error) {
        setError(response.data.error);
      } else {
        setResult(response.data);
      }
    } catch (err) {
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const setExample = (ex) => {
    setQuery(ex);
    setResult(null);
    setSearched(false);
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          <h1 className="text-3xl font-bold tracking-tight text-stone-800">AI Search</h1>
        </div>
        <p className="text-stone-500">Ask questions across all your specification documents</p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-stone-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ask a question about your specifications..."
              className="w-full pl-11 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="px-3 py-3 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400"
          >
            <option value="all">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {/* Example questions */}
      {!searched && !loading && (
        <div className="mb-6">
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-3">Try asking</p>
          <div className="space-y-2">
            {EXAMPLES.map(ex => (
              <button
                key={ex}
                onClick={() => setExample(ex)}
                className="w-full text-left flex items-center gap-3 p-3.5 bg-white border border-stone-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors group"
              >
                <ArrowRight className="w-4 h-4 text-stone-300 group-hover:text-indigo-500 transition-colors" />
                <span className="text-sm text-stone-600">{ex}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-xl border border-stone-200 p-10 flex flex-col items-center">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
          <p className="text-sm text-stone-500">Searching through specifications...</p>
          <p className="text-xs text-stone-400 mt-1">This may take a moment for large document sets</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <div className="bg-white rounded-xl border border-stone-200 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-4 pb-4 border-b border-stone-100">
            <Sparkles className="w-4.5 h-4.5 text-indigo-600" />
            <h2 className="font-semibold text-stone-700">Answer</h2>
          </div>
          <div className="prose-content text-sm text-stone-600 leading-relaxed whitespace-pre-wrap">
            {result.answer}
          </div>
          {result.sources && result.sources.length > 0 && (
            <div className="mt-6 pt-4 border-t border-stone-100">
              <p className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-2.5">Sources</p>
              <div className="flex flex-wrap gap-2">
                {result.sources.map((src, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 text-stone-600 rounded-lg text-xs font-medium"
                  >
                    <FileText className="w-3 h-3" />
                    {src.title || src.spec_number || `Source ${i + 1}`}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}