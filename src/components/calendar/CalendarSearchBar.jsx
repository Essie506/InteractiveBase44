// Calendar search + filter bar (§21–§22).
// Filters operate on the shared normalized occurrence model, not on
// independent event interpretation.
//
// §21 Search matches title, description, location, category, source label.
// §22 Filters: visibility, source system, lifecycle state, event category,
//   operating context (Personal/Professional/Business), scheduled/historical.

import { Search, X, Filter } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { EVENT_CATEGORIES } from '@/lib/calendarCategory';

const VISIBILITY_OPTIONS = [
  { value: '', label: 'All visibility' },
  { value: 'private', label: 'Private' },
  { value: 'connections', label: 'Connections' },
  { value: 'public', label: 'Public' },
  { value: 'staff', label: 'Staff only' },
];

const SOURCE_OPTIONS = [
  { value: '', label: 'All sources' },
  { value: 'manual', label: 'Personal' },
  { value: 'booking', label: 'Booking' },
  { value: 'business_scheduling', label: 'Business scheduling' },
  { value: 'workout', label: 'Workout' },
  { value: 'messaging', label: 'Message' },
  { value: 'external', label: 'External' },
];

const CONTEXT_OPTIONS = [
  { value: '', label: 'All contexts' },
  { value: 'personal', label: 'Personal' },
  { value: 'professional', label: 'Professional' },
  { value: 'business', label: 'Business' },
];

const PERIOD_OPTIONS = [
  { value: '', label: 'All periods' },
  { value: 'upcoming', label: 'Scheduled / upcoming' },
  { value: 'past', label: 'Historical / past' },
];

const LIFECYCLE_OPTIONS = [
  { value: '', label: 'All states' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'held', label: 'On hold' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'archived', label: 'Archived' },
  { value: 'cancelled', label: 'Cancelled' },
];

const selectClass = "w-full px-2 py-1.5 text-sm border border-stone-200 rounded-md focus:outline-none focus:border-indigo-400";

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-medium text-stone-500 mb-1">{label}</label>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export default function CalendarSearchBar({ search, onSearchChange, filters, onFiltersChange, showHidden, onToggleShowHidden }) {
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
  const set = (key, val) => onFiltersChange({ ...filters, [key]: val || '' });
  const clearAll = () => onFiltersChange({ visibility: '', sourceSystem: '', lifecycleState: '', category: '', context: '', period: '' });

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
        <input
          type="text"
          value={search || ''}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search title, location, category..."
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
          <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-lg border border-stone-200 shadow-lg z-20 p-3 space-y-3">
            <FilterSelect label="Context" value={filters?.context || ''} onChange={(v) => set('context', v)} options={CONTEXT_OPTIONS} />
            <FilterSelect label="Source" value={filters?.sourceSystem || ''} onChange={(v) => set('sourceSystem', v)} options={SOURCE_OPTIONS} />
            <FilterSelect label="Category" value={filters?.category || ''} onChange={(v) => set('category', v)} options={EVENT_CATEGORIES} />
            <FilterSelect label="Period" value={filters?.period || ''} onChange={(v) => set('period', v)} options={PERIOD_OPTIONS} />
            <FilterSelect label="Visibility" value={filters?.visibility || ''} onChange={(v) => set('visibility', v)} options={VISIBILITY_OPTIONS} />
            <FilterSelect label="State" value={filters?.lifecycleState || ''} onChange={(v) => set('lifecycleState', v)} options={LIFECYCLE_OPTIONS} />
            <label className="flex items-center gap-2 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={!!showHidden}
                onChange={(e) => onToggleShowHidden?.(e.target.checked)}
                className="w-4 h-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-stone-600">Show hidden / archived</span>
            </label>
            {activeFilterCount > 0 && (
              <button
                onClick={clearAll}
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