import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Loader2, Camera, Save, Check, ShieldCheck, Plus, X } from 'lucide-react';

export default function ProfessionalProfilePage() {
  const { user, checkUserAuth } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [category, setCategory] = useState('');
  const [services, setServices] = useState([]);
  const [serviceInput, setServiceInput] = useState('');
  const [location, setLocation] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [visibility, setVisibility] = useState('public');

  useEffect(() => {
    if (!user) return;
    base44.entities.ProfessionalProfile.filter({ identity_id: user.id }).then(profiles => {
      if (profiles.length > 0) {
        const p = profiles[0];
        setProfile(p);
        setDisplayName(p.display_name || '');
        setHeadline(p.headline || '');
        setBio(p.bio || '');
        setCategory(p.professional_category || p.profession || '');
        setServices(p.services || []);
        setLocation(p.location || '');
        setServiceArea(p.service_area || '');
        setContactEmail(p.contact_email || '');
        setContactPhone(p.contact_phone || '');
        setAvatarUrl(p.avatar_url || '');
        setVisibility(p.visibility || 'public');
      } else {
        setDisplayName(user.display_name || '');
        setContactEmail(user.email || '');
      }
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

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setAvatarUrl(file_url);
    } finally {
      setUploadingAvatar(false);
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
        location,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        avatar_url: avatarUrl,
        visibility,
      };
      if (profile) {
        const updated = await base44.entities.ProfessionalProfile.update(profile.id, data);
        setProfile(updated);
      } else {
        const created = await base44.entities.ProfessionalProfile.create({
          identity_id: user.id,
          ...data,
          lifecycle_state: 'active',
          onboarding_status: 'active',
        });
        setProfile(created);
      }
      await base44.auth.updateMe({ display_name: displayName, avatar_url: avatarUrl });
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
        <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1">Professional Profile</h1>
        <p className="text-stone-500">Your professional identity across Interactive</p>
      </div>

      {profile?.verification_state && profile.verification_state !== 'verified' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <div className="text-sm font-medium text-amber-800">Verification: {profile.verification_state.replace(/_/g, ' ')}</div>
            <div className="text-xs text-amber-700">Some capabilities may require verified status</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-stone-200 p-6 md:p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-stone-200 overflow-hidden flex items-center justify-center">
              {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl font-semibold text-stone-400">{(displayName || '?')[0].toUpperCase()}</span>}
            </div>
            <label className="absolute bottom-0 right-0 w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-indigo-700 transition-colors border-2 border-white">
              {uploadingAvatar ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Camera className="w-3.5 h-3.5 text-white" />}
              <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            </label>
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Location</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Service Area</label>
              <input type="text" value={serviceArea} onChange={e => setServiceArea(e.target.value)} className={inputClass} />
            </div>
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