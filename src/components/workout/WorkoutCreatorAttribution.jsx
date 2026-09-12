// WorkoutCreatorAttribution — live creator reference (Spec 12 + Data Arch §16–§20).
// ───────────────────────────────────────────────────────────
// Resolves the workout's creator (creator_identity_id) live from the
// Professional profile projection and renders a "Created by {name}"
// link to that staff member's Professional profile.
//
// This is a LIVE reference — no duplicate creator-name snapshot is
// stored on the Workout document. Preserves the distinction between
// creator and owner: a Business-owned workout may still have been
// created by an individual staff member; a staff Professional workout
// remains owned by that Professional.
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPublicProfessionalProfileByIdentity } from '@/services/profileService';

/**
 * @param {{ creatorIdentityId?: string }} props
 */
export default function WorkoutCreatorAttribution({ creatorIdentityId }) {
  const [creator, setCreator] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!creatorIdentityId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    getPublicProfessionalProfileByIdentity(creatorIdentityId)
      .then((p) => { if (!cancelled) setCreator(p || null); })
      .catch(() => { if (!cancelled) setCreator(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [creatorIdentityId]);

  if (loading || !creator || !creator.screen_name) return null;

  return (
    <Link
      to={`/p/${creator.screen_name}`}
      className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-indigo-600 transition-colors"
    >
      {creator.avatar_url ? (
        <img src={creator.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
      ) : (
        <span className="w-4 h-4 rounded-full bg-stone-200 flex items-center justify-center text-[8px] text-stone-500 font-medium">
          {(creator.display_name || '?').charAt(0).toUpperCase()}
        </span>
      )}
      <span>Created by {creator.display_name}</span>
    </Link>
  );
}