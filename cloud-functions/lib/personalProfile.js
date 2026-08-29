"use strict";
// Personal Profile — trusted server-side operations
// ───────────────────────────────────────────────────────────
// Mirrors the professionalProfile pattern:
// 1. savePersonalProfile — authoritative write to personalProfiles
//    + maintains the personalProfilesPublic projection (public fields
//    only). Enforces screen_name uniqueness using the projection doc ID
//    (doc ID == lowercased screen_name), so Firestore guarantees uniqueness.
// 2. validatePersonalScreenName — live format + uniqueness check for the edit form.
//
// Personal profiles have no private-only fields (no legal_name, no contact
// email/phone) — all display fields are public. The projection enforces
// screen_name uniqueness and provides a stable public read path that
// does not touch the private collection.
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePersonalScreenName = exports.savePersonalProfile = void 0;
const https_1 = require("firebase-functions/v2/https");
const shared_1 = require("./shared");
const personalProfileProjection_1 = require("./personalProfileProjection");
const PROFILES = 'personalProfiles';
const PUBLIC = 'personalProfilesPublic';
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
// Projection logic extracted to ./personalProfileProjection — shared with backfillProfiles.
// ── savePersonalProfile ──────────────────────────────────────
// Request: { data: { ...profile fields, identity_id } }
// Returns: { id, ...data }
exports.savePersonalProfile = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await (0, shared_1.getIdentityId)(request.auth.uid);
    const body = request.data || {};
    const identityId = body.identity_id;
    if (!identityId || identityId !== callerIdentityId) {
        throw new https_1.HttpsError('permission-denied', 'You can only save your own personal profile');
    }
    // Validate screen_name format if provided
    const screenName = normaliseScreenName(body.screen_name);
    if (screenName) {
        const fmtErr = validateScreenNameFormat(screenName);
        if (fmtErr)
            throw new https_1.HttpsError('invalid-argument', fmtErr);
    }
    // Find existing profile by identity_id
    const existingSnap = await shared_1.db.collection(PROFILES)
        .where('identity_id', '==', identityId)
        .limit(1)
        .get();
    const existingDoc = existingSnap.docs[0];
    const profileId = existingDoc?.id || shared_1.db.collection(PROFILES).doc().id;
    const existingData = existingDoc?.data() || {};
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
    // Delete any projection doc tied to this profile under an old screen name.
    const oldScreenName = normaliseScreenName(existingData.screen_name);
    if (oldScreenName && oldScreenName !== screenName) {
        await shared_1.db.collection(PUBLIC).doc(oldScreenName).delete().catch(() => { });
    }
    const isPubliclyListable = merged.visibility === 'public'
        && merged.lifecycle_state === 'active'
        && !!screenName;
    if (isPubliclyListable) {
        const projection = (0, personalProfileProjection_1.buildPersonalPublicProjection)(identityId, profileId, merged);
        const projRef = shared_1.db.collection(PUBLIC).doc(screenName);
        // Transaction: re-check uniqueness atomically with the write
        await shared_1.db.runTransaction(async (tx) => {
            const snap = await tx.get(projRef);
            if (snap.exists && snap.data()?.identity_id !== identityId) {
                throw new https_1.HttpsError('already-exists', 'That screen name is already taken');
            }
            tx.set(projRef, projection);
        });
    }
    else {
        // Not eligible for public listing — remove any existing projection
        if (screenName) {
            await shared_1.db.collection(PUBLIC).doc(screenName).delete().catch(() => { });
        }
    }
    return { id: profileId, ...merged };
});
// ── validatePersonalScreenName ───────────────────────────────
// Request: { screen_name, current_screen_name? }
// Returns: { available: boolean, reason?: string }
exports.validatePersonalScreenName = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
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
//# sourceMappingURL=personalProfile.js.map