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
import { db, allowedOrigins, getIdentityId, hasBusinessRole, resolveProfessionalReferences } from './shared';
import { buildBusinessPublicProjection } from './businessProfileProjection';

const PROFILES = 'businessProfiles';
const PUBLIC = 'businessProfilesPublic';
const BUSINESSES = 'businesses';

// Projection logic extracted to ./businessProfileProjection — shared with backfillProfiles.

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

    // ── Resolve professional references for the public projection ──
    // The private profile stores [{ identity_id }] references. The public
    // projection carries resolved display info sourced from
    // professionalProfilesPublic so guests can view staff cards without
    // reading private collections. No professional data is duplicated
    // into the private businessProfile.
    const resolvedProfessionals = await resolveProfessionalReferences(merged.professionals);

    // ── Maintain the public projection ──
    const isPubliclyListable = merged.visibility === 'public'
      && merged.lifecycle_state === 'active';

    const projRef = db.collection(PUBLIC).doc(businessId);
    if (isPubliclyListable) {
      const projection = buildBusinessPublicProjection(
        businessId, profileId, merged, businessData, resolvedProfessionals,
      );
      await projRef.set(projection);
    } else {
      // Not eligible for public listing — remove any existing projection
      await projRef.delete().catch(() => {});
    }

    return { id: profileId, ...merged };
  },
);