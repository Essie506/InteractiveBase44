import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { loadDirectory, filterResults } from '@/services/discoveryService';
import { geocodeOrigin } from '@/lib/geo';
import { Loader2, SearchX, AlertCircle, Compass, SlidersHorizontal, ChevronRight, ChevronLeft } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import DirectoryFilters from '@/components/directory/DirectoryFilters';
import DirectoryNavDrawer from '@/components/directory/DirectoryNavDrawer';
import ProfessionalResultCard from '@/components/directory/ProfessionalResultCard';
import BusinessResultCard from '@/components/directory/BusinessResultCard';
import EventResultCard from '@/components/directory/EventResultCard';
import { DEV_DEMO_PROFESSIONALS, DEV_DEMO_BUSINESSES, DEV_DEMO_EVENTS } from '@/data/devDemoListings';
import { parseDirectoryParams, serializeDirectoryParams, DEFAULT_DIRECTORY_FILTERS } from '@/lib/directoryUrlState';

// Directory + Search page.
// Public route — usable by signed-out visitors. Reads only from
// the public profile projections (professionalProfilesPublic,
// businessProfilesPublic) which are public-read and contain only
// public-safe fields. No private collections are accessed.
//
// The Interactive logo opens a navigation drawer (does NOT navigate
// to Dashboard). The top-right shows "Directory" as the page title.
// The filter panel lives on the RIGHT side as a collapsible drawer.
// All filter state lives in this component, so opening/closing the
// drawer or nav drawer never resets filters.
export default function Directory() {
  const { user } = useAuth();
  const [, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ professionals: [], businesses: [], events: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [navOpen, setNavOpen] = useState(false);

  // Parse URL search params once on mount — initializes both draft
  // and applied filter state so the Directory restores the exact
  // search when returning from a profile (browser Back) or opening
  // a shared/refreshed URL.
  const [initialParams] = useState(() =>
    parseDirectoryParams(new URLSearchParams(window.location.search))
  );

  const [query, setQuery] = useState(initialParams.query);
  const [typeFilter, setTypeFilter] = useState(initialParams.typeFilter);
  const [serviceIds, setServiceIds] = useState(initialParams.serviceIds);
  const [facilityIds, setFacilityIds] = useState(initialParams.facilityIds);
  const [businessTypeIds, setBusinessTypeIds] = useState(initialParams.businessTypeIds);
  const [equipmentIds, setEquipmentIds] = useState(initialParams.equipmentIds);
  const [professionalTypeIds, setProfessionalTypeIds] = useState(initialParams.professionalTypeIds);
  const [specialismIds, setSpecialismIds] = useState(initialParams.specialismIds);
  const [sessionTypeIds, setSessionTypeIds] = useState(initialParams.sessionTypeIds);
  const [verifiedOnly, setVerifiedOnly] = useState(initialParams.verifiedOnly);
  const [locationText, setLocationText] = useState(initialParams.locationText);
  const [sort, setSort] = useState(initialParams.sort);
  const [distance, setDistance] = useState(initialParams.distance);
  // Event filters
  const [dateFilter, setDateFilter] = useState(initialParams.dateFilter);
  const [dateFrom, setDateFrom] = useState(initialParams.dateFrom);
  const [dateTo, setDateTo] = useState(initialParams.dateTo);
  const [formatIds, setFormatIds] = useState(initialParams.formatIds);
  const [priceIds, setPriceIds] = useState(initialParams.priceIds);
  const [availableOnly, setAvailableOnly] = useState(initialParams.availableOnly);
  const [eventTypeIds, setEventTypeIds] = useState(initialParams.eventTypeIds);
  const [origin, setOrigin] = useState(null);
  const [originStatus, setOriginStatus] = useState(
    initialParams.locationText ? 'resolving' : 'idle'
  );

  // Dev-only demo mode — gated by Vite DEV flag + ?demo=1 URL param.
  // Never active in production builds. Uses local seed data instead of
  // the production discoveryService so the production path is untouched.
  const isDemoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo');

  // Applied filters — snapshot of draft state used for actual filtering.
  // Draft state (above) updates as the user interacts with the filter UI.
  // Results only update when the user presses the Search button, which
  // copies the draft state into appliedFilters.
  const [appliedFilters, setAppliedFilters] = useState({
    ...initialParams, origin: null,
  });

  useEffect(() => {
    if (isDemoMode) {
      setData({ professionals: DEV_DEMO_PROFESSIONALS, businesses: DEV_DEMO_BUSINESSES, events: DEV_DEMO_EVENTS });
      setLoading(false);
      return;
    }
    loadDirectory().
    then(setData).
    catch((err) => setError(err.message || 'Could not load directory')).
    finally(() => setLoading(false));
  }, []);

  // Debounced origin geocoding — resolves the location input to
  // coordinates for distance filtering/sorting. Uses the free
  // OpenStreetMap Nominatim API (no key required, rate-limited).
  useEffect(() => {
    if (!locationText || !locationText.trim()) {
      setOrigin(null);
      setOriginStatus('idle');
      return;
    }
    setOriginStatus('resolving');
    const timer = setTimeout(async () => {
      const result = await geocodeOrigin(locationText);
      if (result) {
        setOrigin(result);
        setOriginStatus('resolved');
      } else {
        setOrigin(null);
        setOriginStatus('not_found');
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [locationText]);

  // Restore origin from URL on mount — immediate (non-debounced)
  // geocode so distance filtering works without waiting for the
  // debounced effect. Patches the origin into appliedFilters so
  // the restored search includes distance filtering immediately.
  useEffect(() => {
    if (!initialParams.locationText) return;
    geocodeOrigin(initialParams.locationText).then(result => {
      if (result) {
        setOrigin(result);
        setOriginStatus('resolved');
        setAppliedFilters(prev => ({ ...prev, origin: result }));
      } else {
        setOriginStatus('not_found');
      }
    });
    // mount only — initialParams is fixed at mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = useMemo(
    () => filterResults(data, {
      query: appliedFilters.query,
      types: appliedFilters.typeFilter === 'all' ? null : [appliedFilters.typeFilter],
      serviceIds: appliedFilters.serviceIds,
      facilityIds: appliedFilters.facilityIds,
      businessTypeIds: appliedFilters.businessTypeIds,
      equipmentIds: appliedFilters.equipmentIds,
      professionalTypeIds: appliedFilters.professionalTypeIds,
      specialismIds: appliedFilters.specialismIds,
      sessionTypeIds: appliedFilters.sessionTypeIds,
      verifiedOnly: appliedFilters.verifiedOnly,
      locationText: appliedFilters.locationText || undefined,
      sort: appliedFilters.sort,
      origin: appliedFilters.origin,
      distance: appliedFilters.distance,
      // Event filters
      dateFilter: appliedFilters.dateFilter,
      dateFrom: appliedFilters.dateFrom,
      dateTo: appliedFilters.dateTo,
      formatIds: appliedFilters.formatIds,
      priceIds: appliedFilters.priceIds,
      availableOnly: appliedFilters.availableOnly,
      eventTypeIds: appliedFilters.eventTypeIds,
    }),
    [data, appliedFilters]
  );

  const handleSearch = () => {
    const newApplied = {
      query, typeFilter, serviceIds, facilityIds, businessTypeIds,
      equipmentIds, professionalTypeIds, specialismIds, sessionTypeIds,
      verifiedOnly, locationText, sort, distance, origin,
      dateFilter, dateFrom, dateTo, formatIds, priceIds, availableOnly, eventTypeIds,
    };
    setAppliedFilters(newApplied);
    // Serialize applied search to URL (replace — not push — so
    // browser Back from a profile restores this exact search).
    setSearchParams(serializeDirectoryParams(newApplied), { replace: true });
    setFiltersOpen(false); // close mobile filter sheet
  };

  const handleReset = () => {
    setQuery('');
    setTypeFilter('all');
    setServiceIds([]);
    setFacilityIds([]);
    setBusinessTypeIds([]);
    setEquipmentIds([]);
    setProfessionalTypeIds([]);
    setSpecialismIds([]);
    setSessionTypeIds([]);
    setVerifiedOnly(false);
    setLocationText('');
    setSort('recommended');
    setDistance(10);
    setDateFilter('');
    setDateFrom('');
    setDateTo('');
    setFormatIds([]);
    setPriceIds([]);
    setAvailableOnly(false);
    setEventTypeIds([]);
    setAppliedFilters({ ...DEFAULT_DIRECTORY_FILTERS, origin: null });
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const filterProps = {
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
    eventTypeIds, setEventTypeIds,
    onReset: handleReset,
    onSearch: handleSearch
  };

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          {/* Logo → opens nav drawer (does NOT navigate to Dashboard) */}
          <button
            onClick={() => setNavOpen(true)}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
            aria-label="Open navigation menu">
            
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">I</span>
            </div>
            <span className="font-semibold text-stone-800">Interactive</span>
          </button>
          {/* Page title (not a Dashboard link) — compass icon + Directory */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Compass className="w-6 h-6 text-indigo-600" />
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-stone-800">Directory</h1>
            </div>
            {!user && (
              <Link to="/login" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {isDemoMode && (
          <div className="mb-4 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
            <strong className="font-semibold">Demo Data</strong>
            <span className="text-amber-600">— local seed listings for UI testing. Not from Firebase.</span>
          </div>
        )}
        <div className="flex gap-6">
          {/* Results — majority width */}
          <div className="flex-1 min-w-0">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm text-stone-500 flex items-center gap-2 flex-wrap">
                <span>{loading ? 'Loading…' : `${results.length} result${results.length === 1 ? '' : 's'}`}</span>
                {appliedFilters.origin && appliedFilters.locationText && (
                  <span className="text-stone-400">within {appliedFilters.distance} miles of {appliedFilters.origin.label}</span>
                )}
              </div>
              <button
                onClick={() => setFiltersOpen(true)}
                className="lg:hidden inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-sm font-medium text-stone-700 hover:bg-stone-50 shrink-0"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filters
              </button>
            </div>
            {appliedFilters.sort === 'distance' && !appliedFilters.origin && !loading && !error &&
            <div className="mb-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                Enter a location and press Search to sort by distance.
              </div>
            }

            {loading &&
            <div className="flex flex-col items-center py-20">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
                <p className="text-sm text-stone-500">Loading directory…</p>
              </div>
            }

            {error && !loading &&
            <div className="flex flex-col items-center py-20">
                <AlertCircle className="w-10 h-10 text-stone-300 mb-3" />
                <p className="text-sm text-stone-500 mb-1">{error}</p>
                <button onClick={() => window.location.reload()} className="text-sm text-indigo-600 font-medium">
                  Try again
                </button>
              </div>
            }

            {!loading && !error && results.length === 0 &&
            <div className="flex flex-col items-center py-20">
                <SearchX className="w-10 h-10 text-stone-300 mb-3" />
                <p className="text-stone-600 font-medium mb-1">No results found</p>
                <p className="text-sm text-stone-500">Try adjusting your search or filters.</p>
              </div>
            }

            {!loading && !error && results.length > 0 &&
            <div className="space-y-4">
                {results.map((r) =>
              r._type === 'professional' ?
              <ProfessionalResultCard key={`p-${r.identity_id}`} profile={r} isDemo={isDemoMode} /> :
              r._type === 'event' ?
              <EventResultCard key={`e-${r.event_id}`} profile={r} isDemo={isDemoMode} /> :
              <BusinessResultCard key={`b-${r.business_id}`} profile={r} isDemo={isDemoMode} />
              )}
              </div>
            }
          </div>

          {/* Desktop filter drawer — right side, collapsible */}
          {drawerOpen ?
          <aside className="hidden lg:block w-80 shrink-0 relative">
              {/* Close chevron on drawer left edge */}
              <button
              onClick={() => setDrawerOpen(false)}
              className="absolute left-0 top-8 -translate-x-1/2 w-7 h-7 bg-white border border-stone-200 rounded-full flex items-center justify-center shadow-sm hover:bg-stone-50 hover:border-stone-300 z-10 transition-colors"
              aria-label="Collapse filter drawer">
              
                <ChevronRight className="w-4 h-4 text-stone-600" />
              </button>
              <div className="sticky top-24 bg-white border border-stone-200 rounded-xl p-5 max-h-[calc(100vh-8rem)] overflow-y-auto">
                <DirectoryFilters {...filterProps} />
              </div>
            </aside> :

          <button
            onClick={() => setDrawerOpen(true)}
            className="hidden lg:flex items-center gap-2 px-3 py-2.5 bg-white border border-stone-200 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-50 hover:border-stone-300 self-start sticky top-24 transition-colors"
            aria-label="Expand filter drawer">
            
              <ChevronLeft className="w-4 h-4" />
              Filters
            </button>
          }
        </div>
      </div>

      {/* Mobile filter drawer */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="left" className="w-[85%] sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <DirectoryFilters {...filterProps} />
        </SheetContent>
      </Sheet>

      {/* Navigation drawer (opened by logo click) */}
      <DirectoryNavDrawer open={navOpen} onOpenChange={setNavOpen} />
    </div>);

}