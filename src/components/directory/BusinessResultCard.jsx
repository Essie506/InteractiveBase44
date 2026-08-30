import { Link } from 'react-router-dom';
import { MapPin, ArrowRight, ShieldCheck, Check } from 'lucide-react';
import { formatDistance } from '@/lib/geo';
import MatchBadge from './MatchBadge';

// Horizontal image-led directory card for a Business public profile.
// Click-through navigates to the existing /b/:businessId route.
//
// When isDemo is true (dev ?demo=1 mode), the card renders visually
// identically but as a non-navigating <div> with a "Demo" badge
// instead of the "View Profile" link — demo listings are local seed
// data, not real Firebase profiles, so navigation would produce a
// misleading "Profile not found" page.
export default function BusinessResultCard({ profile, isDemo }) {
  const services = profile.services || [];
  const facilities = profile.facilities || [];
  const visibleServices = services.slice(0, 3);
  const visibleFacilities = facilities.slice(0, 4);
  const extraFacilities = facilities.length - visibleFacilities.length;
  const category = profile.category || profile.business_type;
  const listingImage = profile.cover_url || profile.logo_url;
  const verified = profile.verification_state === 'verified';

  const footerRight = isDemo ? (
    <span className="inline-flex items-center text-xs px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full font-medium">
      Demo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 group-hover:gap-2 transition-all">
      View Profile
      <ArrowRight className="w-4 h-4" />
    </span>
  );

  const cardBody = (
    <>
      {/* Image area */}
      <div className="relative sm:w-[35%] sm:max-w-[300px] h-48 sm:h-auto sm:min-h-[220px] shrink-0 bg-gradient-to-br from-indigo-50 to-stone-100">
        {listingImage ? (
          <img src={listingImage} alt={profile.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-5xl font-bold text-stone-300">
              {(profile.name || '?')[0].toUpperCase()}
            </span>
          </div>
        )}
        {verified && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 text-xs px-2 py-1 bg-emerald-500 text-white rounded-full font-medium shadow-sm">
            <ShieldCheck className="w-3 h-3" />
            Verified
          </span>
        )}
      </div>

      {/* Info area */}
      <div className="flex-1 p-5 flex flex-col">
        <div className="mb-1">
          <h3 className="text-lg font-semibold text-stone-800 truncate group-hover:text-indigo-600 transition-colors">
            {profile.name}
          </h3>
          {category && <p className="text-sm text-stone-500 truncate">{category}</p>}
        </div>

        {profile.location && (
          <div className="flex items-center gap-1 text-sm text-stone-500 mb-2">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{profile.location}</span>
            {profile._distance != null && (
              <span className="text-xs text-indigo-600 font-medium shrink-0">· {formatDistance(profile._distance)}</span>
            )}
          </div>
        )}

        {profile.description && (
          <p className="text-sm text-stone-600 line-clamp-2 mb-3">{profile.description}</p>
        )}

        {visibleFacilities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {visibleFacilities.map(f => (
              <span key={f.id || f.label} className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full">
                {f.label}
              </span>
            ))}
            {extraFacilities > 0 && (
              <span className="text-xs px-2 py-0.5 bg-stone-100 text-stone-500 rounded-full">
                +{extraFacilities}
              </span>
            )}
          </div>
        )}

        {visibleServices.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
            {visibleServices.map(s => (
              <span key={s.id || s.label} className="inline-flex items-center gap-1 text-xs text-stone-500">
                <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                {s.label}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto pt-2 flex items-center justify-between">
          <MatchBadge matchScore={profile._matchScore} />
          {footerRight}
        </div>
      </div>
    </>
  );

  if (isDemo) {
    return (
      <div className="group block bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="flex flex-col sm:flex-row">
          {cardBody}
        </div>
      </div>
    );
  }

  return (
    <Link
      to={`/b/${profile.business_id}`}
      className="group block bg-white rounded-xl border border-stone-200 overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all"
    >
      <div className="flex flex-col sm:flex-row">
        {cardBody}
      </div>
    </Link>
  );
}