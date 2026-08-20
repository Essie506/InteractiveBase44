import { MapPin, Pencil } from 'lucide-react';
import ProfileHeader from './ProfileHeader';
import ProfileSection from './ProfileSection';
import TagList from './TagList';

/**
 * Shared Personal profile view — used by the owner edit page.
 * Uses the same Interactive profile design language as Professional,
 * with personal-specific content (About, Interests, Location).
 *
 * No public visitor route exists yet (no public projection architecture
 * for personal profiles); the layout is structured so one can be added
 * by passing editable={false} and an actions prop when that system arrives.
 */
export default function PersonalProfileView({
  profile,
  editable = false,
  onEditCover,
  onEditAvatar,
  onEditField,
  onEditInterests,
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
      <ProfileHeader
        coverUrl={profile.cover_url}
        coverPos={coverPos}
        avatarUrl={profile.avatar_url}
        avatarPos={avatarPos}
        avatarShape="circle"
        displayName={profile.display_name}
        screenName={profile.screen_name}
        headline={profile.headline}
        location={profile.location}
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
            editable && <p className="text-stone-400 text-sm">Tell visitors about yourself…</p>
          )}
        </ProfileSection>

        {/* Interests */}
        <ProfileSection title="Interests" onEdit={editable ? onEditInterests : null}>
          {profile.interests?.length > 0 ? (
            <TagList tags={profile.interests} />
          ) : (
            editable && <p className="text-stone-400 text-sm">Add your interests…</p>
          )}
        </ProfileSection>

        {/* Location */}
        {profile.location && (
          <ProfileSection title="Location">
            <div className="flex items-center gap-3 bg-white rounded-xl border border-stone-200 p-4">
              <MapPin className="w-4 h-4 text-stone-400 shrink-0" />
              <span className="text-stone-800 text-sm">{profile.location}</span>
            </div>
          </ProfileSection>
        )}

        <div className="h-12" />
      </div>
    </div>
  );
}