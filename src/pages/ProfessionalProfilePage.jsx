import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getProfessionalProfile, saveProfessionalProfile } from '@/services/profileService';
import { updateProfile } from '@/services/authService';
import { getMedia, getMediaUrl } from '@/lib/media';
import { Loader2, Camera, Save, Check, ShieldCheck, Plus, X } from 'lucide-react';
import MediaUploadButton from '@/components/MediaUploadButton';
import LocationPicker from '@/components/LocationPicker';
import TrustBadge from '@/components/TrustBadge';
import { getVerificationRequest } from '@/lib/trust';

export default function ProfessionalProfilePage() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [category, setCategory] = useState('');
  const [services, setServices] = useState([]);
  const [serviceInput, setServiceInput] = useState('');
  const [location, setLocation] = useState('');
  const [locationId, setLocationId] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [serviceAreaLocationId, setServiceAreaLocationId] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarMediaId, setAvatarMediaId] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [verificationRequest, setVerificationRequest] = useState(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getProfessionalProfile(user.id),
      getVerificationRequest('professional', user.id),
    ]).then(async ([p, req]) => {
      if (p) {
        setProfile(p);
        setDisplayName(p.display_name || '');
        setHeadline(p.headline || '');
        setBio(p.bio || '');
        setCategory(p.professional_category || p.profession || '');
        setServices(p.services || []);
        setLocation(p.location || '');
        setLocationId(p.location_id || '');
        setServiceArea(p.service_area || '');
        setServiceAreaLocationId(p.service_area_location_id || '');
        setContactEmail(p.contact_email || '');
        setContactPhone(p.contact_phone || '');
        setAvatarUrl(p.avatar_url || '');
        setAvatarMediaId(p.avatar_media_id || '');
        setVisibility(p.visibility || 'public');
        // Resolve avatar URL from MediaAsset via canonical getMediaUrl path
        if (p.avatar_media_id) {
          const asset = await getMedia(p.avatar_media_id);
          if (asset) {
            const resolvedUrl = await getMediaUrl(asset);
            if (resolvedUrl) setAvatarUrl(resolvedUrl);
          }
        }
      } else {
        setDisplayName(user.display_name || '');
        setContactEmail(user.email || '');
      }
      setVerificationRequest(req);
      setLoading(false);
    });
  }, [user]);

  const addService = () => {
    const s = serviceInput.trim();
    if (s && !services.includes(s)) {
      setServices([...services, s]);
      setServiceInput('');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const data = {
        display_name: displayName,
        headline,
        bio,
        profession: category,
        professional_category: category,
        services,
        service_area: serviceArea,
        service_area_location_id: serviceAreaLocationId,
        location,
        location_id: locationId,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        avatar_url: avatarUrl,
        avatar_media_id: avatarMediaId,
        visibility,
      };
      if (profile) {
        const updated = await saveProfessionalProfile(user.id, data);
        setProfile(updated);
      } else {
        const created = await saveProfessionalProfile(user.id, { ...data, lifecycle_state: 'active', onboarding_status: 'active' });
        setProfile(created);
      }
      await updateProfile({ display_name: displayName, avatar_url: avatarUrl });
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
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

  const inputClass = "w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400";

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1">Professional Profile</h1>
        <p className="text-stone-500">Your professional identity across Interactive</p>
      </div>

      {/* Trust & Reputation — verification status */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-stone-500" />
            <div>
              <div className="text-sm font-medium text-stone-700">Verification Status</div>
              <div className="mt-1"><TrustBadge targetType="professional" targetId={user?.id} /></div>
            </div>
          </div>
          {(!verificationRequest || verificationRequest.decision !== 'pending') && verificationRequest?.decision !== 'approved' && (
            <a href="/verify-professional" className="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">
              {verificationRequest?.decision === 'approved' ? 'Verified' : 'Get Verified'}
            </a>
          )}
          {verificationRequest?.decision === 'pending' && (
            <span className="text-xs text-amber-600 font-medium">Under review</span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-6 md:p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-stone-200 overflow-hidden flex items-center justify-center">
              {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl font-semibold text-stone-400">{(displayName || '?')[0].toUpperCase()}</span>}
            </div>
            <MediaUploadButton
              ownerId={user.id}
              sourceDomain="professional"
              visibility="public"
              onUploaded={(asset) => { setAvatarUrl(asset.file_url); setAvatarMediaId(asset.id); }}
              className="absolute bottom-0 right-0 w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center hover:bg-indigo-700 transition-colors border-2 border-white"
            >
              <Camera className="w-3.5 h-3.5 text-white" />
            </MediaUploadButton>
          </div>
          <div>
            <h2 className="font-semibold text-stone-800">{displayName || 'Your name'}</h2>
            <p className="text-sm text-stone-500">{user?.email}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Display Name</label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Headline</label>
            <input type="text" value={headline} onChange={e => setHeadline(e.target.value)} placeholder="e.g. Certified Personal Trainer" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Professional Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className={inputClass}>
              <option value="">Select a category</option>
              <option value="Personal Trainer">Personal Trainer</option>
              <option value="Coach">Coach</option>
              <option value="Instructor">Instructor</option>
              <option value="Therapist">Therapist</option>
              <option value="Practitioner">Practitioner</option>
              <option value="Creator">Creator</option>
              <option value="Freelancer">Freelancer</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Bio</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="Describe your professional background" className={inputClass + " resize-none"} />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Services / Specialisms</label>
            <div className="flex gap-2 mb-2">
              <input type="text" value={serviceInput} onChange={e => setServiceInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addService())} placeholder="Add a service" className={inputClass} />
              <button onClick={addService} className="px-3 py-2.5 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 transition-colors"><Plus className="w-4 h-4" /></button>
            </div>
            <div className="flex flex-wrap gap-2">
              {services.map(s => (
                <span key={s} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm">
                  {s}
                  <button onClick={() => setServices(services.filter(x => x !== s))}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Location</label>
            <LocationPicker
              ownerId={user.id}
              ownerType="professional"
              context="professional_service"
              initialLocationId={locationId}
              initialLabel={location}
              onLocationSaved={(id, label) => { setLocationId(id); setLocation(label); }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Contact Email</label>
              <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Contact Phone</label>
              <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Profile Visibility</label>
            <select value={visibility} onChange={e => setVisibility(e.target.value)} className={inputClass}>
              <option value="public">Public — visible to everyone</option>
              <option value="connections">Connections — visible to your connections</option>
              <option value="private">Private — visible only to you</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button onClick={handleSave} disabled={saving || !displayName.trim()} className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}