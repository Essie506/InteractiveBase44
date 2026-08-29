import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import VerificationPill from './VerificationPill';

// Directory result card for a Professional public profile.
// Click-through navigates to the existing /p/:screenName route.
// Displays only public discovery information from the
// professionalProfilesPublic projection.
export default function ProfessionalResultCard({ profile }) {
  const href = `/p/${profile.screen_name}`;
  const services = (profile.services || []).slice(0, 3);
  const location = profile.service_area || profile.location;
  const title = profile.profession || profile.professional_category;

  return (
    <Link
      to={href}
      className="group block bg-white rounded-xl border border-stone-200 overflow-hidden hover:border-indigo-300 hover:shadow-sm transition-all"
    >
      <div className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-stone-100 overflow-hidden shrink-0">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-stone-400 font-medium">
                {(profile.display_name || '?')[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-stone-800 truncate group-hover:text-indigo-600 transition-colors">
              {profile.display_name}
            </h3>
            {title && <p className="text-sm text-stone-500 truncate">{title}</p>}
          </div>
        </div>

        {profile.headline && (
          <p className="text-sm text-stone-600 line-clamp-2 mb-3">{profile.headline}</p>
        )}

        {services.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {services.map(s => (
              <span key={s.id || s.label} className="text-xs px-2 py-0.5 bg-stone-100 text-stone-600 rounded-full">
                {s.label}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {location ? (
            <span className="inline-flex items-center gap-1 text-xs text-stone-500 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              {location}
            </span>
          ) : <span />}
          <VerificationPill verificationState={profile.verification_state} />
        </div>
      </div>
    </Link>
  );
}