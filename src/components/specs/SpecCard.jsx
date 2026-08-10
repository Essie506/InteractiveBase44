import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import StatusBadge from './StatusBadge';

export default function SpecCard({ spec, projectName, projectColor }) {
  return (
    <Link
      to={`/specifications/${spec.id}`}
      className="group block bg-white rounded-xl border border-stone-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-stone-100 group-hover:bg-indigo-50 flex items-center justify-center shrink-0 transition-colors">
            <FileText className="w-4.5 h-4.5 text-stone-500 group-hover:text-indigo-600 transition-colors" />
          </div>
          <div className="min-w-0">
            {spec.spec_number && (
              <div className="text-xs text-stone-400 font-mono mb-0.5">
                Spec {spec.spec_number}
              </div>
            )}
          </div>
        </div>
        <StatusBadge status={spec.status} />
      </div>
      <h3 className="font-semibold text-stone-800 group-hover:text-indigo-600 transition-colors leading-snug mb-2 line-clamp-2">
        {spec.title}
      </h3>
      <div className="flex items-center gap-3 text-xs text-stone-500">
        {projectName && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: projectColor || '#4F46E5' }} />
            {projectName}
          </span>
        )}
        <span>v{spec.version}</span>
        {spec.system_type && <span className="truncate">· {spec.system_type}</span>}
      </div>
    </Link>
  );
}