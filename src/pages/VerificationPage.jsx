import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/firebase/firebaseClient';
import { collection, getDocs, query, where, doc, getDoc, limit } from 'firebase/firestore';
import { getVerificationState, listClaimsForSubject } from '@/services/verificationEngineService';
import VerificationSubmissionForm from '@/components/verification/VerificationSubmissionForm';
import { Loader2, ShieldCheck, ArrowLeft, Check } from 'lucide-react';

const CLAIM_TYPE_LABELS = {
  identity: 'Identity',
  qualification: 'Qualification',
  professional_registration: 'Professional registration',
  business_existence: 'Business existence',
  business_control: 'Business control',
};

// Professional / Business Verification page. Reuses the shared
// VerificationSubmissionForm (the authoritative V2 Trust & Reputation
// claims engine) — the same component used by the listing creation
// wizard, so there is one verification implementation, not two.
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
  const [submitted, setSubmitted] = useState(false);

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
        <VerificationSubmissionForm
          subjectType={subjectType}
          subjectId={subjectId}
          country="GB"
          profession={profession}
          user={user}
          onSubmitted={() => setSubmitted(true)}
        />
      )}

      <p className="text-xs text-stone-400 mt-4 text-center">Verification is determined by corroborated evidence — not by subscription tier or advertising spend.</p>
    </div>
  );
}