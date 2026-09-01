// Professional Profile — trusted server-side operations
// ───────────────────────────────────────────────────────────
// 1. saveProfessionalProfile — authoritative write to professionalProfiles
//    + maintains the professionalProfilesPublic projection (public fields
//    only). Enforces screen_name uniqueness using the projection doc ID
//    (doc ID == lowercased screen_name), so Firestore guarantees uniqueness.
// 2. validateScreenName — live format + uniqueness check for the edit form.
//
// The public projection NEVER contains legal_name, contact_email,
// contact_phone, away_message, onboarding_status, or activated_at.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId } from './shared';
import { fetchProfessionalPublicGeo } from './geo';

const PROFILES = 'professionalProfiles';
const PUBLIC = 'professionalProfilesPublic';
const DIRECTORY = 'professionalDirectoryEntries';

const SCREEN_NAME_RE = /^[a-z0-9_]{3,20}$/;

function normaliseScreenName(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  if (!s) return null;
  return s;
}

function validateScreenNameFormat(s: string): string | null {
  if (!SCREEN_NAME_RE.test(s)) {
    return 'Screen name must be 3-20 characters: lowercase letters, numbers, and underscores.';
  }
  return null;
}

// Public-field allowlist for the projection.
export function buildPublicProjection(identityId: string, profileId: string, data: any, locationGeo?: { latitude: number; longitude: number } | null): Record<string, any> {
  return {
    identity_id: identityId,
    profile_id: profileId,
    display_name: data.display_name || null,
    business_name: data.business_name || null,
    screen_name: data.screen_name || null,
    avatar_url: data.avatar_url || null,
    avatar_media_id: data.avatar_media_id || null,
    avatar_position_x: data.avatar_position_x ?? 0.5,
    avatar_position_y: data.avatar_position_y ?? 0.5,
    avatar_zoom: data.avatar_zoom ?? 1,
    cover_media_id: data.cover_media_id || null,
    cover_url: data.cover_url || null,
    cover_position_x: data.cover_position_x ?? 0.5,
    cover_position_y: data.cover_position_y ?? 0.5,
    cover_zoom: data.cover_zoom ?? 1,
    headline: data.headline || null,
    bio: data.bio || null,
    profession: data.profession || null,
    professional_category: data.professional_category || null,
    professional_type: data.professional_type || null,
    specialisms: Array.isArray(data.specialisms) ? data.specialisms : [],
    session_types: Array.isArray(data.session_types) ? data.session_types : [],
    services: Array.isArray(data.services) ? data.services : [],
    service_area: data.service_area || null,
    location: data.location || null,
    location_geo: locationGeo || null,
    website: data.website || null,
    gallery_media_ids: Array.isArray(data.gallery_media_ids) ? data.gallery_media_ids : [],
    verification_state: data.verification_state || 'not_verified',
    visibility: data.visibility || 'public',
    lifecycle_state: data.lifecycle_state || 'draft',
    _updated_date: new Date().toISOString(),
  };
}

// Directory advert projection — discovery-safe advert fields only.
// Independent of buildPublicProjection: this is the public Professional
// advert/business-card, NOT the full public profile. It is written to
// professionalDirectoryEntries/{screenName} when the professional has
// opted into the Directory (directory_visibility === 'listed') and is
// active with a screen_name — regardless of profile visibility.
//
// Contains ONLY advert-safe fields. Never includes:
//   legal_name, bio, gallery_media_ids, contact_email, contact_phone,
//   away_message, onboarding_status, activated_at.
// Public contact (email/phone/website) is included ONLY when the
// professional has explicitly enabled the corresponding *_visible flag.
export function buildDirectoryEntry(identityId: string, profileId: string, data: any, locationGeo?: { latitude: number; longitude: number } | null): Record<string, any> {
  const pc = data.public_contact || {};
  const websiteVisible = !!pc.website_visible;
  const emailVisible = !!pc.email_visible;
  const phoneVisible = !!pc.phone_visible;
  return {
    identity_id: identityId,
    profile_id: profileId,
    screen_name: data.screen_name || null,
    display_name: data.display_name || null,
    business_name: data.business_name || null,
    avatar_url: data.avatar_url || null,
    avatar_media_id: data.avatar_media_id || null,
    avatar_position_x: data.avatar_position_x ?? 0.5,
    avatar_position_y: data.avatar_position_y ?? 0.5,
    avatar_zoom: data.avatar_zoom ?? 1,
    cover_url: data.cover_url || null,
    cover_media_id: data.cover_media_id || null,
    cover_position_x: data.cover_position_x ?? 0.5,
    cover_position_y: data.cover_position_y ?? 0.5,
    cover_zoom: data.cover_zoom ?? 1,
    headline: data.headline || null,
    profession: data.profession || null,
    professional_category: data.professional_category || null,
    professional_type: data.professional_type || null,
    services: Array.isArray(data.services) ? data.services : [],
    specialisms: Array.isArray(data.specialisms) ? data.specialisms : [],
    session_types: Array.isArray(data.session_types) ? data.session_types : [],
    service_area: data.service_area || null,
    location: data.location || null,
    location_geo: locationGeo || null,
    verification_state: data.verification_state || 'not_verified',
    // Public contact — only when explicitly enabled by the professional
    website: websiteVisible ? (data.website || null) : null,
    public_email: emailVisible ? (pc.email || null) : null,
    public_phone: phoneVisible ? (pc.phone || null) : null,
    public_hours: Array.isArray(data.public_hours) ? data.public_hours : [],
    // Provenance for the frontend (access tier resolution)
    visibility: data.visibility || 'public',
    directory_visibility: data.directory_visibility || 'unlisted',
    lifecycle_state: data.lifecycle_state || 'draft',
    _updated_date: new Date().toISOString(),
  };
}

// ── saveProfessionalProfile ──────────────────────────────────
// Request: { data: { ...profile fields, identity_id } }
// Returns: { id, ...data }
export const saveProfessionalProfile = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await getIdentityId(request.auth.uid);
    const body = request.data || {};
    const identityId = body.identity_id;

    if (!identityId || identityId !== callerIdentityId) {
      throw new HttpsError('permission-denied', 'You can only save your own professional profile');
    }

    // Find existing profile by identity_id
    const existingSnap = await db.collection(PROFILES)
      .where('identity_id', '==', identityId)
      .limit(1)
      .get();

    const existingDoc = existingSnap.docs[0];
    const profileId = existingDoc?.id || db.collection(PROFILES).doc().id;
    const existingData = existingDoc?.data() || {};

    // Resolve screen_name: preserve existing when not sent in the body.
    // Previously, omitting screen_name would overwrite the existing value
    // with null, corrupting the private profile and breaking projection
    // cleanup. Now, only an explicit body value (including empty string)
    // overrides the existing screen_name.
    const requestedScreenName = normaliseScreenName(body.screen_name);
    const existingScreenName = normaliseScreenName(existingData.screen_name);
    const screenName = body.screen_name !== undefined
      ? requestedScreenName
      : existingScreenName;
    if (screenName) {
      const fmtErr = validateScreenNameFormat(screenName);
      if (fmtErr) throw new HttpsError('invalid-argument', fmtErr);
    }

    // Merge incoming data over existing (client sends full field set)
    const merged = { ...existingData, ...body, identity_id: identityId, screen_name: screenName };
    delete (merged as any).id;

    // ── Server-side contract enforcement ──
    // An active Professional must carry a canonical screen_name: it is the
    // public URL key (/p/:screenName) and the professionalProfilesPublic
    // doc ID. Without it the profile can never be publicly listable and the
    // public route cannot resolve. This guard prevents activation or editor
    // saves from persisting an active profile with a null screen_name, and
    // blocks editor saves that would re-null an existing active profile's
    // screen_name (the root cause of profiles disappearing from the Directory).
    if (merged.lifecycle_state === 'active' && !screenName) {
      throw new HttpsError(
        'invalid-argument',
        'A screen name is required for an active professional profile',
      );
    }

    // ── screen_name uniqueness ──
    // The projection doc ID == lowercased screen_name. If a projection
    // already exists for a different identity, refuse.
    if (screenName) {
      const projRef = db.collection(PUBLIC).doc(screenName);
      const projSnap = await projRef.get();
      if (projSnap.exists && projSnap.data()?.identity_id !== identityId) {
        throw new HttpsError('already-exists', 'That screen name is already taken');
      }
    }

    // Write the private profile doc
    await db.collection(PROFILES).doc(profileId).set(merged, { merge: true });

    // ── Maintain BOTH projections independently ──
    // professionalProfilesPublic: full public profile. Eligibility:
    //   visibility === 'public' && active && screen_name.
    // professionalDirectoryEntries: discovery advert. Eligibility:
    //   active && screen_name && directory_visibility === 'listed'
    //   (INDEPENDENT of visibility — a connections/private profile can
    //   still publish an advert).
    // Changing profile visibility must NOT affect the directory entry,
    // and changing directory_visibility must NOT affect the public profile.
    const isPubliclyListable = merged.visibility === 'public'
      && merged.lifecycle_state === 'active'
      && !!screenName;
    const isDirectoryListable = merged.lifecycle_state === 'active'
      && merged.directory_visibility === 'listed'
      && !!screenName;

    // Derive public-safe coordinates once — shared by both projections.
    const locationGeo = await fetchProfessionalPublicGeo(db, merged.service_area_location_id, merged.location_id);

    // ── professionalProfilesPublic cleanup + write ──
    const existingProjections = await db.collection(PUBLIC)
      .where('identity_id', '==', identityId)
      .get();
    for (const doc of existingProjections.docs) {
      if (!isPubliclyListable || doc.id !== screenName) {
        await doc.ref.delete().catch(() => {});
      }
    }
    if (isPubliclyListable) {
      const projection = buildPublicProjection(identityId, profileId, merged, locationGeo);
      const projRef = db.collection(PUBLIC).doc(screenName!);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(projRef);
        if (snap.exists && snap.data()?.identity_id !== identityId) {
          throw new HttpsError('already-exists', 'That screen name is already taken');
        }
        tx.set(projRef, projection);
      });
    }

    // ── professionalDirectoryEntries cleanup + write ──
    // Independent of the public profile projection. Cleanup removes
    // any advert for this identity whose doc ID doesn't match the
    // target screen_name (orphaned by screen_name changes).
    const existingAdverts = await db.collection(DIRECTORY)
      .where('identity_id', '==', identityId)
      .get();
    for (const doc of existingAdverts.docs) {
      if (!isDirectoryListable || doc.id !== screenName) {
        await doc.ref.delete().catch(() => {});
      }
    }
    if (isDirectoryListable) {
      const advert = buildDirectoryEntry(identityId, profileId, merged, locationGeo);
      await db.collection(DIRECTORY).doc(screenName!).set(advert);
    }

    return { id: profileId, ...merged };
  },
);

// ── validateScreenName ──────────────────────────────────────
// Request: { screen_name, current_screen_name? }
// Returns: { available: boolean, reason?: string }
export const validateScreenName = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const identityId = await getIdentityId(request.auth.uid);
    const raw = request.data?.screen_name;
    const current = normaliseScreenName(request.data?.current_screen_name);

    const screenName = normaliseScreenName(raw);
    if (!screenName) {
      return { available: false, reason: 'Screen name is required' };
    }
    const fmtErr = validateScreenNameFormat(screenName);
    if (fmtErr) return { available: false, reason: fmtErr };

    // Unchanged from current → available
    if (current && screenName === current) {
      return { available: true };
    }
    // Check projection (doc ID == screen_name)
    const projSnap = await db.collection(PUBLIC).doc(screenName).get();
    if (projSnap.exists && projSnap.data()?.identity_id !== identityId) {
      return { available: false, reason: 'That screen name is already taken' };
    }
    return { available: true };
  },
);