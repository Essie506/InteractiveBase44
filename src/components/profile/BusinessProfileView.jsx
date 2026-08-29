import { MapPin, Mail, Phone, Globe, Clock, Pencil } from 'lucide-react';
import ProfileHeader from './ProfileHeader';
import ProfileSection from './ProfileSection';
import TagList from './TagList';
import MediaGallerySection from './MediaGallerySection';
import { mediaStyle } from './mediaStyle';

/**
 * Shared Business profile view — used by both the public business profile
 * page (visitor) and the admin edit page. When `editable` is true, subtle
 * edit controls are rendered and call the provided handlers.
 *
 * Adapts the shared Interactive profile language for a business:
 *  - Rounded logo (avatarShape='rounded') instead of circular avatar
 *  - Category subtitle instead of @screen_name
 *  - Business-specific sections: Services, Professionals, Hours
 */
function ContactRow({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-3 bg-white rounded-xl border border-stone-200 p-4">
      <Icon className="w-4 h-4 text-stone-400 shrink-0" />
      {children}
    </div>
  );
}

function ProfessionalCard({ p }) {
  const initial = (p.display_name || '?')[0].toUpperCase();
  return (
    <div className="flex items-center gap-3 bg-white rounded-xl border border-stone-200 p-4">
      <div className="w-12 h-12 rounded-full bg-stone-200 overflow-hidden shrink-0">
        {p.avatar_url ? (
          <img src={p.avatar_url} alt={p.display_name} className="w-full h-full" style={mediaStyle({})} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lg font-semibold text-stone-400">{initial}</div>
        )}
      </div>
      <div className="min-w-0">
        {p.screen_name ? (
          <a href={`/p/${p.screen_name}`} className="font-medium text-stone-800 hover:text-indigo-600 block truncate">
            {p.display_name}
          </a>
        ) : (
          <div className="font-medium text-stone-800 truncate">{p.display_name}</div>
        )}
        {p.headline && <p className="text-sm text-stone-500 truncate">{p.headline}</p>}
      </div>
    </div>
  );
}

export default function BusinessProfileView({
  profile,
  business,
  editable = false,
  onEditCover,
  onEditLogo,
  onEditName,
  onEditField,
  onEditServices,
  onEditFacilities,
  onEditContact,
  onEditProfessionals,
  onOpenPrivateDetails,
  onSaveMedia,
  ownerId,
  actions = null,
}) {
  const logoPos = {
    x: profile.logo_position_x,
    y: profile.logo_position_y,
    zoom: profile.logo_zoom,
  };
  const coverPos = {
    x: profile.cover_position_x,
    y: profile.cover_position_y,
    zoom: profile.cover_zoom,
  };

  const hasContact = profile.location || profile.website || profile.contact_email || profile.contact_phone || profile.operating_hours;

  return (
    <div>
      <ProfileHeader
        coverUrl={profile.cover_url}
        coverPos={coverPos}
        avatarUrl={profile.logo_url}
        avatarPos={logoPos}
        avatarShape="rounded"
        displayName={profile.name}
        subtitle={profile.category || business?.type}
        location={profile.location}
        verificationState={business?.verification_state}
        editable={editable}
        onEditCover={onEditCover}
        onEditAvatar={onEditLogo}
        onEditDisplayName={onEditName}
        actions={editable ? (
          <button
            type="button"
            onClick={onOpenPrivateDetails}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-stone-200 text-stone-800 rounded-lg text-sm font-medium hover:bg-stone-50"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit details
          </button>
        ) : actions}
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        {/* About */}
        <ProfileSection title="About" onEdit={editable ? () => onEditField('description') : null}>
          {profile.description ? (
            <p className="text-stone-800 whitespace-pre-line leading-relaxed">{profile.description}</p>
          ) : (
            editable && <p className="text-stone-400 text-sm">Tell visitors about your business…</p>
          )}
        </ProfileSection>

        {/* Services */}
        <ProfileSection title="Services" onEdit={editable ? onEditServices : null}>
          {profile.services?.length > 0 ? (
            <TagList tags={profile.services} />
          ) : (
            editable && <p className="text-stone-400 text-sm">Add the services your business offers…</p>
          )}
        </ProfileSection>

        {/* Facilities */}
        {(profile.facilities?.length > 0 || editable) && (
          <ProfileSection title="Facilities" onEdit={editable ? onEditFacilities : null}>
            {profile.facilities?.length > 0 ? (
              <TagList tags={profile.facilities} />
            ) : (
              editable && <p className="text-stone-400 text-sm">Add the facilities your business offers…</p>
            )}
          </ProfileSection>
        )}

        {/* Professionals */}
        {profile.professionals?.length > 0 && (
          <ProfileSection title="Professionals" onEdit={editable ? onEditProfessionals : null}>
            <div className="grid sm:grid-cols-2 gap-3">
              {profile.professionals.map((p, i) => (
                <ProfessionalCard key={i} p={p} />
              ))}
            </div>
          </ProfileSection>
        )}
        {editable && profile.professionals?.length === 0 && (
          <ProfileSection title="Professionals" onEdit={onEditProfessionals}>
            <p className="text-stone-400 text-sm">Add professionals to showcase your team…</p>
          </ProfileSection>
        )}

        {/* Location & Contact */}
        <ProfileSection title="Location & Contact" onEdit={editable ? onEditContact : null}>
          {hasContact ? (
            <div className="space-y-2">
              {profile.location && (
                <ContactRow icon={MapPin}>
                  <span className="text-stone-800 text-sm">{profile.location}</span>
                </ContactRow>
              )}
              {profile.website && (
                <ContactRow icon={Globe}>
                  <a href={profile.website} target="_blank" rel="noreferrer" className="text-stone-800 text-sm hover:text-indigo-600">
                    {profile.website}
                  </a>
                </ContactRow>
              )}
              {profile.contact_email && (
                <ContactRow icon={Mail}>
                  <a href={`mailto:${profile.contact_email}`} className="text-stone-800 text-sm hover:text-indigo-600">
                    {profile.contact_email}
                  </a>
                </ContactRow>
              )}
              {profile.contact_phone && (
                <ContactRow icon={Phone}>
                  <span className="text-stone-800 text-sm">{profile.contact_phone}</span>
                </ContactRow>
              )}
              {profile.operating_hours && (
                <ContactRow icon={Clock}>
                  <span className="text-stone-800 text-sm">{profile.operating_hours}</span>
                </ContactRow>
              )}
            </div>
          ) : (
            editable && <p className="text-stone-400 text-sm">Add your location and contact details…</p>
          )}
        </ProfileSection>

        {/* Media */}
        {(profile.gallery_media_ids?.length > 0 || editable) && (
          <MediaGallerySection
            mediaIds={profile.gallery_media_ids || []}
            editable={editable}
            ownerId={ownerId}
            sourceDomain="business"
            onSave={onSaveMedia}
          />
        )}

        <div className="h-12" />
      </div>
    </div>
  );
}