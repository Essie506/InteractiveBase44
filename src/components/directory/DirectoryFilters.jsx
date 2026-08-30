import { Search, MapPin, ShieldCheck, RotateCcw } from 'lucide-react';
import { STANDARD_SERVICES } from '@/data/standardServices';
import { STANDARD_FACILITIES } from '@/data/standardFacilities';
import { BUSINESS_TYPES } from '@/data/businessTypes';
import { STANDARD_PROFESSIONAL_TYPES } from '@/data/standardProfessionalTypes';
import { STANDARD_SPECIALISMS } from '@/data/standardSpecialisms';
import { STANDARD_SESSION_TYPES } from '@/data/standardSessionTypes';
import FilterMultiSelect from './FilterMultiSelect';
import EquipmentFilter from './EquipmentFilter';
import { Slider } from '@/components/ui/slider';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { getSortOptions } from '@/lib/directorySortOptions';

const DATE_OPTIONS = [
  { value: '', label: 'Any date' },
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'This week' },
  { value: 'weekend', label: 'This weekend' },
  { value: 'custom', label: 'Custom range' },
];

const FORMAT_OPTIONS = [
  { id: 'in-person', label: 'In-person' },
  { id: 'online', label: 'Online' },
  { id: 'hybrid', label: 'Hybrid' },
];

const PRICE_OPTIONS = [
  { id: 'free', label: 'Free' },
  { id: 'paid', label: 'Paid' },
];

// Reusable filter panel for the Directory. Controlled component —
// all filter state lives in the parent page. Rendered in the desktop
// right-hand drawer and the mobile Sheet.
//
// Each category is a collapsible Accordion section. Collapsing a
// section does NOT clear its selections (state is in the parent).
// Services/Activities starts COLLAPSED by default.
//
// PER-SECTION SEARCH:
//   Each filter section has its own search input inside its expanded
//   content. The search filters only that section's options, is
//   case-insensitive, supports partial matching, and does not affect
//   selections or any other section's search.
//
// ALPHABETICAL ORDER:
//   Filter values are sorted alphabetically by label within each
//   section. Section order is semantic/logical and stable across types.
//
// CONTEXTUAL VISIBILITY (entity-specific dimensions surface only for
// the type that owns them, so "All" exposes just the genuinely shared
// discovery controls):
//   All           → Sort, Verified, Location, Distance, Price, Date, Services/Activities
//   Professionals → Sort, Verified, Location, Distance, Price, Pro Type, Specialisms, Session Type, Services
//   Businesses    → Sort, Verified, Location, Distance, Price, Biz Type, Facilities, Equipment, Services
//   Events        → Sort, Verified, Date, Location, Distance, Price, Activities, Format, Spaces Available
//
// Price + Date are shared enough to surface in "All" but, per the
// entity-aware matching in discoveryService, apply ONLY to the entity
// type that owns the dimension (Date → events; Price → events for now,
// since only events carry a comparable public price). Professionals
// and Businesses have no comparable public price yet, so Price is
// hidden for them until structured pricing is introduced.
//
// SORT OPTIONS:
//   Price: Low→High / High→Low surface ONLY for Events (only events
//   have a comparable public price). See directorySortOptions.

function alphaSort(options) {
  return [...options].sort((a, b) => a.label.localeCompare(b.label));
}

function FilterSection({ value, title, children }) {
  return (
    <AccordionItem value={value} className="border-b border-stone-100 last:border-0">
      <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide text-stone-400 hover:no-underline hover:text-stone-600 py-3">
        {title}
      </AccordionTrigger>
      <AccordionContent className="pb-4 pt-0">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

export default function DirectoryFilters({
  query, setQuery,
  typeFilter, setTypeFilter,
  serviceIds, setServiceIds,
  facilityIds, setFacilityIds,
  businessTypeIds, setBusinessTypeIds,
  equipmentIds, setEquipmentIds,
  professionalTypeIds, setProfessionalTypeIds,
  specialismIds, setSpecialismIds,
  sessionTypeIds, setSessionTypeIds,
  verifiedOnly, setVerifiedOnly,
  locationText, setLocationText,
  sort, setSort,
  distance, setDistance,
  originStatus,
  // Event filters
  dateFilter, setDateFilter,
  dateFrom, setDateFrom,
  dateTo, setDateTo,
  formatIds, setFormatIds,
  priceIds, setPriceIds,
  availableOnly, setAvailableOnly,
  onReset,
  onSearch,
}) {
  // Contextual section visibility — see file header.
  const isAll = typeFilter === 'all';
  const isPro = typeFilter === 'professional';
  const isBiz = typeFilter === 'business';
  const isEvt = typeFilter === 'event';
  const showProfessionalType = isPro;
  const showSpecialisms = isPro;
  const showSessionType = isPro;
  const showBusinessType = isBiz;
  const showFacilities = isBiz;
  const showEquipment = isBiz;
  // Date + Price surface in All (applied to events only, entity-aware).
  // Format + Spaces Available are event-specific.
  const showDate = isAll || isEvt;
  const showPrice = isAll || isEvt;
  const showFormat = isEvt;
  const showAvailability = isEvt;
  // Events present the shared Services taxonomy as "Activities".
  const servicesSectionTitle = isEvt ? 'Activities' : 'Services';
  const servicesSearchPlaceholder = isEvt ? 'Search activities...' : 'Search services...';
  // Price sort options surface only for Events.
  const sortOptions = getSortOptions(typeFilter);

  function toggleArrayValue(arr, id, setter) {
    if (arr.includes(id)) {
      setter(arr.filter(x => x !== id));
    } else {
      setter([...arr, id]);
    }
  }

  // Date section — position depends on context:
  //   Events → before Location; All → after Price. Extracted once so
  //   the (identical) content is not duplicated.
  const dateSection = showDate ? (
    <FilterSection value="event-date" title="Event date">
      <select
        value={dateFilter}
        onChange={e => setDateFilter(e.target.value)}
        className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
      >
        {DATE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {dateFilter === 'custom' && (
        <div className="mt-2 flex gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="flex-1 px-2 py-1.5 bg-white border border-stone-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400"
            placeholder="From"
          />
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="flex-1 px-2 py-1.5 bg-white border border-stone-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400"
            placeholder="To"
          />
        </div>
      )}
    </FilterSection>
  ) : null;

  return (
    <div>
      {/* Listing search */}
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

      <Accordion type="multiple" defaultValue={['show-me', 'location']} className="w-full">
        <FilterSection value="sort" title="Sort by">
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
          >
            {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FilterSection>

        <FilterSection value="show-me" title="Show me">
          <div className="flex gap-1 p-1 bg-stone-100 rounded-lg mb-2.5">
            {[
              { value: 'all', label: 'All' },
              { value: 'professional', label: 'Pros' },
              { value: 'business', label: 'Biz' },
              { value: 'event', label: 'Events' },
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
        </FilterSection>

        {/* Events: Date comes before Location. */}
        {isEvt && dateSection}

        <FilterSection value="location" title="Location">
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

          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-stone-500">Within</span>
              <span className={`text-xs font-medium ${originStatus === 'resolved' ? 'text-stone-700' : 'text-stone-400'}`}>
                {originStatus === 'resolved' ? `${distance} miles` : '— miles'}
              </span>
            </div>
            <Slider
              value={[distance]}
              onValueChange={(v) => setDistance(v[0])}
              min={1}
              max={50}
              step={1}
              disabled={originStatus !== 'resolved'}
            />
            {originStatus !== 'resolved' && (
              <p className="text-xs text-stone-400 mt-1.5">
                {originStatus === 'resolving' ? 'Resolving location…' : 'Enter a location to filter by distance'}
              </p>
            )}
          </div>
        </FilterSection>

        {/* Price — shared surface (All + Event). Free/Paid applies to
            events only (entity-aware); pros/biz have no comparable
            public price yet, so Price is hidden for them. */}
        {showPrice && (
          <FilterSection value="event-price" title="Price">
            <div className="space-y-1.5">
              {PRICE_OPTIONS.map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggleArrayValue(priceIds || [], o.id, setPriceIds)}
                  className="flex items-center gap-2 w-full text-left"
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    (priceIds || []).includes(o.id) ? 'bg-indigo-600 border-indigo-600' : 'border-stone-300 bg-white'
                  }`}>
                    {(priceIds || []).includes(o.id) && <span className="w-2 h-2 bg-white rounded-sm" />}
                  </span>
                  <span className="text-sm text-stone-600">{o.label}</span>
                </button>
              ))}
            </div>
          </FilterSection>
        )}

        {/* All: Date comes after Price (applies to events only). */}
        {isAll && dateSection}

        {/* Professional-specific */}
        {showProfessionalType && (
          <FilterSection value="pro-type" title="Professional type">
            <FilterMultiSelect
              options={alphaSort(STANDARD_PROFESSIONAL_TYPES)}
              selected={professionalTypeIds}
              onChange={setProfessionalTypeIds}
              searchPlaceholder="Search professional types..."
            />
          </FilterSection>
        )}

        {showSpecialisms && (
          <FilterSection value="specialisms" title="Specialisms">
            <FilterMultiSelect
              options={alphaSort(STANDARD_SPECIALISMS)}
              selected={specialismIds}
              onChange={setSpecialismIds}
              searchPlaceholder="Search specialisms..."
            />
          </FilterSection>
        )}

        {showSessionType && (
          <FilterSection value="session-type" title="Session type">
            <FilterMultiSelect
              options={alphaSort(STANDARD_SESSION_TYPES)}
              selected={sessionTypeIds}
              onChange={setSessionTypeIds}
              searchPlaceholder="Search session types..."
            />
          </FilterSection>
        )}

        {/* Business-specific */}
        {showBusinessType && (
          <FilterSection value="biz-type" title="Business type">
            <FilterMultiSelect
              options={alphaSort(BUSINESS_TYPES)}
              selected={businessTypeIds}
              onChange={setBusinessTypeIds}
              searchPlaceholder="Search business types..."
            />
          </FilterSection>
        )}

        {showFacilities && (
          <FilterSection value="facilities" title="Facilities">
            <FilterMultiSelect
              options={alphaSort(STANDARD_FACILITIES)}
              selected={facilityIds}
              onChange={setFacilityIds}
              searchPlaceholder="Search facilities..."
            />
          </FilterSection>
        )}

        {showEquipment && (
          <FilterSection value="equipment" title="Equipment">
            <EquipmentFilter
              selected={equipmentIds}
              onChange={setEquipmentIds}
            />
          </FilterSection>
        )}

        {/* Services / Activities — shared ServiceDefinition taxonomy.
            Collapsed by default. "Activities" when viewing events. */}
        <FilterSection value="services" title={servicesSectionTitle}>
          <FilterMultiSelect
            options={alphaSort(STANDARD_SERVICES)}
            selected={serviceIds}
            onChange={setServiceIds}
            searchPlaceholder={servicesSearchPlaceholder}
          />
        </FilterSection>

        {/* Event-specific details */}
        {showFormat && (
          <FilterSection value="event-format" title="Format">
            <div className="space-y-1.5">
              {FORMAT_OPTIONS.map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggleArrayValue(formatIds || [], o.id, setFormatIds)}
                  className="flex items-center gap-2 w-full text-left"
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    (formatIds || []).includes(o.id) ? 'bg-indigo-600 border-indigo-600' : 'border-stone-300 bg-white'
                  }`}>
                    {(formatIds || []).includes(o.id) && <span className="w-2 h-2 bg-white rounded-sm" />}
                  </span>
                  <span className="text-sm text-stone-600">{o.label}</span>
                </button>
              ))}
            </div>
          </FilterSection>
        )}

        {showAvailability && (
          <FilterSection value="event-availability" title="Availability">
            <button
              type="button"
              onClick={() => setAvailableOnly(!availableOnly)}
              className="flex items-center gap-2 w-full text-left"
            >
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                availableOnly ? 'bg-emerald-500 border-emerald-500' : 'border-stone-300 bg-white'
              }`}>
                {availableOnly && <span className="w-2 h-2 bg-white rounded-sm" />}
              </span>
              <span className="text-sm text-stone-600">Spaces available only</span>
            </button>
          </FilterSection>
        )}
      </Accordion>

      {/* Bottom action bar — Search applies all draft selections */}
      <div className="mt-5 pt-4 border-t border-stone-200 flex gap-2.5">
        <button
          onClick={onReset}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 border border-stone-200 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset Filters
        </button>
        <button
          onClick={onSearch}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Search className="w-4 h-4" />
          Search
        </button>
      </div>
    </div>
  );
}