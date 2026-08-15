import { ShieldCheck, MapPin, Mail, Phone, Pencil, Camera, Globe } from 'lucide-react';

/**
 * Shared professional profile layout — used by both the public profile
 * page (visitor) and the owner edit page. When `editable` is true, subtle
 * edit controls (pencils, camera buttons) are rendered and call the
 * provided handlers.
 */
function mediaStyle(pos) {
  const p = { x: 0.5, y: 0.5, zoom: 1, ...pos };
  return {
    objectFit: 'cover',
    transform: `scale(${p.zoom})`,
    transformOrigin: `${p.x * 100}% ${p.y * 100}%`,
  };
}

function EditPencil({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center justify-center w-6 h-6 -ml-1 text-stone-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
    >
      <Pencil className="w-3.5 h-3.5" />
    </button>
  );
}

function SectionHeader({ title, onEdit }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide">{title}</h2>
      {onEdit && <EditPencil onClick={onEdit} label={`Edit ${title.toLowerCase()}`} />}
    </div>
  );
}

export default function ProfessionalProfileView({
  profile,
  editable = false,
  onEditCover,
  onEditAvatar,
  onEditField,
  onEditServices,
  onEditContact,
  onOpenPrivateDetails,
  actions = null,
}) {
  const avatarPos = {
    x: profile.avatar_position_x,
    y: profile.avatar_position_y,
    zoom: profile.avatar_zoom,
  };
  const coverPos = {
    x: profile.cover_position_x,
    y: profile.cover_position_y,
    zoom: profile.cover_zoom,
  };

  return (
    <div>
      {/* Cover */}
      <div className="relative">
        <div className="w-full h-48 sm:h-64 md:h-80 bg-stone-200 overflow-hidden">
          {profile.cover_url ? (
            <img src={profile.cover_url} alt="" className="w-full h-full" style={mediaStyle(coverPos)} />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-indigo-700" />
          )}
        </div>
        {editable && (
          <button
            type="button"
            onClick={onEditCover}
            className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur text-stone-800 rounded-lg text-sm font-medium hover:bg-white shadow-sm"
          >
            <Camera className="w-3.5 h-3.5" /> {profile.cover_url ? 'Change cover' : 'Add cover'}
          </button>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        {/* Avatar + identity */}
        <div className="-mt-16 sm:-mt-20 flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="relative shrink-0">
            <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-full ring-4 ring-stone-50 bg-stone-200 overflow-hidden">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full" style={mediaStyle(avatarPos)} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl font-semibold text-stone-400">
                  {(profile.display_name || '?')[0].toUpperCase()}
                </div>
              )}
            </div>
            {editable && (
              <button
                type="button"
                onClick={onEditAvatar}
                className="absolute bottom-0 right-0 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center hover:bg-indigo-700 transition-colors border-2 border-white shadow-sm"
              >
                <Camera className="w-4 h-4 text-white" />
              </button>
            )}
          </div>

          <div className="flex-1 sm:pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900">
                {profile.display_name || (editable ? 'Your name' : 'Professional')}
              </h1>
              {profile.verification_state === 'verified' && <ShieldCheck className="w-6 h-6 text-indigo-600" />}
              {editable && <EditPencil onClick={() => onEditField('display_name')} label="Edit display name" />}
            </div>
            {profile.screen_name && <p className="text-stone-500">@{profile.screen_name}</p>}
            <div className="flex items-center gap-2">
              {profile.headline ? (
                <p className="text-stone-700 mt-1">{profile.headline}</p>
              ) : (
                editable && <span className="text-sm text-stone-400 mt-1">Add a headline</span>
              )}
              {editable && <EditPencil onClick={() => onEditField('headline')} label="Edit headline" />}
            </div>
            {(profile.location || profile.service_area) && (
              <p className="flex items-center gap-1.5 text-sm text-stone-500 mt-1">
                <MapPin className="w-4 h-4" />
                {profile.service_area || profile.location}
              </p>
            )}
          </div>

          {/* Action area */}
          {editable ? (
            <button
              type="button"
              onClick={onOpenPrivateDetails}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-stone-200 text-stone-800 rounded-lg text-sm font-medium hover:bg-stone-50 sm:pb-2"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit details
            </button>
          ) : (
            actions
          )}
        </div>

        {/* About */}
        <section className="mt-8">
          <SectionHeader title="About" onEdit={editable ? () => onEditField('bio') : null} />
          {profile.bio ? (
            <p className="text-stone-800 whitespace-pre-line leading-relaxed">{profile.bio}</p>
          ) : (
            editable && <p className="text-stone-400 text-sm">Tell visitors about your professional background…</p>
          )}
        </section>

        {/* Services */}
        <section className="mt-8">
          <SectionHeader title="Services" onEdit={editable ? onEditServices : null} />
          {profile.services?.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {profile.services.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-700"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> {s}
                </span>
              ))}
            </div>
          ) : (
            editable && <p className="text-stone-400 text-sm">Add the services you offer…</p>
          )}
        </section>

        {/* Contact & Location */}
        <section className="mt-8">
          <SectionHeader title="Contact & Location" onEdit={editable ? onEditContact : null} />
          <div className="space-y-2">
            {(profile.location || profile.service_area) && (
              <div className="flex items-center gap-3 bg-white rounded-xl border border-stone-200 p-4">
                <MapPin className="w-4 h-4 text-stone-400 shrink-0" />
                <span className="text-stone-800 text-sm">
                  {profile.service_area ? `${profile.service_area}${profile.location ? ' · ' + profile.location : ''}` : profile.location}
                </span>
              </div>
            )}
            {profile.website && (
              <div className="flex items-center gap-3 bg-white rounded-xl border border-stone-200 p-4">
                <Globe className="w-4 h-4 text-stone-400 shrink-0" />
                <a href={profile.website} target="_blank" rel="noreferrer" className="text-stone-800 text-sm hover:text-indigo-600">
                  {profile.website}
                </a>
              </div>
            )}
            {profile.contact_email && (
              <div className="flex items-center gap-3 bg-white rounded-xl border border-stone-200 p-4">
                <Mail className="w-4 h-4 text-stone-400 shrink-0" />
                <a href={`mailto:${profile.contact_email}`} className="text-stone-800 text-sm hover:text-indigo-600">
                  {profile.contact_email}
                </a>
              </div>
            )}
            {profile.contact_phone && (
              <div className="flex items-center gap-3 bg-white rounded-xl border border-stone-200 p-4">
                <Phone className="w-4 h-4 text-stone-400 shrink-0" />
                <span className="text-stone-800 text-sm">{profile.contact_phone}</span>
              </div>
            )}
            {!profile.location && !profile.service_area && !profile.contact_email && !profile.contact_phone && editable && (
              <p className="text-stone-400 text-sm">Add your contact details and location…</p>
            )}
          </div>
        </section>

        <div className="h-12" />
      </div>
    </div>
  );
}