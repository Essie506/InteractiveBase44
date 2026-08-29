import { ShieldCheck, Clock } from 'lucide-react';

// Public-safe verification indicator based on the verification_state
// field carried in the public profile projection. Does NOT read
// private trustRecords (which are owner/admin only), so it works
// for signed-out directory visitors.
export default function VerificationPill({ verificationState }) {
  if (verificationState === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-medium">
        <ShieldCheck className="w-3 h-3" />
        Verified
      </span>
    );
  }
  if (verificationState === 'pending_review') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-medium">
        <Clock className="w-3 h-3" />
        Pending
      </span>
    );
  }
  return null;
}