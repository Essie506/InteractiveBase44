import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { listVerificationSources, saveVerificationSource, deleteVerificationSource } from '@/services/verificationEngineService';
import { Loader2, ShieldCheck, Plus, Pencil, Trash2, X, AlertCircle } from 'lucide-react';

const AUTHORITY_TYPES = ['regulator', 'professional_body', 'awarding_organisation', 'official_register', 'partner', 'manual_review'];
const METHODS = ['api', 'official_dataset', 'professional_register_lookup', 'partner_verification', 'manual_review'];
const ALL_CLAIM_TYPES = ['identity', 'qualification', 'professional_registration', 'business_existence', 'business_control'];

const EMPTY = {
  name: '', authority_type: 'manual_review', country: 'GB', professions: ['*'],
  claim_types: [], verification_method: 'manual_review', endpoint_url: '', dataset_ref: '',
  lookup_url: '', required_fields: [], is_active: true, automated_enabled: false, description: '',
};

// Admin Verification Sources screen. Admins can create/edit a source
// with jurisdiction, professions/categories, authority name, official
// lookup URL, verification method, API endpoint (if applicable),
// dataset reference (if applicable), required input fields, active
// state, and whether automated checking is enabled. Setting
// automated_enabled = true does NOT scrape a website — the backend
// only uses an API/dataset source when credentials are actually
// configured.
export default function VerificationSourcesAdmin() {
  const { user } = useAuth();
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // source object or null
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { setSources(await listVerificationSources()); } catch { setSources([]); }
    setLoading(false);
  };

  const startNew = () => setEditing({ ...EMPTY, id: '' });
  const startEdit = (s) => setEditing({ ...s, professions: s.professions || ['*'], required_fields: s.required_fields || [] });

  const handleSave = async () => {
    if (!editing.name || !editing.claim_types.length) { alert('Name and at least one claim type are required'); return; }
    setSaving(true);
    try {
      const { id, ...data } = editing;
      await saveVerificationSource({ id: id || undefined, ...data });
      setEditing(null);
      await load();
    } catch (err) {
      alert(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this verification source?')) return;
    try { await deleteVerificationSource(id); await load(); } catch (err) { alert(err?.message || 'Delete failed'); }
  };

  const toggleClaimType = (ct) => {
    setEditing({ ...editing, claim_types: editing.claim_types.includes(ct) ? editing.claim_types.filter((c) => c !== ct) : [...editing.claim_types, ct] });
  };

  const addField = () => setEditing({ ...editing, required_fields: [...editing.required_fields, { id: '', label: '', type: 'text', required: true }] });
  const updateField = (i, key, val) => {
    const fields = [...editing.required_fields];
    fields[i] = { ...fields[i], [key]: val };
    setEditing({ ...editing, required_fields: fields });
  };
  const removeField = (i) => setEditing({ ...editing, required_fields: editing.required_fields.filter((_, idx) => idx !== i) });

  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <AlertCircle className="w-10 h-10 text-stone-400 mb-3" />
        <h2 className="text-xl font-semibold text-stone-800 mb-1">Admin Access Required</h2>
        <p className="text-stone-500">Only administrators can manage verification sources.</p>
      </div>
    );
  }

  const inputClass = 'w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400';

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1">Verification Sources</h1>
          <p className="text-stone-500">Authoritative registry of verification sources</p>
        </div>
        <button onClick={startNew} className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> New Source
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-stone-300 animate-spin" /></div>
      ) : editing ? (
        <div className="bg-white rounded-xl border border-stone-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-stone-800">{editing.id ? 'Edit Source' : 'New Source'}</h2>
            <button onClick={() => setEditing(null)} className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Authority Name *</label>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputClass} placeholder="e.g. CIMSPA, Companies House" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Authority Type</label>
              <select value={editing.authority_type} onChange={(e) => setEditing({ ...editing, authority_type: e.target.value })} className={inputClass}>
                {AUTHORITY_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Verification Method</label>
              <select value={editing.verification_method} onChange={(e) => setEditing({ ...editing, verification_method: e.target.value })} className={inputClass}>
                {METHODS.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Country / Jurisdiction</label>
              <input value={editing.country} onChange={(e) => setEditing({ ...editing, country: e.target.value })} className={inputClass} placeholder="GB or *" />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Professions (comma-separated)</label>
              <input value={(editing.professions || []).join(', ')} onChange={(e) => setEditing({ ...editing, professions: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className={inputClass} placeholder="* or personal_trainer, physio" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Claim Types *</label>
            <div className="flex flex-wrap gap-2">
              {ALL_CLAIM_TYPES.map((ct) => (
                <button key={ct} type="button" onClick={() => toggleClaimType(ct)} className={`px-3 py-1.5 rounded-lg text-sm border ${editing.claim_types.includes(ct) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}>
                  {ct.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Official Lookup URL</label>
            <input value={editing.lookup_url} onChange={(e) => setEditing({ ...editing, lookup_url: e.target.value })} className={inputClass} placeholder="https://... (shown to reviewer for manual lookup — not scraped)" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">API Endpoint (if applicable)</label>
              <input value={editing.endpoint_url} onChange={(e) => setEditing({ ...editing, endpoint_url: e.target.value })} className={inputClass} placeholder="Used only when credentials configured" />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Dataset Reference (if applicable)</label>
              <input value={editing.dataset_ref} onChange={(e) => setEditing({ ...editing, dataset_ref: e.target.value })} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Required Input Fields</label>
            <div className="space-y-2">
              {(editing.required_fields || []).map((f, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={f.id} onChange={(e) => updateField(i, 'id', e.target.value)} placeholder="field_id" className={inputClass + ' flex-1'} />
                  <input value={f.label} onChange={(e) => updateField(i, 'label', e.target.value)} placeholder="Label" className={inputClass + ' flex-1'} />
                  <select value={f.type} onChange={(e) => updateField(i, 'type', e.target.value)} className={inputClass + ' w-24'}>
                    <option value="text">text</option>
                    <option value="date">date</option>
                    <option value="file">file</option>
                  </select>
                  <button onClick={() => removeField(i)} className="text-stone-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <button onClick={addField} className="text-sm text-indigo-600 hover:underline">+ Add field</button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Description</label>
            <textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} className={inputClass + ' resize-none'} />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Active
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" checked={editing.automated_enabled} onChange={(e) => setEditing({ ...editing, automated_enabled: e.target.checked })} /> Automated checking enabled
            </label>
          </div>
          {editing.automated_enabled && (
            <p className="text-xs text-amber-600">Automated checking only runs when API credentials/access are actually configured. Entering a URL does not enable scraping.</p>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={() => setEditing(null)} className="px-4 py-2 text-stone-600 hover:bg-stone-100 rounded-lg text-sm font-medium">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Save Source
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.length === 0 ? (
            <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
              <ShieldCheck className="w-10 h-10 text-stone-300 mx-auto mb-3" />
              <h3 className="font-semibold text-stone-800 mb-1">No Sources Configured</h3>
              <p className="text-sm text-stone-500">Run the seed function or create a source to enable verification.</p>
            </div>
          ) : sources.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-stone-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-stone-800">{s.name}</span>
                    {!s.is_active && <span className="text-xs px-2 py-0.5 bg-stone-100 text-stone-500 rounded">Inactive</span>}
                    {s.automated_enabled
                      ? <span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded">Automated</span>
                      : <span className="text-xs px-2 py-0.5 bg-stone-100 text-stone-500 rounded">Manual</span>}
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    {s.country} · {s.authority_type?.replace(/_/g, ' ')} · {(s.claim_types || []).join(', ')}
                  </div>
                  {s.description && <div className="text-sm text-stone-600 mt-1">{s.description}</div>}
                  {s.lookup_url && <a href={s.lookup_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline mt-1 inline-block">{s.lookup_url}</a>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(s)} className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(s.id)} className="p-1.5 text-stone-400 hover:text-red-500 rounded-lg hover:bg-stone-100"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}