// URL parameter serialization/deserialization for Directory applied
// search state. Uses stable taxonomy IDs (not display labels) for
// filter selections. Per-section search text (e.g. "Search services...")
// is NOT persisted — those are UI-only values, not search criteria.
//
// Params:
//   q       — listing/search query (text)
//   type    — result type (all|professional|business|event)
//   sort    — sort order (distance|verified|recommended|date)
//   verified — verified only (1|0)
//   loc     — location text
//   dist    — distance/radius in miles
//   ptype   — professional type IDs (comma-separated)
//   spec    — specialism IDs (comma-separated)
//   sess    — session type IDs (comma-separated)
//   svc     — service IDs (comma-separated — shared with events Activity)
//   btype   — business type IDs (comma-separated)
//   fac     — facility IDs (comma-separated)
//   equip   — equipment IDs (comma-separated)
//   date    — event date filter (today|tomorrow|week|weekend|custom)
//   from    — custom date range start (YYYY-MM-DD)
//   to      — custom date range end (YYYY-MM-DD)
//   format  — event format (in-person,online,hybrid — comma-separated)
//   price   — event price (free,paid — comma-separated)
//   avail   — spaces available only (1|0)
//   etype   — event Activity service IDs (comma-separated — alias of svc
//             for events; kept separate so All-type searches can apply
//             svc to professionals/businesses and etype to events
//             independently)
//
// Empty/default values are omitted from the URL. Unknown params
// are ignored on parse.

export const DEFAULT_DIRECTORY_FILTERS = {
  query: '',
  typeFilter: 'all',
  sort: 'recommended',
  verifiedOnly: false,
  locationText: '',
  distance: 10,
  serviceIds: [],
  facilityIds: [],
  businessTypeIds: [],
  equipmentIds: [],
  professionalTypeIds: [],
  specialismIds: [],
  sessionTypeIds: [],
  // Event filters
  dateFilter: '',      // today|tomorrow|week|weekend|custom
  dateFrom: '',        // YYYY-MM-DD
  dateTo: '',          // YYYY-MM-DD
  formatIds: [],        // [in-person, online, hybrid]
  priceIds: [],        // [free, paid]
  availableOnly: false,
  eventTypeIds: [],    // Activity service IDs for events
};

function parseIdList(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function serializeIdList(ids) {
  if (!ids || ids.length === 0) return '';
  return ids.join(',');
}

export function parseDirectoryParams(searchParams) {
  if (!searchParams) return { ...DEFAULT_DIRECTORY_FILTERS };
  const get = (key) => searchParams.get(key);
  const type = get('type');
  const sort = get('sort');
  return {
    query: get('q') || DEFAULT_DIRECTORY_FILTERS.query,
    typeFilter: type || DEFAULT_DIRECTORY_FILTERS.typeFilter,
    sort: sort || DEFAULT_DIRECTORY_FILTERS.sort,
    verifiedOnly: get('verified') === '1',
    locationText: get('loc') || DEFAULT_DIRECTORY_FILTERS.locationText,
    distance: get('dist')
      ? parseInt(get('dist'), 10) || DEFAULT_DIRECTORY_FILTERS.distance
      : DEFAULT_DIRECTORY_FILTERS.distance,
    serviceIds: parseIdList(get('svc')),
    facilityIds: parseIdList(get('fac')),
    businessTypeIds: parseIdList(get('btype')),
    equipmentIds: parseIdList(get('equip')),
    professionalTypeIds: parseIdList(get('ptype')),
    specialismIds: parseIdList(get('spec')),
    sessionTypeIds: parseIdList(get('sess')),
  };
}

export function serializeDirectoryParams(filters) {
  const params = new URLSearchParams();
  if (filters.query) params.set('q', filters.query);
  if (filters.typeFilter && filters.typeFilter !== 'all')
    params.set('type', filters.typeFilter);
  if (filters.sort && filters.sort !== 'recommended')
    params.set('sort', filters.sort);
  if (filters.verifiedOnly) params.set('verified', '1');
  if (filters.locationText) params.set('loc', filters.locationText);
  if (filters.distance && filters.distance !== 10)
    params.set('dist', String(filters.distance));
  if (filters.serviceIds?.length)
    params.set('svc', serializeIdList(filters.serviceIds));
  if (filters.facilityIds?.length)
    params.set('fac', serializeIdList(filters.facilityIds));
  if (filters.businessTypeIds?.length)
    params.set('btype', serializeIdList(filters.businessTypeIds));
  if (filters.equipmentIds?.length)
    params.set('equip', serializeIdList(filters.equipmentIds));
  if (filters.professionalTypeIds?.length)
    params.set('ptype', serializeIdList(filters.professionalTypeIds));
  if (filters.specialismIds?.length)
    params.set('spec', serializeIdList(filters.specialismIds));
  if (filters.sessionTypeIds?.length)
    params.set('sess', serializeIdList(filters.sessionTypeIds));
  return params;
}