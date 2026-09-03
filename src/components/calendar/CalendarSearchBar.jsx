// Calendar search + filter bar (§21–§22).
// Filters operate on the shared normalized occurrence model, not on
// independent event interpretation.

import { Search, X, Filter } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const VISIBILITY_OPTIONS = [
  { value: '', label: 'All visibility' },
  { value: 'private', label: 'Private' },
  { value: 'connections', label: 'Connections' },
  { value: 'public', label: 'Public' },
  { value: 'staff', label: 'Staff only' },
];

const SOURCE_OPTIONS = [
  { value: '', label: 'All sources' },
  { value: 'manual', label: 'Manual' },
  { value: 'booking', label: 'Booking' },
  { value: 'business_scheduling', label: 'Business scheduling' },
];

export default function CalendarSearchBar({ search, onSearchChange, filters, onFiltersChange }) {
  const [showFilters, setShowFilters] = useState(false);
  const filterRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setShowFilters(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeFilterCount = Object.values(filters || {}).filter(v => v).length;

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
        <input
          type="text"
          value={search || ''}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search events..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="relative" ref={filterRef}>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
            activeFilterCount > 0
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
              : 'border-stone-200 text-stone-600 hover:bg-stone-50'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-0.5 w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        {showFilters && (
          <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg border border-stone-200 shadow-lg z-20 p-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Visibility</label>
              <select
                value={filters?.visibility || ''}
                onChange={(e) => onFiltersChange({ ...filters, visibility: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-stone-200 rounded-md focus:outline-none focus:border-indigo-400"
              >
                {VISIBILITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Source</label>
              <select
                value={filters?.sourceSystem || ''}
                onChange={(e) => onFiltersChange({ ...filters, sourceSystem: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-stone-200 rounded-md focus:outline-none focus:border-indigo-400"
              >
                {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={() => onFiltersChange({ visibility: '', sourceSystem: '', lifecycleState: '' })}
                className="text-xs text-indigo-600 font-medium hover:text-indigo-700"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}