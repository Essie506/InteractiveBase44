"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateScreenName = exports.saveProfessionalProfile = void 0;
exports.buildPublicProjection = buildPublicProjection;
const https_1 = require("firebase-functions/v2/https");
const shared_1 = require("./shared");
const geo_1 = require("./geo");
const PROFILES = 'professionalProfiles';
const PUBLIC = 'professionalProfilesPublic';
const SCREEN_NAME_RE = /^[a-z0-9_]{3,20}$/;
function normaliseScreenName(raw) {
    if (!raw)
        return null;
    const s = String(raw).toLowerCase().trim();
    if (!s)
        return null;
    return s;
}
function validateScreenNameFormat(s) {
    if (!SCREEN_NAME_RE.test(s)) {
        return 'Screen name must be 3-20 characters: lowercase letters, numbers, and underscores.';
    }
    return null;
}
// Public-field allowlist for the projection.
function buildPublicProjection(identityId, profileId, data, locationGeo) {
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
// ── saveProfessionalProfile ──────────────────────────────────
// Request: { data: { ...profile fields, identity_id } }
// Returns: { id, ...data }
exports.saveProfessionalProfile = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await (0, shared_1.getIdentityId)(request.auth.uid);
    const body = request.data || {};
    const identityId = body.identity_id;
    if (!identityId || identityId !== callerIdentityId) {
        throw new https_1.HttpsError('permission-denied', 'You can only save your own professional profile');
    }
    // Find existing profile by identity_id
    const existingSnap = await shared_1.db.collection(PROFILES)
        .where('identity_id', '==', identityId)
        .limit(1)
        .get();
    const existingDoc = existingSnap.docs[0];
    const profileId = existingDoc?.id || shared_1.db.collection(PROFILES).doc().id;
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
        if (fmtErr)
            throw new https_1.HttpsError('invalid-argument', fmtErr);
    }
    // Merge incoming data over existing (client sends full field set)
    const merged = { ...existingData, ...body, identity_id: identityId, screen_name: screenName };
    delete merged.id;
    // ── screen_name uniqueness ──
    // The projection doc ID == lowercased screen_name. If a projection
    // already exists for a different identity, refuse.
    if (screenName) {
        const projRef = shared_1.db.collection(PUBLIC).doc(screenName);
        const projSnap = await projRef.get();
        if (projSnap.exists && projSnap.data()?.identity_id !== identityId) {
            throw new https_1.HttpsError('already-exists', 'That screen name is already taken');
        }
    }
    // Write the private profile doc
    await shared_1.db.collection(PROFILES).doc(profileId).set(merged, { merge: true });
    // ── Maintain the public projection (race-free) ──
    const isPubliclyListable = merged.visibility === 'public'
        && merged.lifecycle_state === 'active'
        && !!screenName;
    // Defensive cleanup: query ALL existing projections for this identity
    // and delete any that don't match the target screen name. This catches
    // projections orphaned by screen_name changes, partial updates that
    // previously lost the screen_name, or direct writes to the public
    // collection that bypassed the cloud function.
    const existingProjections = await shared_1.db.collection(PUBLIC)
        .where('identity_id', '==', identityId)
        .get();
    for (const doc of existingProjections.docs) {
        if (!isPubliclyListable || doc.id !== screenName) {
            await doc.ref.delete().catch(() => { });
        }
    }
    if (isPubliclyListable) {
        // Derive public-safe coordinates from the service area / location.
        // Only exposes coordinates when precision_level is 'exact' or
        // 'approximate' (user consented). city_only/region_only never
        // expose their potentially private stored coordinates.
        const locationGeo = await (0, geo_1.fetchProfessionalPublicGeo)(shared_1.db, merged.service_area_location_id, merged.location_id);
        const projection = buildPublicProjection(identityId, profileId, merged, locationGeo);
        const projRef = shared_1.db.collection(PUBLIC).doc(screenName);
        // Transaction: re-check uniqueness atomically with the write
        // to prevent two identities claiming the same screen name.
        await shared_1.db.runTransaction(async (tx) => {
            const snap = await tx.get(projRef);
            if (snap.exists && snap.data()?.identity_id !== identityId) {
                throw new https_1.HttpsError('already-exists', 'That screen name is already taken');
            }
            tx.set(projRef, projection);
        });
    }
    return { id: profileId, ...merged };
});
// ── validateScreenName ──────────────────────────────────────
// Request: { screen_name, current_screen_name? }
// Returns: { available: boolean, reason?: string }
exports.validateScreenName = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const identityId = await (0, shared_1.getIdentityId)(request.auth.uid);
    const raw = request.data?.screen_name;
    const current = normaliseScreenName(request.data?.current_screen_name);
    const screenName = normaliseScreenName(raw);
    if (!screenName) {
        return { available: false, reason: 'Screen name is required' };
    }
    const fmtErr = validateScreenNameFormat(screenName);
    if (fmtErr)
        return { available: false, reason: fmtErr };
    // Unchanged from current → available
    if (current && screenName === current) {
        return { available: true };
    }
    // Check projection (doc ID == screen_name)
    const projSnap = await shared_1.db.collection(PUBLIC).doc(screenName).get();
    if (projSnap.exists && projSnap.data()?.identity_id !== identityId) {
        return { available: false, reason: 'That screen name is already taken' };
    }
    return { available: true };
});
//# sourceMappingURL=professionalProfile.js.map