import { useState } from 'react';
import { uploadMedia } from '@/lib/media';
import { submitVerificationClaims } from '@/services/verificationEngineService';
import VerificationSourcePicker from '@/components/verification/VerificationSourcePicker';
import { Loader2, ShieldCheck, Upload, X, FileText } from 'lucide-react';

// VerificationSubmissionForm — the authoritative V2 Trust & Reputation
// claims engine, extracted from VerificationPage so the listing creation
// wizard can REUSE the same verification capability (same source registry,
// same protected-media evidence upload, same SubmitVerificationClaims
// backend). No second verification system is created.
//
// Submission requires an authenticated user + a subject id (identity for
// professional, business id for business). When either is missing the
// form is shown but upload/submit are disabled and `disabledReason` is
// surfaced — the caller can offer a "skip and complete later" path.
//
// Props:
//  - subjectType: 'professional' | 'business'
//  - subjectId: string | null
//  - country: string
//  - profession: string
//  - user: object | null
//  - onSubmitted: () => void  (fired once after a successful submission)
//  - disabledReason: string | null  (when set, submit is disabled with this message)
export default function VerificationSubmissionForm({
  subjectType,
  subjectId,
  country = 'GB',
  profession,
  user,
  onSubmitted,
  disabledReason = null,
}) {
  const [selectedClaims, setSelectedClaims] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = !!user && !!subjectId && !disabledReason;

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0 || !user) return;
    setUploading(true);
    try {
      const assets = [];
      for (const file of files) {
        const asset = await uploadMedia(file, user.id, 'verification', 'protected');
        assets.push(asset);
      }
      setEvidence((prev) => [...prev, ...assets]);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeEvidence = (mediaId) => setEvidence((prev) => prev.filter((a) => a.id !== mediaId));

  const handleSubmit = async () => {
    if (!user || !subjectId || selectedClaims.length === 0) return;
    setSubmitting(true);
    try {
      const evidenceMediaIds = evidence.map((a) => a.id);
      const claims = selectedClaims.map((c) => ({ ...c, evidence_media_ids: evidenceMediaIds }));
      await submitVerificationClaims({
        subject_type: subjectType,
        subject_id: subjectId,
        country,
        profession,
        notes,
        claims,
      });
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      console.error('Verification submission failed:', err);
      alert(err?.response?.data?.error || err?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400';

  if (submitted) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-emerald-800">Verification evidence submitted</p>
          <p className="text-sm text-emerald-700 mt-0.5">Your claims have been submitted for review. Each selected source is checked independently by the backend. You'll be notified when a decision is made.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <h3 className="font-semibold text-stone-800 mb-1">Verification sources</h3>
      <p className="text-sm text-stone-500 mb-4">Select one or more verification routes. Each source is checked independently by the backend.</p>

      <VerificationSourcePicker
        subjectType={subjectType}
        country={country}
        profession={profession}
        onChange={setSelectedClaims}
      />

      <h3 className="font-semibold text-stone-800 mt-5 mb-2">Evidence</h3>
      <p className="text-sm text-stone-500 mb-3">Upload documents that support your claims (e.g. certificate, ID, registration). Files are stored as protected media.</p>

      {evidence.length > 0 && (
        <div className="space-y-2 mb-3">
          {evidence.map((asset) => (
            <div key={asset.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg">
              <FileText className="w-4 h-4 text-stone-400 shrink-0" />
              <span className="text-sm text-stone-700 flex-1 truncate">{asset.file_name}</span>
              <button onClick={() => removeEvidence(asset.id)} className="text-stone-400 hover:text-red-500"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      <label className={`flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-xl transition-colors ${canSubmit ? 'border-stone-200 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30' : 'border-stone-200 opacity-60 cursor-not-allowed'}`}>
        {uploading ? <Loader2 className="w-5 h-5 text-indigo-600 animate-spin mb-2" /> : <Upload className="w-5 h-5 text-stone-400 mb-2" />}
        <span className="text-sm text-stone-600">{uploading ? 'Uploading...' : canSubmit ? 'Click to upload evidence' : 'Sign in to upload evidence'}</span>
        <span className="text-xs text-stone-400 mt-1">Images or documents</span>
        <input type="file" multiple accept="image/*,.pdf,.doc,.docx" onChange={handleFileUpload} className="hidden" disabled={!canSubmit} />
      </label>

      <div className="mt-3">
        <label className="block text-sm font-medium text-stone-700 mb-1.5">Additional Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any context about your evidence..." className={inputClass + ' resize-none'} disabled={!canSubmit} />
      </div>

      {disabledReason && (
        <div className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          {disabledReason}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit || submitting || selectedClaims.length === 0}
        className="w-full mt-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
      >
        {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : <><ShieldCheck className="w-4 h-4" /> Submit for Verification</>}
      </button>
    </div>
  );
}