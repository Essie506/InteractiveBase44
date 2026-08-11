import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getPersonalProfile, savePersonalProfile } from '@/services/profileService';
import { updateProfile } from '@/services/authService';
import { Loader2, Camera, Save, Check } from 'lucide-react';
import MediaUploadButton from '@/components/MediaUploadButton';
import LocationPicker from '@/components/LocationPicker';

export default function ProfilePage() {
  const { user, checkUserAuth } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [screenName, setScreenName] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [locationVal, setLocationVal] = useState('');
  const [locationId, setLocationId] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarMediaId, setAvatarMediaId] = useState('');
  const [visibility, setVisibility] = useState('public');

  useEffect(() => {
    if (!user) return;
    getPersonalProfile(user.id).then(p => {
      if (p) {
        setProfile(p);
        setDisplayName(p.display_name || '');
        setScreenName(p.screen_name || '');
        setHeadline(p.headline || '');
        setBio(p.bio || '');
        setLocationVal(p.location || '');
        setLocationId(p.location_id || '');
        setAvatarUrl(p.avatar_url || '');
        setAvatarMediaId(p.avatar_media_id || '');
        setVisibility(p.visibility || 'public');
      } else {
        setDisplayName(user.display_name || '');
      }
      setLoading(false);
    });
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const data = {
        display_name: displayName,
        screen_name: screenName,
        headline,
        bio,
        location: locationVal,
        location_id: locationId,
        avatar_url: avatarUrl,
        avatar_media_id: avatarMediaId,
        visibility,
      };
      if (profile) {
        const updated = await savePersonalProfile(user.id, data);
        setProfile(updated);
      } else {
        const created = await savePersonalProfile(user.id, data);
        setProfile(created);
      }
      await updateProfile({ display_name: displayName, avatar_url: avatarUrl });
      await checkUserAuth();
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
        <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1">Personal Profile</h1>
        <p className="text-stone-500">How you appear across Interactive</p>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-6 md:p-8">
        {/* Avatar — uses Media system */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-stone-200 overflow-hidden flex items-center justify-center">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-semibold text-stone-400">
                  {(displayName || user?.email || '?')[0].toUpperCase()}
                </span>
              )}
            </div>
            <MediaUploadButton
              ownerId={user.id}
              sourceDomain="personal"
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
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Screen Name</label>
            <input type="text" value={screenName} onChange={e => setScreenName(e.target.value)} placeholder="@username" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Headline</label>
            <input type="text" value={headline} onChange={e => setHeadline(e.target.value)} placeholder="e.g. Fitness enthusiast" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Bio</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="Tell us about yourself" className={inputClass + " resize-none"} />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Location</label>
            <LocationPicker
              ownerId={user.id}
              ownerType="identity"
              context="profile"
              initialLocationId={locationId}
              initialLabel={locationVal}
              onLocationSaved={(id, label) => { setLocationId(id); setLocationVal(label); }}
            />
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
          <button
            onClick={handleSave}
            disabled={saving || !displayName.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}