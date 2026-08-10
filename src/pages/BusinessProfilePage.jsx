import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { getMembership, hasPermission } from '@/lib/businessPermissions';
import { Loader2, Save, Check, Camera, ArrowLeft, AlertCircle, Plus, X } from 'lucide-react';

export default function BusinessProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [business, setBusiness] = useState(null);
  const [profile, setProfile] = useState(null);
  const [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [locationVal, setLocationVal] = useState('');
  const [category, setCategory] = useState('');
  const [services, setServices] = useState([]);
  const [serviceInput, setServiceInput] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [operatingHours, setOperatingHours] = useState('');
  const [visibility, setVisibility] = useState('public');

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      const biz = await base44.entities.Business.get(id);
      setBusiness(biz);
      const m = await getMembership(id, user.id);
      if (!m || !hasPermission(m, 'manage_profile')) { setAccessDenied(true); setLoading(false); return; }
      setMembership(m);
      const profiles = await base44.entities.BusinessProfile.filter({ business_id: id });
      if (profiles.length > 0) {
        const p = profiles[0];
        setProfile(p);
        setName(p.name || '');
        setDescription(p.description || '');
        setLogoUrl(p.logo_url || '');
        setLocationVal(p.location || '');
        setCategory(p.category || '');
        setServices(p.services || []);
        setContactEmail(p.contact_email || '');
        setContactPhone(p.contact_phone || '');
        setWebsite(p.website || '');
        setOperatingHours(p.operating_hours || '');
        setVisibility(p.visibility || 'public');
      } else {
        setName(biz.name || '');
        setContactEmail(biz.contact_email || '');
        setContactPhone(biz.contact_phone || '');
        setWebsite(biz.website || '');
      }
      setLoading(false);
    })();
  }, [user, id]);

  const addService = () => {
    const s = serviceInput.trim();
    if (s && !services.includes(s)) {
      setServices([...services, s]);
      setServiceInput('');
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setLogoUrl(file_url);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const data = {
        business_id: id,
        name,
        description,
        logo_url: logoUrl,
        location: locationVal,
        category,
        services,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        website,
        operating_hours: operatingHours,
        visibility,
      };
      if (profile) {
        const updated = await base44.entities.BusinessProfile.update(profile.id, data);
        setProfile(updated);
      } else {
        const created = await base44.entities.BusinessProfile.create({ ...data, lifecycle_state: 'active' });
        setProfile(created);
      }
      // Also update business name if changed
      if (name !== business.name) {
        await base44.entities.Business.update(id, { name, contact_email: contactEmail, contact_phone: contactPhone, website });
        setBusiness({ ...business, name, contact_email: contactEmail, contact_phone: contactPhone, website });
      }
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

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <AlertCircle className="w-10 h-10 text-stone-400 mb-3" />
        <h2 className="text-xl font-semibold text-stone-800 mb-1">Access Denied</h2>
        <p className="text-stone-500 mb-4">You need profile management permission.</p>
        <Link to={`/business/${id}`} className="text-indigo-600 font-medium">Back to Business</Link>
      </div>
    );
  }

  const inputClass = "w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400";

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto">
      <Link to={`/business/${id}`} className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> {business.name}
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1">Business Profile</h1>
        <p className="text-stone-500">Public information for {business.name}</p>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-6 md:p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-xl bg-stone-200 overflow-hidden flex items-center justify-center">
              {logoUrl ? <img src={logoUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl font-semibold text-stone-400">{(name || '?')[0].toUpperCase()}</span>}
            </div>
            <label className="absolute bottom-0 right-0 w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-indigo-700 transition-colors border-2 border-white">
              {uploadingLogo ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Camera className="w-3.5 h-3.5 text-white" />}
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </label>
          </div>
          <div>
            <h2 className="font-semibold text-stone-800">{name || 'Business name'}</h2>
            <p className="text-sm text-stone-500 capitalize">{business.type}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Business Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What does your business do?" className={inputClass + " resize-none"} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Category</label>
              <input type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Fitness" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Location</label>
              <input type="text" value={locationVal} onChange={e => setLocationVal(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Services</label>
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
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Contact Email</label>
              <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Contact Phone</label>
              <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Website</label>
            <input type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Operating Hours</label>
            <input type="text" value={operatingHours} onChange={e => setOperatingHours(e.target.value)} placeholder="e.g. Mon-Fri 6am-10pm, Sat 8am-6pm" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Visibility</label>
            <select value={visibility} onChange={e => setVisibility(e.target.value)} className={inputClass}>
              <option value="public">Public — visible to everyone</option>
              <option value="private">Private — visible only to workspace</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button onClick={handleSave} disabled={saving || !name.trim()} className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}