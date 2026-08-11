import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { uploadMedia } from '@/lib/media';
import { submitVerification, getVerificationRequest } from '@/lib/trust';
import { createNotification } from '@/lib/notifications';
import { Loader2, ShieldCheck, Upload, X, ArrowLeft, Check, FileText } from 'lucide-react';

export default function VerificationPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Determine target from URL
  const isBusiness = !!id;
  const targetType = isBusiness ? 'business' : 'professional';
  const targetId = isBusiness ? id : user?.id;

  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [evidence, setEvidence] = useState([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!targetId) return;
    getVerificationRequest(targetType, targetId).then((req) => {
      setExisting(req);
      setLoading(false);
    });
  }, [targetId, targetType]);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
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

  const removeEvidence = (mediaId) => {
    setEvidence(evidence.filter((e) => e.id !== mediaId));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const evidenceMediaIds = evidence.map((e) => e.id);
      await submitVerification(targetType, targetId, user.id, evidenceMediaIds, notes);

      // Create notification (failure isolated — doesn't undo submission)
      await createNotification({
        recipient_id: user.id,
        source_system: 'trust',
        event_type: 'verification_submitted',
        title: 'Verification Submitted',
        body: `Your ${targetType} verification request has been submitted for review.`,
        category: 'verification',
        action_url: isBusiness ? `/business/${id}` : '/professional-profile',
        action_label: 'View Profile',
        source_id: targetId
      });

      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>);

  }

  if (submitted) {
    return (
      <div className="p-6 md:p-10 max-w-lg mx-auto">
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-stone-800 mb-2">Verification Submitted</h1>
          <p className="text-stone-500 mb-6">Your verification request has been submitted to Trust & Reputation for review. You'll be notified when a decision is made.</p>
          <Link to={isBusiness ? `/business/${id}` : '/professional-profile'} className="inline-block px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            Back to {isBusiness ? 'Business' : 'Profile'}
          </Link>
        </div>
      </div>);

  }

  const alreadyVerified = existing?.decision === 'approved' || existing?.public_state === 'verified';
  const alreadyPending = existing?.decision === 'pending' && !alreadyVerified;

  const inputClass = "w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400";

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
        <p className="text-stone-500 text-center">Submit evidence for Trust & Reputation review.</p>
      </div>

      {alreadyVerified &&
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span className="font-medium text-emerald-800">Already Verified</span>
          </div>
          <p className="text-sm text-emerald-700 mt-1">{existing?.trust_explanation || 'Your verification has been confirmed.'}</p>
        </div>
      }

      {alreadyPending && !alreadyVerified &&
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 text-amber-600" />
            <span className="font-medium text-amber-800">Verification Pending</span>
          </div>
          <p className="text-sm text-amber-700 mt-1">Your verification request is under review. You'll be notified when a decision is made.</p>
        </div>
      }

      {!alreadyVerified &&
      <div className="bg-white rounded-xl border border-stone-200 p-6">
          <h2 className="font-semibold text-stone-800 mb-2">Upload Evidence</h2>
          <p className="text-sm text-stone-500 mb-4">Upload documents that support your verification (e.g. certifications, ID, business registration). Files are stored as protected Media.</p>

          {/* Evidence list */}
          {evidence.length > 0 &&
        <div className="space-y-2 mb-4">
              {evidence.map((asset) =>
          <div key={asset.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg">
                  <FileText className="w-4 h-4 text-stone-400 shrink-0" />
                  <span className="text-sm text-stone-700 flex-1 truncate">{asset.file_name}</span>
                  <button onClick={() => removeEvidence(asset.id)} className="text-stone-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                </div>
          )}
            </div>
        }

          {/* Upload button */}
          <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-stone-200 rounded-xl cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
            {uploading ? <Loader2 className="w-6 h-6 text-indigo-600 animate-spin mb-2" /> : <Upload className="w-6 h-6 text-stone-400 mb-2" />}
            <span className="text-sm text-stone-600">{uploading ? 'Uploading...' : 'Click to upload evidence'}</span>
            <span className="text-xs text-stone-400 mt-1">Images or documents</span>
            <input type="file" multiple accept="image/*,.pdf,.doc,.docx" onChange={handleFileUpload} className="hidden" />
          </label>

          {/* Notes */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Additional Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Any context about your evidence..." className={inputClass + " resize-none"} />
          </div>

          {/* Submit */}
          <button
          onClick={handleSubmit}
          disabled={submitting || evidence.length === 0}
          className="w-full mt-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
          
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : <><ShieldCheck className="w-4 h-4" /> Submit for Verification</>}
          </button>
        </div>
      }

      <p className="text-xs text-stone-400 mt-4 text-center">Verification is determined by evidence — not by subscription tier or advertising spend.</p>
    </div>);

}