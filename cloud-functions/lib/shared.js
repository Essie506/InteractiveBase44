"use strict";
// Shared helpers for Interactive Cloud Functions
// ───────────────────────────────────────────────────────────
// Admin SDK init, CORS config, and reusable auth/identity helpers.
// All onCall functions import from here to avoid duplication.
Object.defineProperty(exports, "__esModule", { value: true });
exports.allowedOrigins = exports.db = void 0;
exports.getIdentityId = getIdentityId;
exports.requireIdentity = requireIdentity;
exports.isAdmin = isAdmin;
exports.requireAdmin = requireAdmin;
exports.isBlocked = isBlocked;
exports.getBusinessMembership = getBusinessMembership;
exports.hasBusinessRole = hasBusinessRole;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
(0, app_1.initializeApp)();
exports.db = (0, firestore_1.getFirestore)();
// ── CORS allowed origins ───────────────────────────────────
// Matches:
//   http://localhost           (no port)
//   http://localhost:5182     (any port — local Vite dev)
//   https://*.base44.app       (Base44 Preview / deployed frontends)
// To add a production origin, append |^https:\/\/your-domain\.com$ below.
exports.allowedOrigins = /^http:\/\/localhost(:\d+)?$|^https:\/\/.*\.base44\.app$/;
// ── Identity helpers ───────────────────────────────────────
/** Resolves the Interactive Identity ID from a Firebase Auth UID. */
async function getIdentityId(authUid) {
    const mapping = await exports.db.collection('identityMappings').doc(authUid).get();
    if (!mapping.exists) {
        throw new https_1.HttpsError('unauthenticated', 'Identity mapping not found');
    }
    return mapping.data().identity_id;
}
/** Returns the caller's Interactive Identity ID, or throws unauthenticated. */
async function requireIdentity(authUid) {
    return getIdentityId(authUid);
}
/** Checks if an identity has admin role. */
async function isAdmin(identityId) {
    const user = await exports.db.collection('users').doc(identityId).get();
    if (!user.exists)
        return false;
    return user.data().role === 'admin';
}
/** Requires the caller to be an admin, throws permission-denied otherwise. */
async function requireAdmin(authUid) {
    const identityId = await getIdentityId(authUid);
    if (!(await isAdmin(identityId))) {
        throw new https_1.HttpsError('permission-denied', 'Admin access required');
    }
    return identityId;
}
// ── Block state ────────────────────────────────────────────
/** Checks if a block relationship exists between two identities (either direction). */
async function isBlocked(identityA, identityB) {
    const aBlocksB = await exports.db.collection('blockRecords')
        .where('blocker_id', '==', identityA)
        .where('blocked_id', '==', identityB)
        .where('status', '==', 'active')
        .limit(1)
        .get();
    if (!aBlocksB.empty)
        return true;
    const bBlocksA = await exports.db.collection('blockRecords')
        .where('blocker_id', '==', identityB)
        .where('blocked_id', '==', identityA)
        .where('status', '==', 'active')
        .limit(1)
        .get();
    return !bBlocksA.empty;
}
// ── Business membership ────────────────────────────────────
/** Gets a business membership record, or null if not a member. */
async function getBusinessMembership(businessId, identityId) {
    const membershipId = `${businessId}_${identityId}`;
    const doc = await exports.db.collection('businessMemberships').doc(membershipId).get();
    if (!doc.exists)
        return null;
    const data = doc.data();
    return { role: data.role, lifecycle_state: data.lifecycle_state };
}
/** Checks if an identity is an active member of a business with the given role(s). */
async function hasBusinessRole(businessId, identityId, roles) {
    const membership = await getBusinessMembership(businessId, identityId);
    if (!membership)
        return false;
    if (membership.lifecycle_state !== 'active')
        return false;
    return roles.includes(membership.role);
}
//# sourceMappingURL=shared.js.map