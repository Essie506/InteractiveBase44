import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { loadDirectory, filterResults } from '@/services/discoveryService';
import { Loader2, SearchX, AlertCircle, Compass } from 'lucide-react';
import DirectoryFilters from '@/components/directory/DirectoryFilters';
import ProfessionalResultCard from '@/components/directory/ProfessionalResultCard';
import BusinessResultCard from '@/components/directory/BusinessResultCard';

// Directory + Search page.
// Public route — usable by signed-out visitors. Reads only from
// the public profile projections (professionalProfilesPublic,
// businessProfilesPublic) which are public-read and contain only
// public-safe fields. No private collections are accessed.
export default function Directory() {
  const { user } = useAuth();
  const [data, setData] = useState({ professionals: [], businesses: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [serviceId, setServiceId] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [locationText, setLocationText] = useState('');

  useEffect(() => {
    loadDirectory()
      .then(setData)
      .catch(err => setError(err.message || 'Could not load directory'))
      .finally(() => setLoading(false));
  }, []);

  const results = useMemo(
    () => filterResults(data, {
      query,
      types: typeFilter === 'all' ? null : [typeFilter],
      serviceId: serviceId || undefined,
      facilityId: facilityId || undefined,
      verifiedOnly,
      locationText: locationText || undefined,
    }),
    [data, query, typeFilter, serviceId, facilityId, verifiedOnly, locationText],
  );

  const hasFilters = query || serviceId || facilityId || verifiedOnly || locationText || typeFilter !== 'all';

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to={user ? '/dashboard' : '/'} className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">I</span>
            </div>
            <span className="font-semibold text-stone-800">Interactive</span>
          </Link>
          {user ? (
            <Link to="/dashboard" className="text-sm text-stone-600 hover:text-stone-800 font-medium">
              Dashboard
            </Link>
          ) : (
            <Link to="/login" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              Sign In
            </Link>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Title */}
        <div className="flex items-center gap-2 mb-5">
          <Compass className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold tracking-tight text-stone-800">Directory</h1>
        </div>

        {/* Filters */}
        <DirectoryFilters
          query={query} setQuery={setQuery}
          typeFilter={typeFilter} setTypeFilter={setTypeFilter}
          serviceId={serviceId} setServiceId={setServiceId}
          facilityId={facilityId} setFacilityId={setFacilityId}
          verifiedOnly={verifiedOnly} setVerifiedOnly={setVerifiedOnly}
          locationText={locationText} setLocationText={setLocationText}
        />

        {/* Results count */}
        <div className="mt-5 mb-3 text-sm text-stone-500">
          {loading ? 'Loading…' : `${results.length} result${results.length === 1 ? '' : 's'}`}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center py-20">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
            <p className="text-sm text-stone-500">Loading directory…</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex flex-col items-center py-20">
            <AlertCircle className="w-10 h-10 text-stone-300 mb-3" />
            <p className="text-sm text-stone-500 mb-1">{error}</p>
            <button onClick={() => window.location.reload()} className="text-sm text-indigo-600 font-medium">
              Try again
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && results.length === 0 && (
          <div className="flex flex-col items-center py-20">
            <SearchX className="w-10 h-10 text-stone-300 mb-3" />
            <p className="text-stone-600 font-medium mb-1">No results found</p>
            <p className="text-sm text-stone-500">
              {hasFilters ? 'Try adjusting your search or filters.' : 'No public profiles available yet.'}
            </p>
          </div>
        )}

        {/* Results grid */}
        {!loading && !error && results.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map(r => (
              r._type === 'professional'
                ? <ProfessionalResultCard key={`p-${r.identity_id}`} profile={r} />
                : <BusinessResultCard key={`b-${r.business_id}`} profile={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}