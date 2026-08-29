const ACCENT_CLASSES = {
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  stone: 'bg-stone-100 text-stone-600',
};

export default function StatCard({ icon: Icon, label, value, accent = 'indigo' }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ACCENT_CLASSES[accent] || ACCENT_CLASSES.indigo}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs text-stone-500 font-medium">{label}</span>
      </div>
      <div className="text-lg font-semibold text-stone-800">{value}</div>
    </div>
  );
}