import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { MapPin, ArrowRight, ShieldCheck } from 'lucide-react';
import { formatDistance } from '@/lib/geo';
import { createConnectionRequest } from '@/services/connectionService';
import MatchBadge from './MatchBadge';
import ConnectionActions from './ConnectionActions';

// Horizontal image-led directory card for a Professional advert.
// Consumes the professionalDirectoryEntries advert projection —
// discovery-safe fields only. Click-through navigates to /p/:screenName,
// where resolveProfessionalAccess determines whether the viewer gets the
// full profile, the restricted advert, or denied.
//
// Card actions:
//   View Profile → /p/:screenName
//   Connect      → Relationship System (createConnectionRequest)
//   Ask About    → disabled placeholder (Messaging pass)
//
// connectionStatus: initial semantic status from the Directory's batch
// resolveConnectionStatuses fetch (Connect/Pending/Connected). After a
// local Connect action, the card updates its own status without
// re-fetching.
//
// When isDemo is true (dev ?demo=1 mode), the card renders visually
// identically but as a non-navigating <div> with a "Demo" badge and no
// action buttons — demo listings are local seed data, not real Firebase
// profiles.
export default function ProfessionalResultCard({ profile, isDemo, connectionStatus }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [localStatus, setLocalStatus] = useState(null);
  const [connecting, setConnecting] = useState(false);

  const services = profile.services || [];
  const visibleServices = services.slice(0, 4);
  const extraServices = services.length - visibleServices.length;
  const location = profile.service_area || profile.location;
  const category = profile.profession || profile.professional_category;
  const listingImage = profile.cover_url || profile.avatar_url;
  const verified = profile.verification_state === 'verified';

  const status = localStatus || connectionStatus || null;

  const handleConnect = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(`/directory`)}`);
      return;
    }
    if (!profile.identity_id) return;
    setConnecting(true);
    try {
      const result = await createConnectionRequest({ target_id: profile.identity_id });
      setLocalStatus(result.status === 'already_connected' ? 'connected' : 'pending_outgoing');
    } catch {
      setLocalStatus('none');
    } finally {
      setConnecting(false);
    }
  };

  const footerRight = isDemo ? (
    <span className="inline-flex items-center text-xs px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full font-medium">
      Demo
    </span>
  ) : (
    <Link
      to={`/p/${profile.screen_name}`}
      className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 group-hover:gap-2 transition-all"
    >
      View Profile
      <ArrowRight className="w-4 h-4" />
    </Link>
  );

  const cardBody = (
    <>
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
            {profile._distance != null && (
              <span className="text-xs text-indigo-600 font-medium shrink-0">· {formatDistance(profile._distance)}</span>
            )}
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

        <div className="mt-auto pt-2 flex items-center justify-between gap-2 flex-wrap">
          <MatchBadge matchScore={profile._matchScore} />
          <div className="flex items-center gap-2">
            {!isDemo && (
              <ConnectionActions
                status={status}
                onConnect={handleConnect}
                connecting={connecting}
              />
            )}
            {footerRight}
          </div>
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
      to={`/p/${profile.screen_name}`}
      className="group block bg-white rounded-xl border border-stone-200 overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all"
    >
      <div className="flex flex-col sm:flex-row">
        {cardBody}
      </div>
    </Link>
  );
}