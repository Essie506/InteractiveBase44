import { Link } from 'react-router-dom';
import { MapPin, ArrowRight, ShieldCheck } from 'lucide-react';

// Horizontal image-led directory card for a Professional public profile.
// Click-through navigates to the existing /p/:screenName route.
// Displays only public discovery information from the
// professionalProfilesPublic projection.
//
// Listing image: cover_url → avatar_url → tasteful gradient fallback.
export default function ProfessionalResultCard({ profile }) {
  const href = `/p/${profile.screen_name}`;
  const services = profile.services || [];
  const visibleServices = services.slice(0, 4);
  const extraServices = services.length - visibleServices.length;
  const location = profile.service_area || profile.location;
  const category = profile.profession || profile.professional_category;
  const listingImage = profile.cover_url || profile.avatar_url;
  const verified = profile.verification_state === 'verified';

  return (
    <Link
      to={href}
      className="group block bg-white rounded-xl border border-stone-200 overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all"
    >
      <div className="flex flex-col sm:flex-row">
        {/* Image area */}
        <div className="relative sm:w-[35%] sm:max-w-[300px] h-48 sm:h-auto sm:min-h-[220px] shrink-0 bg-gradient-to-br from-indigo-50 to-stone-100">
          {listingImage ? (
            <img src={listingImage} alt={profile.display_name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-5xl font-bold text-stone-300">
                {(profile.display_name || '?')[0].toUpperCase()}
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
              {profile.display_name}
            </h3>
            {category && <p className="text-sm text-stone-500 truncate">{category}</p>}
          </div>

          {location && (
            <div className="flex items-center gap-1 text-sm text-stone-500 mb-2">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{location}</span>
            </div>
          )}

          {profile.headline && (
            <p className="text-sm text-stone-600 line-clamp-2 mb-3">{profile.headline}</p>
          )}

          {visibleServices.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {visibleServices.map(s => (
                <span key={s.id || s.label} className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full">
                  {s.label}
                </span>
              ))}
              {extraServices > 0 && (
                <span className="text-xs px-2 py-0.5 bg-stone-100 text-stone-500 rounded-full">
                  +{extraServices}
                </span>
              )}
            </div>
          )}

          <div className="mt-auto pt-2 flex items-center justify-end">
            <span className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 group-hover:gap-2 transition-all">
              View Profile
              <ArrowRight className="w-4 h-4" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}