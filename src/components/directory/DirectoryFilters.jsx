import { Search, MapPin, ShieldCheck, RotateCcw } from 'lucide-react';
import { STANDARD_SERVICES } from '@/data/standardServices';
import { STANDARD_FACILITIES } from '@/data/standardFacilities';
import FilterMultiSelect from './FilterMultiSelect';

// Reusable filter sidebar for the Directory. Controlled component —
// all state lives in the parent page. Rendered both in the desktop
// sidebar and the mobile Sheet drawer.
//
// Category structure follows the visual reference. Only categories
// with real Interactive data are functional:
//   Sort by     — functional (verified-first default + alternatives)
//   Show me     — functional (type toggle + verified-only)
//   Location    — functional (text-based on public display string)
//   Services    — functional (multi-select, canonical taxonomy ids)
//   Facilities  — functional (multi-select, business-relevant)
//
// Deferred (no backend/data yet): Distance/radius, Equipment, General.
const SORT_OPTIONS = [
  { value: 'verified_first', label: 'Verified first' },
  { value: 'name_az', label: 'Name A–Z' },
  { value: 'recent', label: 'Recently updated' },
];

function Section({ title, children }) {
  return (
    <div className="border-b border-stone-100 pb-4 mb-4 last:border-0 last:mb-0 last:pb-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2.5">{title}</h3>
      {children}
    </div>
  );
}

export default function DirectoryFilters({
  query, setQuery,
  typeFilter, setTypeFilter,
  serviceIds, setServiceIds,
  facilityIds, setFacilityIds,
  verifiedOnly, setVerifiedOnly,
  locationText, setLocationText,
  sort, setSort,
  onReset,
}) {
  const showFacilities = typeFilter === 'all' || typeFilter === 'business';

  return (
    <div>
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, service…"
          className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <Section title="Sort by">
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Section>

      <Section title="Show me">
        <div className="flex gap-1 p-1 bg-stone-100 rounded-lg mb-2.5">
          {[
            { value: 'all', label: 'All' },
            { value: 'professional', label: 'Pros' },
            { value: 'business', label: 'Biz' },
          ].map(t => (
            <button
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                typeFilter === t.value
                  ? 'bg-white text-stone-800 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setVerifiedOnly(!verifiedOnly)}
          className="flex items-center gap-2 w-full text-left"
        >
          <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
            verifiedOnly ? 'bg-emerald-500 border-emerald-500' : 'border-stone-300 bg-white'
          }`}>
            {verifiedOnly && <ShieldCheck className="w-3 h-3 text-white" strokeWidth={3} />}
          </span>
          <span className="text-sm text-stone-600">Verified only</span>
        </button>
      </Section>

      <Section title="Location">
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            value={locationText}
            onChange={e => setLocationText(e.target.value)}
            placeholder="City or area"
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
          />
        </div>
      </Section>

      <Section title="Services">
        <FilterMultiSelect
          options={STANDARD_SERVICES}
          selected={serviceIds}
          onChange={setServiceIds}
        />
      </Section>

      {showFacilities && (
        <Section title="Facilities">
          <FilterMultiSelect
            options={STANDARD_FACILITIES}
            selected={facilityIds}
            onChange={setFacilityIds}
          />
        </Section>
      )}

      <button
        onClick={onReset}
        className="mt-4 inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 font-medium"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Reset filters
      </button>
    </div>
  );
}