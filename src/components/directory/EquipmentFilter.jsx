import { useState, useMemo } from 'react';
import { ChevronRight, Check, X } from 'lucide-react';
import { STANDARD_EQUIPMENT } from '@/data/standardEquipment';

// Equipment filter with nested collapsible subcategories.
// Uses the same tick/check multi-select visual language as
// FilterMultiSelect. Subcategories (Strength, Functional, Cardio,
// Combat, Recovery) collapse independently — collapsing a
// subcategory does NOT clear its selections (state lives in parent).
//
// When `search` is active:
//   - items within each category are filtered to matching labels
//   - categories with zero matches are hidden
//   - all visible categories auto-expand (user cannot collapse
//     while search is active)
//
// Items within each category are sorted alphabetically by label.
//
// Matching semantics: OR (match ANY selected equipment id), identical
// to Services and Facilities filters.
export default function EquipmentFilter({ selected, onChange, search = '' }) {
  const categories = useMemo(() => {
    const groups = {};
    for (const item of STANDARD_EQUIPMENT) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    // Sort items within each category alphabetically
    for (const cat of Object.keys(groups)) {
      groups[cat].sort((a, b) => a.label.localeCompare(b.label));
    }
    return Object.entries(groups);
  }, []);

  // Filter items by search term; drop categories with no matches
  const filteredCategories = useMemo(() => {
    if (!search) return categories;
    const q = search.toLowerCase();
    return categories
      .map(([cat, items]) => [cat, items.filter(i => i.label.toLowerCase().includes(q))])
      .filter(([, items]) => items.length > 0);
  }, [categories, search]);

  const [openCats, setOpenCats] = useState(() => new Set(['Strength']));

  // Auto-expand all visible categories when search is active
  const effectiveOpenCats = search
    ? new Set(filteredCategories.map(([cat]) => cat))
    : openCats;

  const toggleCat = (cat) => {
    if (search) return; // don't allow toggling during search
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleItem = (id) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {selected.map((id) => {
            const opt = STANDARD_EQUIPMENT.find((o) => o.id === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full"
              >
                {opt?.label || id}
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); toggleItem(id); }}
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

      {/* Subcategory groups */}
      <div className="space-y-0.5 -mx-1 px-1">
        {filteredCategories.map(([cat, items]) => {
          const isOpen = effectiveOpenCats.has(cat);
          const selectedInCat = items.filter((i) => selected.includes(i.id)).length;
          return (
            <div key={cat}>
              <button
                type="button"
                onClick={() => toggleCat(cat)}
                className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-md transition-colors"
              >
                <ChevronRight
                  className={`w-3.5 h-3.5 shrink-0 text-stone-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                />
                <span>{cat}</span>
                {selectedInCat > 0 && (
                  <span className="ml-auto text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full">
                    {selectedInCat}
                  </span>
                )}
              </button>
              {isOpen && (
                <div className="ml-2 space-y-0.5">
                  {items.map((opt) => {
                    const isSelected = selected.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleItem(opt.id)}
                        className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm text-left transition-colors ${
                          isSelected ? 'text-indigo-700 bg-indigo-50/50' : 'text-stone-600 hover:bg-stone-100'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-stone-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </span>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}