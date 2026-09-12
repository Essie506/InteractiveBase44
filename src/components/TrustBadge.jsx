import { useState, useEffect } from 'react';
import { ShieldCheck, Clock, AlertCircle } from 'lucide-react';
import { getPublicProfessionalProfileByIdentity } from '@/services/profileService';
import { getPublicBusinessProfile } from '@/services/businessService';

// Displays the public-safe verification state from the public profile
// projection. Never reads private trustRecords — those are owner/admin
// only and contain internal moderation fields that must not be exposed.
//
// The public projection (professionalProfilesPublic / businessProfilesPublic)
// contains a public-safe `verification_state` field maintained by the
// server-side saveProfile Cloud Functions. This component reads that field
// so it works for both authenticated and unauthenticated/public viewers.
//
// States map to the authoritative verification_state values:
//   verified → green badge
//   pending_review / additional_info_required → amber badge
//   failed / expired → red badge
//   not_verified / null → no badge (clean state)
//
// Browser behaviour:
//   authenticated profile → correct verification state from public projection
//   incognito/public profile → correct public-safe verification state
//   pending/unverified → resolved non-loading presentation (no badge or amber)
//   error → safe resolved state (no badge, never spins)
export default function TrustBadge({ targetType, targetId, size = 'sm' }) {
  const [verificationState, setVerificationState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!targetType || !targetId) { setLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      try {
        if (targetType === 'professional') {
          const profile = await getPublicProfessionalProfileByIdentity(targetId);
          if (!cancelled) setVerificationState(profile?.verification_state || null);
        } else if (targetType === 'business') {
          const profile = await getPublicBusinessProfile(targetId);
          if (!cancelled) setVerificationState(profile?.verification_state || null);
        }
      } catch {
        // Public projection read failed — fail safe (no badge).
        if (!cancelled) setVerificationState(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [targetType, targetId]);

  if (loading || !verificationState) return null;

  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  if (verificationState === 'verified') {
    return (
      <span className={`inline-flex items-center gap-1 ${sizeClass} bg-emerald-50 text-emerald-700 rounded-full font-medium`}>
        <ShieldCheck className={iconSize} /> Verified
      </span>
    );
  }

  if (verificationState === 'pending_review') {
    return (
      <span className={`inline-flex items-center gap-1 ${sizeClass} bg-amber-50 text-amber-700 rounded-full font-medium`}>
        <Clock className={iconSize} /> Pending
      </span>
    );
  }

  if (verificationState === 'additional_info_required') {
    return (
      <span className={`inline-flex items-center gap-1 ${sizeClass} bg-amber-50 text-amber-700 rounded-full font-medium`}>
        <AlertCircle className={iconSize} /> Action Required
      </span>
    );
  }

  // not_verified, failed, expired, or unknown → no badge (clean state)
  return null;
}