import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { loadDirectory, filterResults } from '@/services/discoveryService';
import { geocodeOrigin } from '@/lib/geo';
import { Loader2, SearchX, AlertCircle, Compass, SlidersHorizontal, ChevronRight, ChevronLeft } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import DirectoryFilters from '@/components/directory/DirectoryFilters';
import DirectoryNavDrawer from '@/components/directory/DirectoryNavDrawer';
import ProfessionalResultCard from '@/components/directory/ProfessionalResultCard';
import BusinessResultCard from '@/components/directory/BusinessResultCard';

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
  const [data, setData] = useState({ professionals: [], businesses: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [navOpen, setNavOpen] = useState(false);

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [serviceIds, setServiceIds] = useState([]);
  const [facilityIds, setFacilityIds] = useState([]);
  const [businessTypeIds, setBusinessTypeIds] = useState([]);
  const [equipmentIds, setEquipmentIds] = useState([]);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [locationText, setLocationText] = useState('');
  const [sort, setSort] = useState('recommended');
  const [distance, setDistance] = useState(10);
  const [origin, setOrigin] = useState(null);
  const [originStatus, setOriginStatus] = useState('idle');

  useEffect(() => {
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

  const results = useMemo(
    () => filterResults(data, {
      query,
      types: typeFilter === 'all' ? null : [typeFilter],
      serviceIds,
      facilityIds,
      businessTypeIds,
      equipmentIds,
      verifiedOnly,
      locationText: locationText || undefined,
      sort,
      origin,
      distance
    }),
    [data, query, typeFilter, serviceIds, facilityIds, businessTypeIds, equipmentIds, verifiedOnly, locationText, sort, origin, distance]
  );

  const handleReset = () => {
    setQuery('');
    setTypeFilter('all');
    setServiceIds([]);
    setFacilityIds([]);
    setBusinessTypeIds([]);
    setEquipmentIds([]);
    setVerifiedOnly(false);
    setLocationText('');
    setSort('recommended');
    setDistance(10);
  };

  const filterProps = {
    query, setQuery,
    typeFilter, setTypeFilter,
    serviceIds, setServiceIds,
    facilityIds, setFacilityIds,
    businessTypeIds, setBusinessTypeIds,
    equipmentIds, setEquipmentIds,
    verifiedOnly, setVerifiedOnly,
    locationText, setLocationText,
    sort, setSort,
    distance, setDistance,
    originStatus,
    onReset: handleReset
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
        <div className="flex gap-6">
          {/* Results — majority width */}
          <div className="flex-1 min-w-0">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm text-stone-500 flex items-center gap-2 flex-wrap">
                <span>{loading ? 'Loading…' : `${results.length} result${results.length === 1 ? '' : 's'}`}</span>
                {originStatus === 'resolving' && <span className="text-indigo-500">resolving location…</span>}
                {originStatus === 'resolved' && origin && <span className="text-stone-400">within {distance} miles of {origin.label}</span>}
                {originStatus === 'not_found' && locationText && <span className="text-amber-600">location not found</span>}
              </div>
              <button
                onClick={() => setFiltersOpen(true)}
                className="lg:hidden inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-sm font-medium text-stone-700 hover:bg-stone-50 shrink-0"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filters
              </button>
            </div>
            {sort === 'distance' && originStatus !== 'resolved' && !loading && !error &&
            <div className="mb-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                Enter a location to sort by distance.
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
              <ProfessionalResultCard key={`p-${r.identity_id}`} profile={r} /> :
              <BusinessResultCard key={`b-${r.business_id}`} profile={r} />
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