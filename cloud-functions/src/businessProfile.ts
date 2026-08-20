// Business Profile — trusted server-side operations
// ───────────────────────────────────────────────────────────
// Mirrors the professionalProfile pattern. Businesses have no screen_name
// field, so the projection doc ID == business_id.
//
// The projection merges BusinessProfile public fields with
// Business.verification_state and Business.type (for the category subtitle),
// so the public route can render the full profile without reading the
// private businesses or businessProfiles collections.
//
// Caller must be a business admin (owner/admin role) to save.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId, hasBusinessRole } from './shared';

const PROFILES = 'businessProfiles';
const PUBLIC = 'businessProfilesPublic';
const BUSINESSES = 'businesses';

// Public-field allowlist for the projection.
// Merges BusinessProfile display fields with Business.verification_state
// and Business.type so the public view has everything it needs.
function buildPublicProjection(
  businessId: string,
  profileId: string,
  profileData: any,
  businessData: any,
): Record<string, any> {
  return {
    business_id: businessId,
    profile_id: profileId,
    name: profileData.name || businessData?.name || null,
    description: profileData.description || null,
    logo_url: profileData.logo_url || null,
    logo_media_id: profileData.logo_media_id || null,
    logo_position_x: profileData.logo_position_x ?? 0.5,
    logo_position_y: profileData.logo_position_y ?? 0.5,
    logo_zoom: profileData.logo_zoom ?? 1,
    cover_media_id: profileData.cover_media_id || null,
    cover_url: profileData.cover_url || null,
    cover_position_x: profileData.cover_position_x ?? 0.5,
    cover_position_y: profileData.cover_position_y ?? 0.5,
    cover_zoom: profileData.cover_zoom ?? 1,
    gallery_media_ids: Array.isArray(profileData.gallery_media_ids) ? profileData.gallery_media_ids : [],
    location: profileData.location || null,
    category: profileData.category || null,
    services: Array.isArray(profileData.services) ? profileData.services : [],
    professionals: Array.isArray(profileData.professionals) ? profileData.professionals : [],
    contact_email: profileData.contact_email || null,
    contact_phone: profileData.contact_phone || null,
    website: profileData.website || null,
    operating_hours: profileData.operating_hours || null,
    verification_state: businessData?.verification_state || 'not_verified',
    business_type: businessData?.type || null,
    visibility: profileData.visibility || 'public',
    lifecycle_state: profileData.lifecycle_state || 'draft',
    _updated_date: new Date().toISOString(),
  };
}

// ── saveBusinessProfile ──────────────────────────────────────
// Request: { data: { ...profile fields, business_id } }
// Returns: { id, ...data }
export const saveBusinessProfile = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await getIdentityId(request.auth.uid);
    const body = request.data || {};
    const businessId = body.business_id;

    if (!businessId) {
      throw new HttpsError('invalid-argument', 'business_id is required');
    }

    // Verify caller is a business admin (owner or admin role)
    const isAdmin = await hasBusinessRole(businessId, callerIdentityId, ['owner', 'admin']);
    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Only business admins can save the business profile');
    }

    // Find existing profile by business_id
    const existingSnap = await db.collection(PROFILES)
      .where('business_id', '==', businessId)
      .limit(1)
      .get();

    const existingDoc = existingSnap.docs[0];
    const profileId = existingDoc?.id || db.collection(PROFILES).doc().id;
    const existingData = existingDoc?.data() || {};

    // Merge incoming data over existing
    const merged = { ...existingData, ...body, business_id: businessId };
    delete (merged as any).id;

    // Write the private profile doc
    await db.collection(PROFILES).doc(profileId).set(merged, { merge: true });

    // Read the business record for verification_state + type
    const businessDoc = await db.collection(BUSINESSES).doc(businessId).get();
    const businessData = businessDoc.exists ? businessDoc.data() : null;

    // ── Maintain the public projection ──
    const isPubliclyListable = merged.visibility === 'public'
      && merged.lifecycle_state === 'active';

    const projRef = db.collection(PUBLIC).doc(businessId);
    if (isPubliclyListable) {
      const projection = buildPublicProjection(businessId, profileId, merged, businessData);
      await projRef.set(projection);
    } else {
      // Not eligible for public listing — remove any existing projection
      await projRef.delete().catch(() => {});
    }

    return { id: profileId, ...merged };
  },
);