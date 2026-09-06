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
import { fetchBusinessPublicGeo } from './geo';
import { indexContentInline, unindexContentInline } from './searchIndex';

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
    // Business projection doc ID == business_id (always present, no
    // screen_name complication). When ineligible, the projection is
    // deleted; when eligible, it is written/updated.
    const isPubliclyListable = merged.visibility === 'public'
      && merged.lifecycle_state === 'active';

    const projRef = db.collection(PUBLIC).doc(businessId);
    if (isPubliclyListable) {
      // Derive public-safe coordinates from the business location.
      const locationGeo = await fetchBusinessPublicGeo(db, merged.location_id);
      const projection = buildBusinessPublicProjection(
        businessId, profileId, merged, businessData, resolvedProfessionals, locationGeo,
      );
      await projRef.set(projection);

      // ── Cross-system search indexing (V2 §15.5) ──
      try {
        await indexContentInline(businessId, 'business', {
          contentType: 'business',
          title: merged.name || businessData?.name || '',
          description: merged.description || '',
          tags: Array.isArray(merged.services) ? merged.services.map((s: any) => s.label).filter(Boolean) : [],
          ownerId: businessId,
          visibility: 'public',
        });
      } catch (err) {
        console.error('search index failed for business', businessId, err);
      }
    } else {
      // Not eligible for public listing — remove any existing projection
      await projRef.delete().catch(() => {});
      // Remove from search index
      try { await unindexContentInline('business', businessId); } catch (e) { console.error('unindex business', businessId, e); }
    }

    return { id: profileId, ...merged };
  },
);