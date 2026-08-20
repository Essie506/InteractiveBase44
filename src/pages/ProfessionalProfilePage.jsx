import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getProfessionalProfile, saveProfessionalProfile } from '@/services/profileService';
import { getMedia, getMediaUrl } from '@/lib/media';
import { Loader2 } from 'lucide-react';
import ProfessionalProfileView from '@/components/professional/ProfessionalProfileView';
import ProfileEditDialog from '@/components/profile/ProfileEditDialog';
import ImageEditDialog from '@/components/profile/ImageEditDialog';
import TagListEditDialog from '@/components/profile/TagListEditDialog';
import ContactLocationEditDialog from '@/components/professional/ContactLocationEditDialog';
import PrivateDetailsSheet from '@/components/professional/PrivateDetailsSheet';

const FIELD_CONFIG = {
  display_name: { label: 'Display name', multiline: false },
  headline: { label: 'Headline', multiline: false },
  bio: { label: 'About', multiline: true },
};

function toPayload(p) {
  return {
    legal_name: p.legal_name,
    business_name: p.business_name,
    display_name: p.display_name,
    screen_name: p.screen_name,
    headline: p.headline,
    bio: p.bio,
    profession: p.profession,
    professional_category: p.professional_category,
    services: p.services,
    service_area: p.service_area,
    service_area_location_id: p.service_area_location_id,
    location: p.location,
    location_id: p.location_id,
    website: p.website,
    contact_email: p.contact_email,
    contact_phone: p.contact_phone,
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

export default function ProfessionalProfilePage() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    if (!user) return;
    getProfessionalProfile(user.id).then(async (p) => {
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
          contact_email: user.email || '',
          services: [],
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
      const saved = await saveProfessionalProfile(user.id, toPayload(next));
      setProfile(saved);
      if (partial.display_name) await refreshUser();
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
      <ProfessionalProfileView
        profile={profile}
        editable
        onEditCover={() => setDialog('cover')}
        onEditAvatar={() => setDialog('avatar')}
        onEditField={(f) => setDialog(f)}
        onEditServices={() => setDialog('services')}
        onEditContact={() => setDialog('contact')}
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
          sourceDomain="professional"
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
          sourceDomain="professional"
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
      {dialog === 'services' && (
        <TagListEditDialog
          open
          onClose={() => setDialog(null)}
          title="Edit services"
          items={profile.services}
          placeholder="Add a service"
          onSave={(services) => persist({ services })}
        />
      )}
      {dialog === 'contact' && (
        <ContactLocationEditDialog
          open
          onClose={() => setDialog(null)}
          ownerId={user.id}
          profile={profile}
          onSave={(data) => persist(data)}
        />
      )}
      {dialog === 'private' && (
        <PrivateDetailsSheet
          open
          onClose={() => setDialog(null)}
          profile={profile}
          onSave={(data) => persist(data)}
        />
      )}
    </div>
  );
}