// URL parameter serialization/deserialization for Directory applied
// search state. Uses stable taxonomy IDs (not display labels) for
// filter selections. Per-section search text (e.g. "Search services...")
// is NOT persisted — those are UI-only values, not search criteria.
//
// Params:
//   q       — listing/search query (text)
//   type    — result type (all|professional|business)
//   sort    — sort order (distance|verified|recommended)
//   verified — verified only (1|0)
//   loc     — location text
//   dist    — distance/radius in miles
//   ptype   — professional type IDs (comma-separated)
//   spec    — specialism IDs (comma-separated)
//   sess    — session type IDs (comma-separated)
//   svc     — service IDs (comma-separated)
//   btype   — business type IDs (comma-separated)
//   fac     — facility IDs (comma-separated)
//   equip   — equipment IDs (comma-separated)
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