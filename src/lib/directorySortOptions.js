// Directory sort option metadata.
// ───────────────────────────────────────────────────────────
// Price sort options surface ONLY for the Events context, since only
// events carry a comparable public price (CalendarEvent.price_pence).
// They are intentionally NOT exposed for All / Professionals / Businesses
// until those types have genuine structured pricing (see the approved
// pricing decision: defer cross-type pricing model).

export const BASE_SORT_OPTIONS = [
  { value: 'distance', label: 'Distance' },
  { value: 'verified', label: 'Verified' },
  { value: 'recommended', label: 'Recommended' },
  { value: 'date', label: 'Date (soonest)' },
];

export const EVENT_PRICE_SORT_OPTIONS = [
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
];

export function isPriceSort(sort) {
  return sort === 'price-asc' || sort === 'price-desc';
}

// Sort options for a given result type. Price options appear only for
// Events.
export function getSortOptions(typeFilter) {
  if (typeFilter === 'event') {
    return [...BASE_SORT_OPTIONS, ...EVENT_PRICE_SORT_OPTIONS];
  }
  return BASE_SORT_OPTIONS;
}