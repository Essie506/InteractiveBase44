const statusConfig = {
  Draft: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Draft' },
  'In Review': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', label: 'In Review' },
  Approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Approved' },
  Archived: { bg: 'bg-stone-100', text: 'text-stone-500', dot: 'bg-stone-400', label: 'Archived' },
};

export default function StatusBadge({ status, size = 'sm' }) {
  const config = statusConfig[status] || statusConfig.Draft;
  const sizeClasses = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${config.bg} ${config.text} ${sizeClasses}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}