import { Search, MapPin, ShieldCheck } from 'lucide-react';
import { STANDARD_SERVICES } from '@/data/standardServices';
import { STANDARD_FACILITIES } from '@/data/standardFacilities';

// Reusable filter bar for the Directory. Controlled component —
// all state lives in the parent page. Service and Facility selects
// use the canonical STANDARD_SERVICES / STANDARD_FACILITIES taxonomy
// (the same source used by Professional and Business profiles) so
// filter values match canonical profile service/facility ids.
export default function DirectoryFilters({
  query, setQuery,
  typeFilter, setTypeFilter,
  serviceId, setServiceId,
  facilityId, setFacilityId,
  verifiedOnly, setVerifiedOnly,
  locationText, setLocationText,
}) {
  const showFacilities = typeFilter === 'all' || typeFilter === 'business';

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, service, profession, business type…"
          className="w-full pl-11 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 p-1 bg-stone-100 rounded-lg w-full sm:w-auto">
        {[
          { value: 'all', label: 'All' },
          { value: 'professional', label: 'Professionals' },
          { value: 'business', label: 'Businesses' },
        ].map(t => (
          <button
            key={t.value}
            onClick={() => setTypeFilter(t.value)}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              typeFilter === t.value
                ? 'bg-white text-stone-800 shadow-sm'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filter row */}
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={serviceId}
          onChange={e => setServiceId(e.target.value)}
          className="px-3 py-2.5 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 flex-1"
        >
          <option value="">All Services</option>
          {STANDARD_SERVICES.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>

        {showFacilities && (
          <select
            value={facilityId}
            onChange={e => setFacilityId(e.target.value)}
            className="px-3 py-2.5 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 flex-1"
          >
            <option value="">All Facilities</option>
            {STANDARD_FACILITIES.map(f => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        )}

        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            value={locationText}
            onChange={e => setLocationText(e.target.value)}
            placeholder="Location"
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
          />
        </div>

        <button
          onClick={() => setVerifiedOnly(!verifiedOnly)}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            verifiedOnly
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Verified only
        </button>
      </div>
    </div>
  );
}