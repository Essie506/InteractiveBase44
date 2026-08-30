import { useState, useMemo } from 'react';
import { Search, MapPin, ShieldCheck, RotateCcw } from 'lucide-react';
import { STANDARD_SERVICES } from '@/data/standardServices';
import { STANDARD_FACILITIES } from '@/data/standardFacilities';
import { BUSINESS_TYPES } from '@/data/businessTypes';
import { STANDARD_PROFESSIONAL_TYPES } from '@/data/standardProfessionalTypes';
import { STANDARD_SPECIALISMS } from '@/data/standardSpecialisms';
import { STANDARD_SESSION_TYPES } from '@/data/standardSessionTypes';
import { STANDARD_EQUIPMENT } from '@/data/standardEquipment';
import FilterMultiSelect from './FilterMultiSelect';
import EquipmentFilter from './EquipmentFilter';
import { Slider } from '@/components/ui/slider';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

// Reusable filter panel for the Directory. Controlled component —
// all filter state lives in the parent page. Rendered in the desktop
// right-hand drawer and the mobile Sheet.
//
// Each category is a collapsible Accordion section. Collapsing a
// section does NOT clear its selections (state is in the parent).
//
// FILTER SEARCH:
//   A search input at the top filters OPTIONS (not listings).
//   When active, only matching options are shown within their
//   sections, sections with no matches are hidden, and all visible
//   sections auto-expand. Search is case-insensitive and matches
//   partial text. It does not select or reset anything.
//
// ALPHABETICAL ORDER:
//   Filter values are sorted alphabetically by label within each
//   section. Section order remains semantic/logical.
//
// Type-dependent sections:
//   All         → Pro Type, Specialisms, Session Type, Biz Type, Services, Facilities, Equipment
//   Professionals → Pro Type, Specialisms, Session Type, Services
//   Businesses    → Biz Type, Services, Facilities, Equipment
//
// Taxonomy sources:
//   Professional Type — STANDARD_PROFESSIONAL_TYPES
//   Specialisms       — STANDARD_SPECIALISMS
//   Session Type      — STANDARD_SESSION_TYPES
//   Services          — STANDARD_SERVICES (shared pro/biz taxonomy)
//   Facilities        — STANDARD_FACILITIES (business-only taxonomy)
//   Business type     — BUSINESS_TYPES (Business.type enum values)
//   Equipment         — STANDARD_EQUIPMENT (business-only, nested categories)
const SORT_OPTIONS = [
  { value: 'distance', label: 'Distance' },
  { value: 'verified', label: 'Verified' },
  { value: 'recommended', label: 'Recommended' },
];

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
  onReset,
}) {
  const [filterSearch, setFilterSearch] = useState('');
  const [accordionValue, setAccordionValue] = useState(['show-me', 'location', 'services']);

  const showProfessionalType = typeFilter === 'all' || typeFilter === 'professional';
  const showSpecialisms = typeFilter === 'all' || typeFilter === 'professional';
  const showSessionType = typeFilter === 'all' || typeFilter === 'professional';
  const showBusinessType = typeFilter === 'all' || typeFilter === 'business';
  const showFacilities = typeFilter === 'all' || typeFilter === 'business';
  const showEquipment = typeFilter === 'all' || typeFilter === 'business';

  const search = filterSearch.toLowerCase().trim();

  // Filter + sort options by search term
  const filterOpts = (opts) => {
    const sorted = alphaSort(opts);
    if (!search) return sorted;
    return sorted.filter(o => o.label.toLowerCase().includes(search));
  };

  const professionalTypeOptions = showProfessionalType ? filterOpts(STANDARD_PROFESSIONAL_TYPES) : [];
  const specialismsOptions = showSpecialisms ? filterOpts(STANDARD_SPECIALISMS) : [];
  const sessionTypeOptions = showSessionType ? filterOpts(STANDARD_SESSION_TYPES) : [];
  const businessTypeOptions = showBusinessType ? filterOpts(BUSINESS_TYPES) : [];
  const servicesOptions = filterOpts(STANDARD_SERVICES);
  const facilitiesOptions = showFacilities ? filterOpts(STANDARD_FACILITIES) : [];

  // Equipment matches (checked separately due to nested categories)
  const equipmentMatchCount = useMemo(() => {
    if (!search) return STANDARD_EQUIPMENT.length;
    return STANDARD_EQUIPMENT.filter(e => e.label.toLowerCase().includes(search)).length;
  }, [search]);

  // Which sections have matching options (hidden when search yields 0)
  const showProTypeSection = showProfessionalType && professionalTypeOptions.length > 0;
  const showSpecialismsSection = showSpecialisms && specialismsOptions.length > 0;
  const showSessionTypeSection = showSessionType && sessionTypeOptions.length > 0;
  const showBizTypeSection = showBusinessType && businessTypeOptions.length > 0;
  const showServicesSection = servicesOptions.length > 0;
  const showFacilitiesSection = showFacilities && facilitiesOptions.length > 0;
  const showEquipmentSection = showEquipment && (!search || equipmentMatchCount > 0);

  // All visible sections — used to auto-expand when search is active
  const allVisibleSections = useMemo(() => {
    const sections = ['sort', 'show-me', 'location'];
    if (showProTypeSection) sections.push('pro-type');
    if (showSpecialismsSection) sections.push('specialisms');
    if (showSessionTypeSection) sections.push('session-type');
    if (showBizTypeSection) sections.push('biz-type');
    if (showServicesSection) sections.push('services');
    if (showFacilitiesSection) sections.push('facilities');
    if (showEquipmentSection) sections.push('equipment');
    return sections;
  }, [showProTypeSection, showSpecialismsSection, showSessionTypeSection,
      showBizTypeSection, showServicesSection, showFacilitiesSection, showEquipmentSection]);

  const anyFilterMatches = showProTypeSection || showSpecialismsSection || showSessionTypeSection ||
    showBizTypeSection || showServicesSection || showFacilitiesSection || showEquipmentSection;

  return (
    <div>
      {/* Filter option search — searches filter options, not listings */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
        <input
          type="text"
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          placeholder="Search filters..."
          className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

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

      {search && !anyFilterMatches && (
        <p className="text-sm text-stone-400 mb-4 text-center">No matching filters</p>
      )}

      <Accordion
        type="multiple"
        value={search ? allVisibleSections : accordionValue}
        onValueChange={(v) => { if (!search) setAccordionValue(v); }}
        className="w-full"
      >
        <FilterSection value="sort" title="Sort by">
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FilterSection>

        <FilterSection value="show-me" title="Show me">
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
        </FilterSection>

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

        {showProTypeSection && (
          <FilterSection value="pro-type" title="Professional type">
            <FilterMultiSelect
              options={professionalTypeOptions}
              selected={professionalTypeIds}
              onChange={setProfessionalTypeIds}
            />
          </FilterSection>
        )}

        {showSpecialismsSection && (
          <FilterSection value="specialisms" title="Specialisms">
            <FilterMultiSelect
              options={specialismsOptions}
              selected={specialismIds}
              onChange={setSpecialismIds}
            />
          </FilterSection>
        )}

        {showSessionTypeSection && (
          <FilterSection value="session-type" title="Session type">
            <FilterMultiSelect
              options={sessionTypeOptions}
              selected={sessionTypeIds}
              onChange={setSessionTypeIds}
            />
          </FilterSection>
        )}

        {showBizTypeSection && (
          <FilterSection value="biz-type" title="Business type">
            <FilterMultiSelect
              options={businessTypeOptions}
              selected={businessTypeIds}
              onChange={setBusinessTypeIds}
            />
          </FilterSection>
        )}

        {showServicesSection && (
          <FilterSection value="services" title="Services">
            <FilterMultiSelect
              options={servicesOptions}
              selected={serviceIds}
              onChange={setServiceIds}
            />
          </FilterSection>
        )}

        {showFacilitiesSection && (
          <FilterSection value="facilities" title="Facilities">
            <FilterMultiSelect
              options={facilitiesOptions}
              selected={facilityIds}
              onChange={setFacilityIds}
            />
          </FilterSection>
        )}

        {showEquipmentSection && (
          <FilterSection value="equipment" title="Equipment">
            <EquipmentFilter
              selected={equipmentIds}
              onChange={setEquipmentIds}
              search={search}
            />
          </FilterSection>
        )}
      </Accordion>

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