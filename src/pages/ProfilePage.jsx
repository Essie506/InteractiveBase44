import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getPersonalProfile, savePersonalProfile } from '@/services/profileService';
import { updateProfile } from '@/services/authService';
import { getMedia, getMediaUrl } from '@/lib/media';
import { Loader2 } from 'lucide-react';
import PersonalProfileView from '@/components/profile/PersonalProfileView';
import ProfileEditDialog from '@/components/profile/ProfileEditDialog';
import ImageEditDialog from '@/components/profile/ImageEditDialog';
import TagListEditDialog from '@/components/profile/TagListEditDialog';
import LocationEditDialog from '@/components/profile/LocationEditDialog';
import PersonalDetailsSheet from '@/components/profile/PersonalDetailsSheet';

const FIELD_CONFIG = {
  display_name: { label: 'Display name', multiline: false },
  headline: { label: 'Headline', multiline: false },
  bio: { label: 'About', multiline: true },
};

function toPayload(p) {
  return {
    display_name: p.display_name,
    screen_name: p.screen_name,
    headline: p.headline,
    bio: p.bio,
    interests: p.interests,
    location: p.location,
    location_id: p.location_id,
    avatar_url: p.avatar_url,
    avatar_media_id: p.avatar_media_id,
    avatar_position_x: p.avatar_position_x,
    avatar_position_y: p.avatar_position_y,
    avatar_zoom: p.avatar_zoom,
    cover_media_id: p.cover_media_id,
    cover_url: p.cover_url,
    cover_position_x: p.cover_position_x,
    cover_position_y: p.cover_position_y,
    cover_zoom: p.cover_zoom,
    visibility: p.visibility,
  };
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    if (!user) return;
    getPersonalProfile(user.id).then(async (p) => {
      if (p) {
        if (p.avatar_media_id) {
          const a = await getMedia(p.avatar_media_id);
          if (a) { const u = await getMediaUrl(a); if (u) p.avatar_url = u; }
        }
        if (p.cover_media_id) {
          const a = await getMedia(p.cover_media_id);
          if (a) { const u = await getMediaUrl(a); if (u) p.cover_url = u; }
        }
        setProfile(p);
      } else {
        setProfile({
          identity_id: user.id,
          display_name: user.display_name || '',
          interests: [],
          visibility: 'public',
        });
      }
      setLoading(false);
    });
  }, [user]);

  const persist = async (partial) => {
    const next = { ...profile, ...partial };
    setProfile(next);
    setSaving(true);
    setError('');
    try {
      const saved = await savePersonalProfile(user.id, toPayload(next));
      setProfile(saved);
      if (partial.display_name !== undefined || partial.avatar_url !== undefined) {
        await updateProfile({ display_name: next.display_name, avatar_url: next.avatar_url });
        await refreshUser();
      }
    } catch (err) {
      setError(err.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 relative">
      <PersonalProfileView
        profile={profile}
        editable
        onEditCover={() => setDialog('cover')}
        onEditAvatar={() => setDialog('avatar')}
        onEditField={(f) => setDialog(f)}
        onEditInterests={() => setDialog('interests')}
        onEditLocation={() => setDialog('location')}
        onOpenPrivateDetails={() => setDialog('private')}
      />

      {saving && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-full text-sm shadow-lg z-50">
          <Loader2 className="w-4 h-4 animate-spin" /> Saving…
        </div>
      )}
      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-600 text-white rounded-full text-sm shadow-lg z-50">
          {error}
        </div>
      )}

      {dialog && FIELD_CONFIG[dialog] && (
        <ProfileEditDialog
          open
          onClose={() => setDialog(null)}
          field={dialog}
          label={FIELD_CONFIG[dialog].label}
          value={profile[dialog]}
          multiline={FIELD_CONFIG[dialog].multiline}
          onSave={(field, val) => persist({ [field]: val })}
        />
      )}
      {dialog === 'avatar' && (
        <ImageEditDialog
          open
          kind="avatar"
          ownerId={user.id}
          sourceDomain="personal"
          onClose={() => setDialog(null)}
          imageUrl={profile.avatar_url}
          mediaId={profile.avatar_media_id}
          position={{ x: profile.avatar_position_x, y: profile.avatar_position_y, zoom: profile.avatar_zoom }}
          onSave={({ url, mediaId, position }) =>
            persist({
              avatar_url: url,
              avatar_media_id: mediaId,
              avatar_position_x: position.x,
              avatar_position_y: position.y,
              avatar_zoom: position.zoom,
            })
          }
        />
      )}
      {dialog === 'cover' && (
        <ImageEditDialog
          open
          kind="cover"
          ownerId={user.id}
          sourceDomain="personal"
          onClose={() => setDialog(null)}
          imageUrl={profile.cover_url}
          mediaId={profile.cover_media_id}
          position={{ x: profile.cover_position_x, y: profile.cover_position_y, zoom: profile.cover_zoom }}
          onSave={({ url, mediaId, position }) =>
            persist({
              cover_url: url,
              cover_media_id: mediaId,
              cover_position_x: position.x,
              cover_position_y: position.y,
              cover_zoom: position.zoom,
            })
          }
        />
      )}
      {dialog === 'interests' && (
        <TagListEditDialog
          open
          onClose={() => setDialog(null)}
          title="Edit interests"
          items={profile.interests}
          placeholder="Add an interest"
          onSave={(interests) => persist({ interests })}
        />
      )}
      {dialog === 'location' && (
        <LocationEditDialog
          open
          onClose={() => setDialog(null)}
          ownerId={user.id}
          ownerType="identity"
          context="profile"
          initialLocationId={profile.location_id}
          initialLabel={profile.location}
          onSave={(data) => persist(data)}
        />
      )}
      {dialog === 'private' && (
        <PersonalDetailsSheet
          open
          onClose={() => setDialog(null)}
          profile={profile}
          onSave={(data) => persist(data)}
        />
      )}
    </div>
  );
}