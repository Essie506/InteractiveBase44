"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveBusinessProfile = void 0;
const https_1 = require("firebase-functions/v2/https");
const shared_1 = require("./shared");
const businessProfileProjection_1 = require("./businessProfileProjection");
const PROFILES = 'businessProfiles';
const PUBLIC = 'businessProfilesPublic';
const BUSINESSES = 'businesses';
// Projection logic extracted to ./businessProfileProjection — shared with backfillProfiles.
// ── saveBusinessProfile ──────────────────────────────────────
// Request: { data: { ...profile fields, business_id } }
// Returns: { id, ...data }
exports.saveBusinessProfile = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await (0, shared_1.getIdentityId)(request.auth.uid);
    const body = request.data || {};
    const businessId = body.business_id;
    if (!businessId) {
        throw new https_1.HttpsError('invalid-argument', 'business_id is required');
    }
    // Verify caller is a business admin (owner or admin role)
    const isAdmin = await (0, shared_1.hasBusinessRole)(businessId, callerIdentityId, ['owner', 'admin']);
    if (!isAdmin) {
        throw new https_1.HttpsError('permission-denied', 'Only business admins can save the business profile');
    }
    // Find existing profile by business_id
    const existingSnap = await shared_1.db.collection(PROFILES)
        .where('business_id', '==', businessId)
        .limit(1)
        .get();
    const existingDoc = existingSnap.docs[0];
    const profileId = existingDoc?.id || shared_1.db.collection(PROFILES).doc().id;
    const existingData = existingDoc?.data() || {};
    // Merge incoming data over existing
    const merged = { ...existingData, ...body, business_id: businessId };
    delete merged.id;
    // Write the private profile doc
    await shared_1.db.collection(PROFILES).doc(profileId).set(merged, { merge: true });
    // Read the business record for verification_state + type
    const businessDoc = await shared_1.db.collection(BUSINESSES).doc(businessId).get();
    const businessData = businessDoc.exists ? businessDoc.data() : null;
    // ── Maintain the public projection ──
    const isPubliclyListable = merged.visibility === 'public'
        && merged.lifecycle_state === 'active';
    const projRef = shared_1.db.collection(PUBLIC).doc(businessId);
    if (isPubliclyListable) {
        const projection = (0, businessProfileProjection_1.buildBusinessPublicProjection)(businessId, profileId, merged, businessData);
        await projRef.set(projection);
    }
    else {
        // Not eligible for public listing — remove any existing projection
        await projRef.delete().catch(() => { });
    }
    return { id: profileId, ...merged };
});
//# sourceMappingURL=businessProfile.js.map