import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getProfessionalProfile, saveProfessionalProfile, validateScreenName } from '@/services/profileService';
import { updateProfile } from '@/services/authService';
import { getMedia, getMediaUrl } from '@/lib/media';
import { Loader2, Camera, Save, Check, ShieldCheck, Plus, X, ImageIcon, AlertCircle } from 'lucide-react';
import MediaUploadButton from '@/components/MediaUploadButton';
import ImagePositioner from '@/components/ImagePositioner';
import LocationPicker from '@/components/LocationPicker';
import TrustBadge from '@/components/TrustBadge';
import { getVerificationRequest } from '@/lib/trust';

export default function ProfessionalProfilePage() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [legalName, setLegalName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [screenName, setScreenName] = useState('');
  const [screenNameStatus, setScreenNameStatus] = useState(null); // { available, reason? } | null
  const [screenNameChecking, setScreenNameChecking] = useState(false);
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
  const [avatarPos, setAvatarPos] = useState({ x: 0.5, y: 0.5, zoom: 1 });
  const [coverUrl, setCoverUrl] = useState('');
  const [coverMediaId, setCoverMediaId] = useState('');
  const [coverPos, setCoverPos] = useState({ x: 0.5, y: 0.5, zoom: 1 });
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
        setLegalName(p.legal_name || '');
        setBusinessName(p.business_name || '');
        setDisplayName(p.display_name || '');
        setScreenName(p.screen_name || '');
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
        setAvatarPos({ x: p.avatar_position_x ?? 0.5, y: p.avatar_position_y ?? 0.5, zoom: p.avatar_zoom ?? 1 });
        setCoverUrl(p.cover_url || '');
        setCoverMediaId(p.cover_media_id || '');
        setCoverPos({ x: p.cover_position_x ?? 0.5, y: p.cover_position_y ?? 0.5, zoom: p.cover_zoom ?? 1 });
        setVisibility(p.visibility || 'public');
        if (p.avatar_media_id) {
          const asset = await getMedia(p.avatar_media_id);
          if (asset) {
            const resolvedUrl = await getMediaUrl(asset);
            if (resolvedUrl) setAvatarUrl(resolvedUrl);
          }
        }
        if (p.cover_media_id) {
          const asset = await getMedia(p.cover_media_id);
          if (asset) {
            const resolvedUrl = await getMediaUrl(asset);
            if (resolvedUrl) setCoverUrl(resolvedUrl);
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

  const checkScreenName = async (value) => {
    const trimmed = value.toLowerCase().trim();
    if (!trimmed) { setScreenNameStatus(null); return; }
    setScreenNameChecking(true);
    try {
      const result = await validateScreenName(trimmed, profile?.screen_name || null);
      setScreenNameStatus(result);
    } catch {
      setScreenNameStatus({ available: false, reason: 'Could not verify' });
    } finally {
      setScreenNameChecking(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError('');
    try {
      const data = {
        legal_name: legalName,
        business_name: businessName,
        display_name: displayName,
        screen_name: screenName.toLowerCase().trim() || null,
        headline,
        bio,
        profession: category,
        professional_category: category,
        services,
        service_area: serviceArea,
        service_area_location_id: serviceAreaLocationId || null,
        location,
        location_id: locationId || null,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        avatar_url: avatarUrl,
        avatar_media_id: avatarMediaId || null,
        avatar_position_x: avatarPos.x,
        avatar_position_y: avatarPos.y,
        avatar_zoom: avatarPos.zoom,
        cover_media_id: coverMediaId || null,
        cover_url: coverUrl,
        cover_position_x: coverPos.x,
        cover_position_y: coverPos.y,
        cover_zoom: coverPos.zoom,
        visibility,
      };
      const savedProfile = await saveProfessionalProfile(user.id, data);
      setProfile(savedProfile);
      await updateProfile({ display_name: displayName, avatar_url: avatarUrl });
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err.message || 'Could not save profile');
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

      {/* Verification status */}
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

      {/* Cover image */}
      <div className="bg-white rounded-xl border border-stone-200 p-6 md:p-8 mb-6">
        <h2 className="font-semibold text-stone-800 mb-4 flex items-center gap-2"><ImageIcon className="w-4 h-4 text-stone-500" /> Cover Image</h2>
        <div className="w-full h-32 rounded-xl overflow-hidden bg-stone-100 mb-3 border border-stone-200">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="w-full h-full" style={{ objectFit: 'cover', transform: `scale(${coverPos.zoom})`, transformOrigin: `${coverPos.x * 100}% ${coverPos.y * 100}%` }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-stone-400 text-sm">No cover image</div>
          )}
        </div>
        <div className="flex items-center gap-3 mb-4">
          <MediaUploadButton
            ownerId={user.id}
            sourceDomain="professional"
            visibility="public"
            onUploaded={(asset) => { setCoverUrl(asset.file_url); setCoverMediaId(asset.id); setCoverPos({ x: 0.5, y: 0.5, zoom: 1 }); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-stone-100 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-200 cursor-pointer"
          >
            <Camera className="w-4 h-4" /> {coverUrl ? 'Change cover' : 'Upload cover'}
          </MediaUploadButton>
          {coverUrl && (
            <button onClick={() => { setCoverUrl(''); setCoverMediaId(''); }} className="text-sm text-stone-500 hover:text-red-500">Remove</button>
          )}
        </div>
        {coverUrl && (
          <ImagePositioner
            imageUrl={coverUrl}
            value={coverPos}
            onChange={setCoverPos}
            shape="rect"
            aspect="16 / 5"
            label="Reposition cover"
            preview={{ width: 120, label: 'Mobile preview' }}
          />
        )}
      </div>

      {/* Identity + avatar */}
      <div className="bg-white rounded-xl border border-stone-200 p-6 md:p-8 mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-stone-200 overflow-hidden flex items-center justify-center">
              {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full" style={{ objectFit: 'cover', transform: `scale(${avatarPos.zoom})`, transformOrigin: `${avatarPos.x * 100}% ${avatarPos.y * 100}%` }} /> : <span className="text-2xl font-semibold text-stone-400">{(displayName || '?')[0].toUpperCase()}</span>}
            </div>
            <MediaUploadButton
              ownerId={user.id}
              sourceDomain="professional"
              visibility="public"
              onUploaded={(asset) => { setAvatarUrl(asset.file_url); setAvatarMediaId(asset.id); setAvatarPos({ x: 0.5, y: 0.5, zoom: 1 }); }}
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

        {avatarUrl && (
          <div className="mb-6">
            <ImagePositioner
              imageUrl={avatarUrl}
              value={avatarPos}
              onChange={setAvatarPos}
              shape="circle"
              label="Reposition profile photo"
            />
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Legal Name <span className="text-xs font-normal text-stone-400">(private — used for verification only)</span></label>
            <input type="text" value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="Your real/legal name" className={inputClass} />
            <p className="text-xs text-stone-400 mt-1">Never shown on your public profile.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Business / Trading Name <span className="text-xs font-normal text-stone-400">(optional)</span></label>
            <input type="text" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="e.g. Esther Fitness Ltd" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Display Name</label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Screen Name <span className="text-xs font-normal text-stone-400">(public handle)</span></label>
            <div className="flex items-center gap-2">
              <span className="text-stone-400 text-sm">@</span>
              <input
                type="text"
                value={screenName}
                onChange={e => setScreenName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                onBlur={e => checkScreenName(e.target.value)}
                placeholder="estherfitness"
                className={inputClass}
                maxLength={20}
              />
              {screenNameChecking && <Loader2 className="w-4 h-4 text-stone-400 animate-spin shrink-0" />}
            </div>
            {screenNameStatus && !screenNameChecking && (
              <p className={`text-xs mt-1 flex items-center gap-1 ${screenNameStatus.available ? 'text-emerald-600' : 'text-red-500'}`}>
                {screenNameStatus.available ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                {screenNameStatus.available ? 'Available' : screenNameStatus.reason || 'Not available'}
              </p>
            )}
            <p className="text-xs text-stone-400 mt-1">3-20 characters: lowercase letters, numbers, underscores. Your public profile will be at /p/{screenName || 'handle'}.</p>
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
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Primary Location</label>
            <LocationPicker
              ownerId={user.id}
              ownerType="professional"
              context="professional_service"
              initialLocationId={locationId}
              initialLabel={location}
              onLocationSaved={(id, label) => { setLocationId(id); setLocation(label); }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Service Area</label>
            <input type="text" value={serviceArea} onChange={e => setServiceArea(e.target.value)} placeholder="e.g. Central London, Online" className={inputClass + " mb-3"} />
            <LocationPicker
              ownerId={user.id}
              ownerType="professional"
              context="service_area"
              initialLocationId={serviceAreaLocationId}
              initialLabel={serviceArea}
              onLocationSaved={(id, label) => { setServiceAreaLocationId(id); setServiceArea(label); }}
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

        {saveError && (
          <p className="text-sm text-red-500 mt-4 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {saveError}</p>
        )}

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