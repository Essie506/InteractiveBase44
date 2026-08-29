"use strict";
// Protected user lookup + participant resolution — server-only
// ───────────────────────────────────────────────────────────
// findUserByEmail: Respects recipient search_visibility privacy setting.
//   Returns minimal display info only — no sensitive data.
//
// resolveParticipants: Resolves display info for a set of identities.
//   Does not expose private user records to clients.
Object.defineProperty(exports, "__esModule", { value: true });
exports.setUserRole = exports.resolveParticipants = exports.findUserByEmail = void 0;
const https_1 = require("firebase-functions/v2/https");
const shared_1 = require("./shared");
// ── findUserByEmail ─────────────────────────────────────────
exports.findUserByEmail = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    await (0, shared_1.getIdentityId)(request.auth.uid);
    const { email } = request.data || {};
    if (!email) {
        throw new https_1.HttpsError('invalid-argument', 'email required');
    }
    const canonicalEmail = email.toLowerCase().trim();
    // Look up user by email
    const userSnap = await shared_1.db.collection('users')
        .where('email', '==', canonicalEmail)
        .limit(1)
        .get();
    if (userSnap.empty) {
        return { found: false };
    }
    const userDoc = userSnap.docs[0];
    const userData = userDoc.data();
    // Check search_visibility privacy gate
    const settingsSnap = await shared_1.db.collection('userSettings')
        .where('identity_id', '==', userDoc.id)
        .limit(1)
        .get();
    if (!settingsSnap.empty) {
        const settings = settingsSnap.docs[0].data();
        if (settings.search_visibility === false) {
            return { found: false };
        }
    }
    // Return minimal display info only
    return {
        found: true,
        identity_id: userDoc.id,
        display_name: userData.display_name || userData.email,
        avatar_url: userData.avatar_url || null,
    };
});
// ── resolveParticipants ────────────────────────────────────
exports.resolveParticipants = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    await (0, shared_1.getIdentityId)(request.auth.uid);
    const { identity_ids } = request.data || {};
    if (!identity_ids || !Array.isArray(identity_ids)) {
        throw new https_1.HttpsError('invalid-argument', 'identity_ids array required');
    }
    const results = {};
    for (const id of identity_ids) {
        try {
            const userDoc = await shared_1.db.collection('users').doc(id).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                results[id] = {
                    identity_id: id,
                    display_name: userData.display_name || userData.email,
                    avatar_url: userData.avatar_url || null,
                };
            }
            else {
                results[id] = { identity_id: id, display_name: 'Unknown User', avatar_url: null };
            }
        }
        catch {
            results[id] = { identity_id: id, display_name: 'Unknown User', avatar_url: null };
        }
    }
    return { results };
});
// ── setUserRole ────────────────────────────────────────────
// Admin-only. Updates a user's role and syncs the denormalized
// role to all identityMappings documents for that identity.
// Storage Rules use identityMappings/{uid}.role for admin checks
// within the 2-Firestore-access limit.
exports.setUserRole = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const callerIdentityId = await (0, shared_1.getIdentityId)(request.auth.uid);
    // Only admins can change roles
    if (!(await (0, shared_1.isAdmin)(callerIdentityId))) {
        throw new https_1.HttpsError('permission-denied', 'Admin access required');
    }
    const { identity_id, role } = request.data || {};
    if (!identity_id || !role) {
        throw new https_1.HttpsError('invalid-argument', 'identity_id and role are required');
    }
    if (!['user', 'admin'].includes(role)) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid role. Must be "user" or "admin"');
    }
    const batch = shared_1.db.batch();
    // Update users/{identityId}.role (authoritative source)
    batch.update(shared_1.db.collection('users').doc(identity_id), { role });
    // Sync identityMappings/{uid}.role for all mappings with this identity
    const mappingsSnap = await shared_1.db.collection('identityMappings')
        .where('identity_id', '==', identity_id)
        .get();
    for (const mappingDoc of mappingsSnap.docs) {
        batch.update(mappingDoc.ref, { role });
    }
    await batch.commit();
    return { identity_id, role, mappings_updated: mappingsSnap.size };
});
//# sourceMappingURL=users.js.map