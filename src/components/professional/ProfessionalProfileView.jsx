import { MapPin, Mail, Phone, Globe, Pencil } from 'lucide-react';
import ProfileHeader from '@/components/profile/ProfileHeader';
import ProfileSection from '@/components/profile/ProfileSection';
import TagList from '@/components/profile/TagList';
import MediaGallerySection from '@/components/profile/MediaGallerySection';

/**
 * Shared Professional profile layout — used by both the public profile
 * page (visitor) and the owner edit page. When `editable` is true, subtle
 * edit controls (pencils, camera buttons) are rendered and call the
 * provided handlers.
 *
 * Refactored to reuse the shared ProfileHeader + ProfileSection + TagList
 * primitives. Professional-specific content (Services, Contact & Location
 * with service_area) remains here.
 */
function ContactRow({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-3 bg-white rounded-xl border border-stone-200 p-4">
      <Icon className="w-4 h-4 text-stone-400 shrink-0" />
      {children}
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
  onEditSpecialisms,
  onEditSessionTypes,
  onEditContact,
  onOpenPrivateDetails,
  onSaveMedia,
  ownerId,
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

  const hasContact = profile.location || profile.service_area || profile.website || profile.contact_email || profile.contact_phone;

  return (
    <div>
      <ProfileHeader
        coverUrl={profile.cover_url}
        coverPos={coverPos}
        avatarUrl={profile.avatar_url}
        avatarPos={avatarPos}
        avatarShape="circle"
        displayName={profile.display_name}
        screenName={profile.screen_name}
        headline={profile.headline}
        location={profile.service_area || profile.location}
        verificationState={profile.verification_state}
        editable={editable}
        onEditCover={onEditCover}
        onEditAvatar={onEditAvatar}
        onEditDisplayName={() => onEditField('display_name')}
        onEditHeadline={() => onEditField('headline')}
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
        <ProfileSection title="About" onEdit={editable ? () => onEditField('bio') : null}>
          {profile.bio ? (
            <p className="text-stone-800 whitespace-pre-line leading-relaxed">{profile.bio}</p>
          ) : (
            editable && <p className="text-stone-400 text-sm">Tell visitors about your professional background…</p>
          )}
        </ProfileSection>

        {/* Services */}
        <ProfileSection title="Services" onEdit={editable ? onEditServices : null}>
          {profile.services?.length > 0 ? (
            <TagList tags={profile.services} />
          ) : (
            editable && <p className="text-stone-400 text-sm">Add the services you offer…</p>
          )}
        </ProfileSection>

        {/* Specialisms */}
        <ProfileSection title="Specialisms" onEdit={editable ? onEditSpecialisms : null}>
          {profile.specialisms?.length > 0 ? (
            <TagList tags={profile.specialisms} />
          ) : (
            editable && <p className="text-stone-400 text-sm">Add your areas of expertise…</p>
          )}
        </ProfileSection>

        {/* Session Types */}
        <ProfileSection title="Session Types" onEdit={editable ? onEditSessionTypes : null}>
          {profile.session_types?.length > 0 ? (
            <TagList tags={profile.session_types} />
          ) : (
            editable && <p className="text-stone-400 text-sm">Add how you deliver sessions…</p>
          )}
        </ProfileSection>

        {/* Contact & Location */}
        <ProfileSection title="Contact & Location" onEdit={editable ? onEditContact : null}>
          {hasContact ? (
            <div className="space-y-2">
              {(profile.location || profile.service_area) && (
                <ContactRow icon={MapPin}>
                  <span className="text-stone-800 text-sm">
                    {profile.service_area ? `${profile.service_area}${profile.location ? ' · ' + profile.location : ''}` : profile.location}
                  </span>
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
            </div>
          ) : (
            editable && <p className="text-stone-400 text-sm">Add your contact details and location…</p>
          )}
        </ProfileSection>

        {/* Media */}
        {(profile.gallery_media_ids?.length > 0 || editable) && (
          <MediaGallerySection
            mediaIds={profile.gallery_media_ids || []}
            editable={editable}
            ownerId={ownerId}
            sourceDomain="professional"
            onSave={onSaveMedia}
          />
        )}

        <div className="h-12" />
      </div>
    </div>
  );
}