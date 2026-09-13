import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/firebase/firebaseClient';
import { collection, getDocs, query, where, doc, getDoc, limit } from 'firebase/firestore';
import { uploadMedia } from '@/lib/media';
import { submitVerificationClaims, getVerificationState, listClaimsForSubject } from '@/services/verificationEngineService';
import VerificationSourcePicker from '@/components/verification/VerificationSourcePicker';
import { Loader2, ShieldCheck, Upload, X, ArrowLeft, Check, FileText, ExternalLink } from 'lucide-react';

const CLAIM_TYPE_LABELS = {
  identity: 'Identity',
  qualification: 'Qualification',
  professional_registration: 'Professional registration',
  business_existence: 'Business existence',
  business_control: 'Business control',
};

export default function VerificationPage() {
  const { id } = useParams();
  const { user } = useAuth();

  // Determine subject from URL: /business/:id/verify → business; /verify-professional → professional.
  const isBusiness = !!id;
  const subjectType = isBusiness ? 'business' : 'professional';
  const subjectId = isBusiness ? id : user?.id;

  const [profession, setProfession] = useState('');
  const [existingState, setExistingState] = useState(null);
  const [existingClaims, setExistingClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [evidence, setEvidence] = useState([]);
  const [notes, setNotes] = useState('');
  const [selectedClaims, setSelectedClaims] = useState([]);

  useEffect(() => {
    if (!subjectId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        // Load profession from the profile (for source matching).
        let prof = '';
        if (isBusiness) {
          const bizSnap = await getDoc(doc(db, 'businesses', subjectId));
          if (bizSnap.exists()) prof = bizSnap.data().category || bizSnap.data().type || '';
        } else {
          const profSnap = await getDocs(query(collection(db, 'professionalProfiles'), where('identity_id', '==', subjectId), limit(1)));
          const pd = profSnap.docs[0]?.data();
          prof = pd?.professional_type?.id || pd?.professional_type?.label || '';
        }
        if (!cancelled) setProfession(prof);

        const [state, claims] = await Promise.all([
          getVerificationState(subjectType, subjectId),
          listClaimsForSubject(subjectId),
        ]);
        if (!cancelled) { setExistingState(state); setExistingClaims(claims); }
      } catch {
        // fail safe
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [subjectId, subjectType, isBusiness]);

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
      setEvidence([...evidence, ...assets]);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeEvidence = (mediaId) => setEvidence(evidence.filter((e) => e.id !== mediaId));

  const handleSubmit = async () => {
    if (!user || selectedClaims.length === 0) return;
    setSubmitting(true);
    try {
      const evidenceMediaIds = evidence.map((e) => e.id);
      const claims = selectedClaims.map((c) => ({ ...c, evidence_media_ids: evidenceMediaIds }));
      await submitVerificationClaims({
        subject_type: subjectType,
        subject_id: subjectId,
        country: 'GB',
        profession,
        notes,
        claims,
      });
      setSubmitted(true);
    } catch (err) {
      console.error('Verification submission failed:', err);
      alert(err?.response?.data?.error || err?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="p-6 md:p-10 max-w-lg mx-auto">
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-stone-800 mb-2">Verification Submitted</h1>
          <p className="text-stone-500 mb-6">Your verification claims have been submitted for review. Each selected source is checked independently. You'll be notified when a decision is made.</p>
          <Link to={isBusiness ? `/business/${id}` : '/professional-profile'} className="inline-block px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            Back to {isBusiness ? 'Business' : 'Profile'}
          </Link>
        </div>
      </div>
    );
  }

  const isVerified = existingState?.public_state === 'verified';
  const hasPending = existingClaims.some((c) => c.status === 'pending');

  const inputClass = 'w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400';

  return (
    <div className="p-6 md:p-10 max-w-lg mx-auto">
      <Link to={isBusiness ? `/business/${id}` : '/dashboard'} className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-stone-800">{isBusiness ? 'Business' : 'Professional'} Verification</h1>
        </div>
        <p className="text-stone-500 text-left">Verification is based on corroborated evidence — not email, phone, subscription tier, or advertising spend.</p>
      </div>

      {isVerified && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span className="font-medium text-emerald-800">Verified</span>
          </div>
          <p className="text-sm text-emerald-700 mt-1">{existingState?.summary}</p>
        </div>
      )}

      {hasPending && !isVerified && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 text-amber-600" />
            <span className="font-medium text-amber-800">Verification In Progress</span>
          </div>
          <p className="text-sm text-amber-700 mt-1">You have claims under review. You'll be notified when a decision is made.</p>
          <div className="mt-3 space-y-1.5">
            {existingClaims.filter((c) => c.status === 'pending').map((c) => (
              <div key={c.id} className="text-xs text-amber-700 flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-amber-100 rounded">{CLAIM_TYPE_LABELS[c.claim_type] || c.claim_type}</span>
                {c.source_name}
              </div>
            ))}
          </div>
        </div>
      )}

      {!isVerified && (
        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <h2 className="font-semibold text-stone-800 mb-1">Verification Sources</h2>
          <p className="text-sm text-stone-500 mb-4">Select one or more verification routes. Each source is checked independently by the backend.</p>

          <VerificationSourcePicker
            subjectType={subjectType}
            country="GB"
            profession={profession}
            onChange={setSelectedClaims}
          />

          <h2 className="font-semibold text-stone-800 mt-6 mb-2">Evidence</h2>
          <p className="text-sm text-stone-500 mb-4">Upload documents that support your claims (e.g. certificate, ID, business registration). Files are stored as protected media.</p>

          {evidence.length > 0 && (
            <div className="space-y-2 mb-4">
              {evidence.map((asset) => (
                <div key={asset.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg">
                  <FileText className="w-4 h-4 text-stone-400 shrink-0" />
                  <span className="text-sm text-stone-700 flex-1 truncate">{asset.file_name}</span>
                  <button onClick={() => removeEvidence(asset.id)} className="text-stone-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}

          <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-stone-200 rounded-xl cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
            {uploading ? <Loader2 className="w-6 h-6 text-indigo-600 animate-spin mb-2" /> : <Upload className="w-6 h-6 text-stone-400 mb-2" />}
            <span className="text-sm text-stone-600">{uploading ? 'Uploading...' : 'Click to upload evidence'}</span>
            <span className="text-xs text-stone-400 mt-1">Images or documents</span>
            <input type="file" multiple accept="image/*,.pdf,.doc,.docx" onChange={handleFileUpload} className="hidden" />
          </label>

          <div className="mt-4">
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Additional Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Any context about your evidence..." className={inputClass + ' resize-none'} />
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || selectedClaims.length === 0}
            className="w-full mt-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : <><ShieldCheck className="w-4 h-4" /> Submit for Verification</>}
          </button>
        </div>
      )}

      <p className="text-xs text-stone-400 mt-4 text-center">Verification is determined by corroborated evidence — not by subscription tier or advertising spend.</p>
    </div>
  );
}