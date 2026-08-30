import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import {
  getBusiness, updateBusiness, getBusinessProfile, saveBusinessProfile,
  getPublicBusinessProfile,
  getMembership, hasPermission,
} from '@/services/businessService';
import { getPublicProfessionalProfileByIdentity } from '@/services/profileService';
import { STANDARD_SERVICES } from '@/data/standardServices';
import { STANDARD_FACILITIES } from '@/data/standardFacilities';
import { STANDARD_EQUIPMENT } from '@/data/standardEquipment';
import { getMedia, getMediaUrl } from '@/lib/media';
import { createOrGetConversation } from '@/lib/messaging';
import { Loader2, MessageSquare, AlertCircle } from 'lucide-react';
import BusinessProfileView from '@/components/profile/BusinessProfileView';
import ProfileEditDialog from '@/components/profile/ProfileEditDialog';
import ImageEditDialog from '@/components/profile/ImageEditDialog';
import TaxonomySelectDialog from '@/components/profile/TaxonomySelectDialog';
import BusinessContactEditDialog from '@/components/profile/BusinessContactEditDialog';
import BusinessDetailsSheet from '@/components/profile/BusinessDetailsSheet';
import ProfessionalsEditDialog from '@/components/profile/ProfessionalsEditDialog';

const FIELD_CONFIG = {
  name: { label: 'Business name', multiline: false },
  description: { label: 'About', multiline: true },
};

function toPayload(p) {
  return {
    business_id: p.business_id,
    name: p.name,
    description: p.description,
    logo_url: p.logo_url,
    logo_media_id: p.logo_media_id,
    logo_position_x: p.logo_position_x,
    logo_position_y: p.logo_position_y,
    logo_zoom: p.logo_zoom,
    cover_media_id: p.cover_media_id,
    cover_url: p.cover_url,
    cover_position_x: p.cover_position_x,
    cover_position_y: p.cover_position_y,
    cover_zoom: p.cover_zoom,
    location: p.location,
    location_id: p.location_id,
    category: p.category,
    services: p.services,
    facilities: p.facilities,
    equipment: p.equipment,
    professionals: p.professionals,
    gallery_media_ids: p.gallery_media_ids,
    contact_email: p.contact_email,
    contact_phone: p.contact_phone,
    website: p.website,
    operating_hours: p.operating_hours,
    visibility: p.visibility,
  };
}

export default function BusinessProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [business, setBusiness] = useState(null);
  const [profile, setProfile] = useState(null);
  const [professionalsDisplay, setProfessionalsDisplay] = useState([]);
  const [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      const biz = await getBusiness(id);
      setBusiness(biz);
      let editable = false;
      try {
        const m = await getMembership(id, user.id);
        if (m && hasPermission(m, 'manage_business_profile')) {
          setMembership(m);
          editable = true;
        }
      } catch { /* non-member — public view */ }
      let bp = null;
      try {
        bp = await getBusinessProfile(id);
      } catch {
        // Non-member — Firestore rules deny private businessProfiles read
      }
      let p;
      if (bp) {
        p = bp;
        if (p.logo_media_id) {
          const a = await getMedia(p.logo_media_id);
          if (a) { const u = await getMediaUrl(a); if (u) p.logo_url = u; }
        }
        if (p.cover_media_id) {
          const a = await getMedia(p.cover_media_id);
          if (a) { const u = await getMediaUrl(a); if (u) p.cover_url = u; }
        }
      } else {
        // No private profile (non-member or doesn't exist) — try public projection
        const publicP = await getPublicBusinessProfile(id);
        if (publicP) {
          p = publicP;
        } else {
          p = {
            business_id: id,
            name: biz?.name || '',
            services: [],
            facilities: [],
            equipment: [],
            professionals: [],
            gallery_media_ids: [],
            visibility: 'public',
            lifecycle_state: 'active',
          };
        }
      }
      setProfile(p);
      // Resolve professional references to display info for the view.
      // Private profile stores [{ identity_id }]; public projection already
      // carries resolved display info. For the owner view, we resolve here.
      if (editable && Array.isArray(p.professionals)) {
        const refs = p.professionals.filter((pr) => pr?.identity_id);
        if (refs.length > 0) {
          const display = await Promise.all(
            refs.map(async (ref) => {
              try {
                const pub = await getPublicProfessionalProfileByIdentity(ref.identity_id);
                if (!pub) return null;
                return {
                  identity_id: ref.identity_id,
                  display_name: pub.display_name,
                  headline: pub.headline,
                  avatar_url: pub.avatar_url,
                  screen_name: pub.screen_name,
                };
              } catch { return null; }
            })
          );
          setProfessionalsDisplay(display.filter(Boolean));
        } else {
          setProfessionalsDisplay([]);
        }
      } else if (Array.isArray(p.professionals)) {
        // Public projection already has display info
        setProfessionalsDisplay(p.professionals);
      }
      setLoading(false);
    })();
  }, [user, id]);

  const editable = !!membership;

  const persist = async (partial) => {
    if (!editable) return;
    const next = { ...profile, ...partial };
    setProfile(next);
    setSaving(true);
    setError('');
    try {
      const saved = await saveBusinessProfile(id, toPayload(next));
      setProfile(saved);
      if (partial.name !== undefined && partial.name !== business.name) {
        await updateBusiness(id, { name: partial.name });
        setBusiness({ ...business, name: partial.name });
      }
    } catch (err) {
      setError(err.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    if (!user) return;
    setConnecting(true);
    try {
      const result = await createOrGetConversation(
        [user.id, business.owner_id],
        user.id,
        'personal',
        { businessId: id, conversationType: 'business' },
      );
      navigate(`/messages/${result.conversation.id}`);
    } catch (err) {
      setError(err.message || 'Could not start conversation');
    } finally {
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!business) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <AlertCircle className="w-10 h-10 text-stone-400 mb-3" />
        <h2 className="text-xl font-semibold text-stone-800 mb-1">Business not found</h2>
        <Link to="/dashboard" className="text-indigo-600 font-medium">Back to dashboard</Link>
      </div>
    );
  }

  const visitorActions = (
    <div className="flex gap-2">
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-stone-200 text-stone-800 rounded-lg text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
      >
        {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
        Connect
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50 relative">
      {editable && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4">
          <Link to={`/business/${id}`} className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700">
            ← {business.name} Dashboard
          </Link>
        </div>
      )}
      <BusinessProfileView
        profile={{ ...profile, professionals: professionalsDisplay }}
        business={business}
        editable={editable}
        ownerId={user?.id}
        onEditCover={() => setDialog('cover')}
        onEditLogo={() => setDialog('logo')}
        onEditName={() => setDialog('name')}
        onEditField={(f) => setDialog(f)}
        onEditServices={() => setDialog('services')}
        onEditFacilities={() => setDialog('facilities')}
        onEditEquipment={() => setDialog('equipment')}
        onEditContact={() => setDialog('contact')}
        onEditProfessionals={() => setDialog('professionals')}
        onOpenPrivateDetails={() => setDialog('private')}
        onSaveMedia={(mediaIds) => persist({ gallery_media_ids: mediaIds })}
        actions={visitorActions}
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
      {dialog === 'logo' && (
        <ImageEditDialog
          open
          kind="avatar"
          ownerId={user.id}
          sourceDomain="business"
          avatarShape="rounded"
          onClose={() => setDialog(null)}
          imageUrl={profile.logo_url}
          mediaId={profile.logo_media_id}
          position={{ x: profile.logo_position_x, y: profile.logo_position_y, zoom: profile.logo_zoom }}
          onSave={({ url, mediaId, position }) =>
            persist({
              logo_url: url,
              logo_media_id: mediaId,
              logo_position_x: position.x,
              logo_position_y: position.y,
              logo_zoom: position.zoom,
            })
          }
        />
      )}
      {dialog === 'cover' && (
        <ImageEditDialog
          open
          kind="cover"
          ownerId={user.id}
          sourceDomain="business"
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
        <TaxonomySelectDialog
          open
          onClose={() => setDialog(null)}
          title="Edit services"
          items={profile.services}
          standardOptions={STANDARD_SERVICES}
          placeholder="Add a custom service"
          onSave={(services) => persist({ services })}
        />
      )}
      {dialog === 'facilities' && (
        <TaxonomySelectDialog
          open
          onClose={() => setDialog(null)}
          title="Edit facilities"
          items={profile.facilities}
          standardOptions={STANDARD_FACILITIES}
          placeholder="Add a custom facility"
          onSave={(facilities) => persist({ facilities })}
        />
      )}
      {dialog === 'equipment' && (
        <TaxonomySelectDialog
          open
          onClose={() => setDialog(null)}
          title="Edit equipment"
          items={profile.equipment}
          standardOptions={STANDARD_EQUIPMENT}
          placeholder="Add a custom equipment item"
          onSave={(equipment) => persist({ equipment })}
        />
      )}
      {dialog === 'contact' && (
        <BusinessContactEditDialog
          open
          onClose={() => setDialog(null)}
          ownerId={id}
          profile={profile}
          onSave={(data) => persist(data)}
        />
      )}
      {dialog === 'professionals' && (
        <ProfessionalsEditDialog
          open
          onClose={() => setDialog(null)}
          businessId={id}
          professionals={profile.professionals}
          onSave={(professionals) => persist({ professionals })}
        />
      )}
      {dialog === 'private' && (
        <BusinessDetailsSheet
          open
          onClose={() => setDialog(null)}
          profile={profile}
          onSave={(data) => persist(data)}
        />
      )}
    </div>
  );
}