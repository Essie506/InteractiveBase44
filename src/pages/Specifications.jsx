import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Search, SlidersHorizontal, FileText } from 'lucide-react';
import SpecCard from '@/components/specs/SpecCard';

export default function Specifications() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [specs, setSpecs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const projectFilter = searchParams.get('project') || 'all';

  useEffect(() => {
    Promise.all([
      base44.entities.Specification.list('-updated_date', 100),
      base44.entities.Project.list(),
    ])
      .then(([specData, projData]) => {
        setSpecs(specData);
        setProjects(projData);
      })
      .finally(() => setLoading(false));
  }, []);

  const projectMap = {};
  projects.forEach(p => { projectMap[p.id] = p; });

  let filtered = specs;
  if (projectFilter !== 'all') {
    filtered = filtered.filter(s => s.project_id === projectFilter);
  }
  if (statusFilter !== 'all') {
    filtered = filtered.filter(s => s.status === statusFilter);
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(s =>
      s.title?.toLowerCase().includes(q) ||
      s.spec_number?.toLowerCase().includes(q) ||
      s.system_type?.toLowerCase().includes(q) ||
      s.summary?.toLowerCase().includes(q)
    );
  }

  const setProject = (val) => {
    if (val === 'all') {
      searchParams.delete('project');
    } else {
      searchParams.set('project', val);
    }
    setSearchParams(searchParams);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1">Specifications</h1>
        <p className="text-stone-500">{filtered.length} document{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="Search specifications..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
          />
        </div>
        <select
          value={projectFilter}
          onChange={e => setProject(e.target.value)}
          className="px-3 py-2.5 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
        >
          <option value="all">All Projects</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
        >
          <option value="all">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="In Review">In Review</option>
          <option value="Approved">Approved</option>
          <option value="Archived">Archived</option>
        </select>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-16 text-center">
          <FileText className="w-12 h-12 text-stone-300 mx-auto mb-4" />
          <p className="text-stone-500">No specifications match your filters</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(spec => (
            <SpecCard
              key={spec.id}
              spec={spec}
              projectName={projectMap[spec.project_id]?.name}
              projectColor={projectMap[spec.project_id]?.color}
            />
          ))}
        </div>
      )}
    </div>
  );
}