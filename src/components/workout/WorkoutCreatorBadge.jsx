/**
 * WorkoutCreatorBadge — cross-system link from Workout to Profile.
 * ───────────────────────────────────────────────────────────
 * Resolves the workout owner's public profile and renders a
 * clickable badge linking to their professional or business profile.
 *
 * - identity-owned → resolves professionalProfilesPublic by identity_id
 *   and links to /p/:screenName
 * - business-owned → resolves businessProfilesPublic by business_id
 *   and links to /b/:businessId
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { getPublicProfessionalProfileByIdentity } from '@/services/profileService';
import { getPublicBusinessProfile } from '@/services/businessService';

export default function WorkoutCreatorBadge({ workout }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workout) return;
    let cancelled = false;

    if (workout.owner_type === 'business' && workout.business_id) {
      getPublicBusinessProfile(workout.business_id)
        .then((p) => {
          if (!cancelled) setProfile(p ? { type: 'business', ...p } : null);
        })
        .catch(() => { if (!cancelled) setProfile(null); })
        .finally(() => { if (!cancelled) setLoading(false); });
      return;
    }

    if (workout.owner_type === 'identity' && workout.owner_id) {
      getPublicProfessionalProfileByIdentity(workout.owner_id)
        .then((p) => {
          if (!cancelled) setProfile(p ? { type: 'professional', ...p } : null);
        })
        .catch(() => { if (!cancelled) setProfile(null); })
        .finally(() => { if (!cancelled) setLoading(false); });
      return;
    }

    setLoading(false);
  }, [workout]);

  if (loading || !profile) return null;

  if (profile.type === 'business') {
    return (
      <Link
        to={`/b/${workout.business_id}`}
        className="inline-flex items-center gap-2.5 group"
      >
        {profile.logo_url ? (
          <img src={profile.logo_url} alt="" className="w-9 h-9 rounded-lg object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-stone-400" />
          </div>
        )}
        <div>
          <div className="text-sm font-medium text-stone-800 group-hover:text-indigo-600 transition-colors">
            {profile.name}
          </div>
          <div className="text-xs text-stone-400">Business</div>
        </div>
      </Link>
    );
  }

  if (profile.type === 'professional' && profile.screen_name) {
    return (
      <Link
        to={`/p/${profile.screen_name}`}
        className="inline-flex items-center gap-2.5 group"
      >
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-stone-200 flex items-center justify-center text-stone-500 text-sm font-medium">
            {(profile.display_name || '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <div className="text-sm font-medium text-stone-800 group-hover:text-indigo-600 transition-colors">
            {profile.display_name}
          </div>
          {profile.headline && (
            <div className="text-xs text-stone-400 truncate max-w-[200px]">{profile.headline}</div>
          )}
        </div>
      </Link>
    );
  }

  return null;
}