import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { approveVerification, rejectVerification, getPendingVerifications } from '@/lib/trust';
import { createNotification } from '@/lib/notifications';
import { getMedia } from '@/lib/media';
import { useFirebase } from '@/lib/backendConfig';
import { Loader2, ShieldCheck, X, Check, FileText, AlertCircle } from 'lucide-react';

// Admin-only verification review page.
// Trust & Reputation decision interface.
export default function VerificationReview() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [evidenceAssets, setEvidenceAssets] = useState([]);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    setLoading(true);
    const reqs = await getPendingVerifications();
    setRequests(reqs);
    setLoading(false);
  };

  const handleSelect = async (req) => {
    setSelected(req);
    setEvidenceAssets([]);
    setShowReject(false);
    setRejectReason('');
    // Load evidence media
    if (req.evidence_media_ids && req.evidence_media_ids.length > 0) {
      const assets = await Promise.all(req.evidence_media_ids.map(id => getMedia(id)));
      setEvidenceAssets(assets.filter(a => a));
    }
  };

  const handleApprove = async () => {
    if (!selected) return;
    setProcessing(selected.id);
    try {
      await approveVerification(selected.id, user.id, 'Verified by Interactive Trust & Reputation');
      // In Firebase mode, decideVerification atomically creates the notification.
      // In Base44 mode, create it separately here.
      if (!useFirebase) {
        await createNotification({
          recipient_id: selected.submitted_by_id,
          source_system: 'trust',
          event_type: 'verification_approved',
          title: 'Verification Approved',
          body: `Your ${selected.target_type} verification has been approved. You are now verified on Interactive.`,
          category: 'verification',
          action_url: selected.target_type === 'business' ? `/business/${selected.target_id}` : '/professional-profile',
          action_label: 'View Profile',
          source_id: selected.id,
        });
      }
      setSelected(null);
      await loadRequests();
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!selected || !rejectReason.trim()) return;
    setProcessing(selected.id);
    try {
      await rejectVerification(selected.id, user.id, rejectReason);
      if (!useFirebase) {
        await createNotification({
          recipient_id: selected.submitted_by_id,
          source_system: 'trust',
          event_type: 'verification_rejected',
          title: 'Verification Could Not Be Confirmed',
          body: `Your ${selected.target_type} verification could not be confirmed. ${rejectReason}`,
          category: 'verification',
          action_url: selected.target_type === 'business' ? `/business/${selected.target_id}/verify` : '/verify-professional',
          action_label: 'Resubmit',
          source_id: selected.id,
        });
      }
      setSelected(null);
      await loadRequests();
    } finally {
      setProcessing(null);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <AlertCircle className="w-10 h-10 text-stone-400 mb-3" />
        <h2 className="text-xl font-semibold text-stone-800 mb-1">Admin Access Required</h2>
        <p className="text-stone-500">Only administrators can review verification requests.</p>
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
        <p className="text-stone-500">Trust & Reputation — review pending verification requests</p>
      </div>

      {selected ? (
        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <button onClick={() => setSelected(null)} className="text-sm text-stone-500 hover:text-stone-700 mb-4">← Back to list</button>
          <h2 className="text-xl font-semibold text-stone-800 mb-4 capitalize">{selected.target_type} Verification</h2>

          <div className="space-y-3 mb-6">
            <div><span className="text-sm text-stone-500">Target ID:</span> <span className="text-sm font-mono text-stone-700">{selected.target_id}</span></div>
            <div><span className="text-sm text-stone-500">Submitted:</span> <span className="text-sm text-stone-700">{new Date(selected.submitted_at).toLocaleString()}</span></div>
            {selected.notes && <div><span className="text-sm text-stone-500">Notes:</span> <span className="text-sm text-stone-700">{selected.notes}</span></div>}
          </div>

          <h3 className="font-semibold text-stone-800 mb-3">Evidence ({evidenceAssets.length})</h3>
          {evidenceAssets.length === 0 ? (
            <p className="text-sm text-stone-500 mb-6">No evidence files attached.</p>
          ) : (
            <div className="space-y-2 mb-6">
              {evidenceAssets.map(asset => (
                <div key={asset.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg">
                  <FileText className="w-4 h-4 text-stone-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-stone-700 truncate">{asset.file_name}</div>
                    <div className="text-xs text-stone-400">{asset.mime_type} · {(asset.size_bytes / 1024).toFixed(1)} KB</div>
                  </div>
                  {asset.media_type === 'image' && asset.file_url && (
                    <img src={asset.file_url} alt="" className="w-10 h-10 object-cover rounded" />
                  )}
                </div>
              ))}
            </div>
          )}

          {showReject ? (
            <div className="space-y-3">
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Reason for rejection..."
                className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 resize-none"
              />
              <div className="flex gap-3">
                <button onClick={() => setShowReject(false)} className="px-4 py-2 text-stone-600 hover:bg-stone-100 rounded-lg text-sm font-medium">Cancel</button>
                <button onClick={handleReject} disabled={processing === selected.id || !rejectReason.trim()} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                  {processing === selected.id ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button onClick={() => setShowReject(true)} disabled={processing === selected.id} className="px-5 py-2.5 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50">
                Reject
              </button>
              <button onClick={handleApprove} disabled={processing === selected.id} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {processing === selected.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Approve Verification</>}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div>
          {requests.length === 0 ? (
            <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
              <ShieldCheck className="w-10 h-10 text-stone-300 mx-auto mb-3" />
              <h3 className="font-semibold text-stone-800 mb-1">No Pending Requests</h3>
              <p className="text-sm text-stone-500">All verification requests have been reviewed.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map(req => (
                <button key={req.id} onClick={() => handleSelect(req)} className="w-full text-left bg-white rounded-xl border border-stone-200 p-5 hover:border-indigo-300 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-stone-800 capitalize">{req.target_type} Verification</span>
                    <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded font-medium">Pending</span>
                  </div>
                  <div className="text-xs text-stone-500">
                    {req.evidence_media_ids?.length || 0} evidence file(s) · Submitted {new Date(req.submitted_at).toLocaleDateString()}
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