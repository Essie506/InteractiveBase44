import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import VerificationPill from './VerificationPill';

// Directory result card for a Business public profile.
// Click-through navigates to the existing /b/:businessId route.
// Displays only public discovery information from the
// businessProfilesPublic projection.
export default function BusinessResultCard({ profile }) {
  const href = `/b/${profile.business_id}`;
  const services = (profile.services || []).slice(0, 3);
  const facilities = (profile.facilities || []).slice(0, 2);
  const category = profile.category || profile.business_type;

  return (
    <Link
      to={href}
      className="group block bg-white rounded-xl border border-stone-200 overflow-hidden hover:border-indigo-300 hover:shadow-sm transition-all"
    >
      <div className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-12 h-12 rounded-lg bg-stone-100 overflow-hidden shrink-0 flex items-center justify-center">
            {profile.logo_url ? (
              <img src={profile.logo_url} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-stone-400 font-bold text-lg">{(profile.name || '?')[0].toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-stone-800 truncate group-hover:text-indigo-600 transition-colors">
              {profile.name}
            </h3>
            {category && <p className="text-sm text-stone-500 truncate">{category}</p>}
          </div>
        </div>

        {profile.description && (
          <p className="text-sm text-stone-600 line-clamp-2 mb-3">{profile.description}</p>
        )}

        {services.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {services.map(s => (
              <span key={s.id || s.label} className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full">
                {s.label}
              </span>
            ))}
          </div>
        )}
        {facilities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {facilities.map(f => (
              <span key={f.id || f.label} className="text-xs px-2 py-0.5 bg-stone-100 text-stone-600 rounded-full">
                {f.label}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {profile.location ? (
            <span className="inline-flex items-center gap-1 text-xs text-stone-500 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              {profile.location}
            </span>
          ) : <span />}
          <VerificationPill verificationState={profile.verification_state} />
        </div>
      </div>
    </Link>
  );
}