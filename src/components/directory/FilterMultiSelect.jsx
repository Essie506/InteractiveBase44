import { useState } from 'react';
import { Check, X, Search } from 'lucide-react';

// Multi-select filter control: removable selected chips + a
// scrollable checklist. Uses canonical taxonomy {id, label} items
// so selected values match profile service/facility ids exactly.
//
// Each instance has its own section-level search input that filters
// only this section's options. The search is case-insensitive,
// supports partial matching, and does not affect selections or
// any other section's search.
export default function FilterMultiSelect({ options, selected, onChange, searchPlaceholder = 'Search...' }) {
  const [search, setSearch] = useState('');
  const q = search.toLowerCase().trim();
  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;

  const toggle = (id) => {
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {selected.map(id => {
            const opt = options.find(o => o.id === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full"
              >
                {opt?.label || id}
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); toggle(id); }}
                  className="hover:text-indigo-900 transition-colors"
                  aria-label={`Remove ${opt?.label || id}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Section search — filters only this section's options */}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-8 pr-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-md text-xs focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <div className="max-h-52 overflow-y-auto space-y-0.5 -mx-1 px-1">
        {filtered.length === 0 && q && (
          <p className="text-xs text-stone-400 text-center py-2">No matches</p>
        )}
        {filtered.map(opt => {
          const isSelected = selected.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm text-left transition-colors ${
                isSelected ? 'text-indigo-700 bg-indigo-50/50' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-stone-300 bg-white'
              }`}>
                {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
              </span>
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}