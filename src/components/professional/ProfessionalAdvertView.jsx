import { MapPin, ShieldCheck, Mail, Phone, Globe, Clock } from 'lucide-react';
import ConnectionActions from '@/components/directory/ConnectionActions';

// Professional Advert / Business-Card View
// ───────────────────────────────────────────────────────────
// Renders the privacy-safe discovery advert for a listed Professional
// whose full profile is NOT publicly accessible (connections-only or
// private visibility). This is the "public advert" layer — it contains
// ONLY explicitly public/discovery-safe fields from the
// professionalDirectoryEntries projection.
//
// It does NOT expose: bio, gallery, legal_name, private account
// contact_email/contact_phone, away_message, or any connections-only
// / private profile content.
//
// Public contact (email/phone/website) is shown ONLY when the
// professional has explicitly enabled the corresponding *_visible flag
// (the advert projection already nulls disabled fields, so a present
// non-null value means it was explicitly enabled).
//
// Connect → Relationship System. Ask About → placeholder (disabled)
// until the typed Professional enquiry exists in the Messaging pass.
const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

function PublicHours({ hours }) {
  if (!Array.isArray(hours) || hours.length === 0) return null;
  return (
    <div className="flex items-start gap-2 text-sm text-stone-600">
      <Clock className="w-4 h-4 mt-0.5 shrink-0 text-stone-400" />
      <div className="flex flex-col gap-0.5">
        {hours.map((h, i) => (
          <span key={i}>
            <span className="font-medium text-stone-700">{DAY_LABELS[h.day] || h.day}:</span>{' '}
            {h.closed ? 'Closed' : `${h.open || '—'} – ${h.close || '—'}`}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ProfessionalAdvertView({ profile, connectionStatus, onConnect, connecting }) {
  const category = profile.profession || profile.professional_category;
  const location = profile.service_area || profile.location;
  const verified = profile.verification_state === 'verified';
  const services = Array.isArray(profile.services) ? profile.services : [];
  const specialisms = Array.isArray(profile.specialisms) ? profile.specialisms : [];

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Cover */}
      <div className="relative h-48 sm:h-64 bg-gradient-to-br from-indigo-100 to-stone-100">
        {profile.cover_url && (
          <img src={profile.cover_url} alt="" className="w-full h-full object-cover" />
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 -mt-16 pb-12">
        {/* Avatar + identity */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-6">
          <div className="w-28 h-28 rounded-full bg-white border-4 border-white shadow-lg overflow-hidden shrink-0">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-stone-300">
                {(profile.display_name || '?')[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-stone-800">{profile.display_name}</h1>
              {verified && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">
                  <ShieldCheck className="w-3 h-3" /> Verified
                </span>
              )}
            </div>
            {category && <p className="text-stone-500">{category}</p>}
          </div>
        </div>

        {/* Restricted-access notice */}
        <div className="mb-6 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-700">
          This Professional Profile is visible to Connections.
        </div>

        {/* Actions */}
        <div className="mb-8">
          <ConnectionActions
            status={connectionStatus}
            onConnect={onConnect}
            connecting={connecting}
          />
        </div>

        {/* Headline */}
        {profile.headline && (
          <p className="text-lg text-stone-700 mb-6">{profile.headline}
          </p>
        )}

        {/* Location */}
        {location && (
          <div className="flex items-center gap-2 text-sm text-stone-600 mb-6">
            <MapPin className="w-4 h-4 shrink-0 text-stone-400" />
            <span>{location}</span>
          </div>
        )}

        {/* Services */}
        {services.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-2">Services</h2>
            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <span key={s.id || s.label} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm">
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Specialisms */}
        {specialisms.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-2">Specialisms</h2>
            <div className="flex flex-wrap gap-2">
              {specialisms.map((s) => (
                <span key={s.id || s.label} className="px-2.5 py-1 bg-stone-100 text-stone-700 rounded-full text-sm">
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Public contact — only fields the professional explicitly enabled */}
        {(profile.website || profile.public_email || profile.public_phone) && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-2">Contact</h2>
            <div className="flex flex-col gap-2">
              {profile.website && (
                <a href={profile.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-indigo-600 hover:underline">
                  <Globe className="w-4 h-4" /> {profile.website}
                </a>
              )}
              {profile.public_email && (
                <a href={`mailto:${profile.public_email}`} className="flex items-center gap-2 text-sm text-indigo-600 hover:underline">
                  <Mail className="w-4 h-4" /> {profile.public_email}
                </a>
              )}
              {profile.public_phone && (
                <span className="flex items-center gap-2 text-sm text-stone-600">
                  <Phone className="w-4 h-4" /> {profile.public_phone}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Public / contact hours */}
        <PublicHours hours={profile.public_hours} />
      </div>
    </div>
  );
}