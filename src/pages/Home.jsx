import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { listSpecifications, listProjects } from '@/services/specService';
import { FileText, CheckCircle, Eye, FileEdit, Upload, ArrowRight, FolderOpen } from 'lucide-react';
import StatusBadge from '@/components/specs/StatusBadge';

export default function Home() {
  const [specs, setSpecs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listSpecifications('-updated_date', 50),
      listProjects(),
    ])
      .then(([specData, projData]) => {
        setSpecs(specData);
        setProjects(projData);
      })
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    { label: 'Total Specs', value: specs.length, icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Approved', value: specs.filter(s => s.status === 'Approved').length, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'In Review', value: specs.filter(s => s.status === 'In Review').length, icon: Eye, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Drafts', value: specs.filter(s => s.status === 'Draft').length, icon: FileEdit, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  const projectMap = {};
  projects.forEach(p => { projectMap[p.id] = p; });

  const recentSpecs = [...specs].sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date)).slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1">Dashboard</h1>
        <p className="text-stone-500">Your central specification repository</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {stats.map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-xl border border-stone-200 p-5">
              <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div className="text-2xl font-bold text-stone-800">{stat.value}</div>
              <div className="text-sm text-stone-500">{stat.label}</div>
            </div>
          );
        })}
      </div>

      {/* Projects */}
      {projects.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-stone-800">Projects</h2>
            <Link to="/specifications" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => {
              const projectSpecs = specs.filter(s => s.project_id === project.id);
              return (
                <Link
                  key={project.id}
                  to={`/specifications?project=${project.id}`}
                  className="group bg-white rounded-xl border border-stone-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: project.color + '20' }}>
                      <FolderOpen className="w-5 h-5" style={{ color: project.color }} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-stone-800 group-hover:text-indigo-600 transition-colors truncate">{project.name}</h3>
                    </div>
                  </div>
                  <p className="text-sm text-stone-500 line-clamp-2 mb-3">{project.description || 'No description'}</p>
                  <div className="text-xs text-stone-400">{projectSpecs.length} specification{projectSpecs.length !== 1 ? 's' : ''}</div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Specs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-stone-800">Recent Specifications</h2>
          <Link to="/upload" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
            <Upload className="w-3.5 h-3.5" /> Upload new
          </Link>
        </div>
        {recentSpecs.length === 0 ? (
          <div className="bg-white rounded-xl border border-stone-200 p-10 text-center">
            <FileText className="w-10 h-10 text-stone-300 mx-auto mb-3" />
            <p className="text-stone-500 mb-4">No specifications yet</p>
            <Link to="/upload" className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
              <Upload className="w-4 h-4" /> Upload your first spec
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100">
            {recentSpecs.map(spec => {
              const project = projectMap[spec.project_id];
              return (
                <Link
                  key={spec.id}
                  to={`/specifications/${spec.id}`}
                  className="flex items-center gap-4 p-4 hover:bg-stone-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-stone-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-stone-800 truncate">{spec.title}</div>
                    <div className="text-xs text-stone-400 mt-0.5 flex items-center gap-2">
                      {spec.spec_number && <span className="font-mono">Spec {spec.spec_number}</span>}
                      {project && <span>· {project.name}</span>}
                      <span>· v{spec.version}</span>
                    </div>
                  </div>
                  <StatusBadge status={spec.status} />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}