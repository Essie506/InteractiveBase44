import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { listPendingClaims, decideVerificationClaim } from '@/services/verificationEngineService';
import { getMedia, getMediaUrl } from '@/lib/media';
import { Loader2, ShieldCheck, X, Check, FileText, AlertCircle, ExternalLink, Clock, Ban, RotateCcw } from 'lucide-react';

const CLAIM_TYPE_LABELS = {
  identity: 'Identity',
  qualification: 'Qualification',
  professional_registration: 'Professional registration',
  business_existence: 'Business existence',
  business_control: 'Business control',
};

// Admin verification review queue. Shows each pending claim with the
// claimant, claim, submitted evidence, selected source, the source's
// official lookup URL (for manual register lookup), field values and
// audit history. Reviewer can Verify / Reject / Request more / Expire
// / Revoke — every action appends an audit record server-side.
export default function VerificationReview() {
  const { user } = useAuth();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [evidenceAssets, setEvidenceAssets] = useState([]);
  const [evidenceUrls, setEvidenceUrls] = useState({});
  const [note, setNote] = useState('');

  useEffect(() => { loadClaims(); }, []);

  const loadClaims = async () => {
    setLoading(true);
    try {
      const c = await listPendingClaims();
      setClaims(c);
    } catch { setClaims([]); }
    setLoading(false);
  };

  const handleSelect = async (claim) => {
    setSelected(claim);
    setNote('');
    setEvidenceAssets([]);
    setEvidenceUrls({});
    if (claim.evidence_media_ids && claim.evidence_media_ids.length > 0) {
      const assets = await Promise.all(claim.evidence_media_ids.map((id) => getMedia(id)));
      const valid = assets.filter((a) => a);
      setEvidenceAssets(valid);
      const urlMap = {};
      await Promise.all(valid.map(async (a) => {
        const url = await getMediaUrl(a);
        if (url) urlMap[a.id] = url;
      }));
      setEvidenceUrls(urlMap);
    }
  };

  const handleDecision = async (decision) => {
    if (!selected) return;
    setProcessing(selected.id);
    try {
      await decideVerificationClaim({ claim_id: selected.id, decision, note: note || undefined });
      setSelected(null);
      await loadClaims();
    } catch (err) {
      alert(err?.response?.data?.error || err?.message || 'Action failed');
    } finally {
      setProcessing(null);
    }
  };

  if (user?.role !== 'admin' && user?.role !== 'reviewer') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <AlertCircle className="w-10 h-10 text-stone-400 mb-3" />
        <h2 className="text-xl font-semibold text-stone-800 mb-1">Admin Access Required</h2>
        <p className="text-stone-500">Only administrators and reviewers can review verification claims.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1">Verification Review</h1>
        <p className="text-stone-500">Trust & Reputation — review pending verification claims</p>
      </div>

      {selected ? (
        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <button onClick={() => setSelected(null)} className="text-sm text-stone-500 hover:text-stone-700 mb-4">← Back to queue</button>

          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-stone-800 capitalize">{CLAIM_TYPE_LABELS[selected.claim_type] || selected.claim_type}</span>
              <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded">Pending</span>
            </div>
            <div className="text-sm text-stone-600"><span className="text-stone-400">Subject:</span> {selected.subject_type} · <span className="font-mono text-xs">{selected.subject_id}</span></div>
            <div className="text-sm text-stone-600"><span className="text-stone-400">Claimant:</span> <span className="font-mono text-xs">{selected.submitted_by_id}</span></div>
            <div className="text-sm text-stone-600"><span className="text-stone-400">Submitted:</span> {selected.submitted_at ? new Date(selected.submitted_at).toLocaleString() : '—'}</div>
            <div className="text-sm text-stone-600"><span className="text-stone-400">Country / Profession:</span> {selected.country || '—'} / {selected.profession || '—'}</div>
          </div>

          <h3 className="font-semibold text-stone-800 mb-2">Verification Source</h3>
          <div className="bg-stone-50 rounded-lg p-3 mb-6">
            <div className="text-sm font-medium text-stone-800">{selected.source_name}</div>
            <div className="text-xs text-stone-500 capitalize">{selected.verification_method?.replace(/_/g, ' ')}</div>
            {selected.source_lookup_url && (
              <a href={selected.source_lookup_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline mt-1">
                <ExternalLink className="w-3 h-3" /> Open official register lookup
              </a>
            )}
          </div>

          {selected.field_values && Object.keys(selected.field_values).length > 0 && (
            <>
              <h3 className="font-semibold text-stone-800 mb-2">Submitted Reference Details</h3>
              <div className="bg-stone-50 rounded-lg p-3 mb-6 space-y-1">
                {Object.entries(selected.field_values).map(([k, v]) => (
                  <div key={k} className="text-sm"><span className="text-stone-500 capitalize">{k.replace(/_/g, ' ')}:</span> <span className="text-stone-800 font-mono">{String(v)}</span></div>
                ))}
              </div>
            </>
          )}

          <h3 className="font-semibold text-stone-800 mb-3">Evidence ({evidenceAssets.length})</h3>
          {evidenceAssets.length === 0 ? (
            <p className="text-sm text-stone-500 mb-6">No evidence files attached.</p>
          ) : (
            <div className="space-y-2 mb-6">
              {evidenceAssets.map((asset) => (
                <div key={asset.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg">
                  <FileText className="w-4 h-4 text-stone-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-stone-700 truncate">{asset.file_name}</div>
                    <div className="text-xs text-stone-400">{asset.mime_type} · {(asset.size_bytes / 1024).toFixed(1)} KB</div>
                  </div>
                  {asset.media_type === 'image' && evidenceUrls[asset.id] && (
                    <img src={evidenceUrls[asset.id]} alt="" className="w-10 h-10 object-cover rounded" />
                  )}
                  {evidenceUrls[asset.id] && (
                    <a href={evidenceUrls[asset.id]} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">View</a>
                  )}
                </div>
              ))}
            </div>
          )}

          {selected.audit_trail && selected.audit_trail.length > 0 && (
            <>
              <h3 className="font-semibold text-stone-800 mb-2">Audit Trail</h3>
              <div className="space-y-1 mb-6">
                {selected.audit_trail.map((a, i) => (
                  <div key={i} className="text-xs text-stone-500 flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    <span className="capitalize">{a.action}</span>
                    <span>· {new Date(a.at).toLocaleString()}</span>
                    {a.note && <span>· {a.note}</span>}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Reviewer Note (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note for the audit record..." className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => handleDecision('verified')} disabled={processing === selected.id} className="flex-1 min-w-[120px] py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {processing === selected.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Verify</>}
            </button>
            <button onClick={() => handleDecision('requested_more')} disabled={processing === selected.id} className="flex-1 min-w-[120px] py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4" /> Request more
            </button>
            <button onClick={() => handleDecision('rejected')} disabled={processing === selected.id} className="flex-1 min-w-[120px] py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
              <X className="w-4 h-4" /> Reject
            </button>
            <button onClick={() => handleDecision('expired')} disabled={processing === selected.id} className="py-2.5 px-3 text-stone-600 border border-stone-200 rounded-lg text-sm font-medium hover:bg-stone-100 disabled:opacity-50 flex items-center gap-1">
              <Clock className="w-4 h-4" /> Expire
            </button>
            <button onClick={() => handleDecision('revoked')} disabled={processing === selected.id} className="py-2.5 px-3 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 flex items-center gap-1">
              <Ban className="w-4 h-4" /> Revoke
            </button>
          </div>
        </div>
      ) : (
        <div>
          {claims.length === 0 ? (
            <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
              <ShieldCheck className="w-10 h-10 text-stone-300 mx-auto mb-3" />
              <h3 className="font-semibold text-stone-800 mb-1">No Pending Claims</h3>
              <p className="text-sm text-stone-500">All verification claims have been reviewed.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {claims.map((claim) => (
                <button key={claim.id} onClick={() => handleSelect(claim)} className="w-full text-left bg-white rounded-xl border border-stone-200 p-5 hover:border-indigo-300 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-stone-800">{CLAIM_TYPE_LABELS[claim.claim_type] || claim.claim_type}</span>
                    <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded font-medium">Pending</span>
                  </div>
                  <div className="text-xs text-stone-500">
                    {claim.source_name} · {claim.subject_type} · {claim.evidence_media_ids?.length || 0} evidence file(s) · Submitted {claim.submitted_at ? new Date(claim.submitted_at).toLocaleDateString() : '—'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}