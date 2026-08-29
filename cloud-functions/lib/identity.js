"use strict";
// resolveIdentity — Trusted identity bootstrap
// ───────────────────────────────────────────────────────────
// Verifies Firebase Auth via Firebase infrastructure (request.auth).
// Resolves (or creates) the Interactive Identity mapping.
//
// Resolution order:
//   1. Existing mapping by auth_uid → return (idempotent)
//   2. Require email verification for email-based matching
//   3. Existing mapping by email → account linking
//   4. Migrated Firestore user by email → preserve existing Interactive Identity ID
//   5. No match → generate new Interactive Identity ID
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveIdentity = void 0;
const https_1 = require("firebase-functions/v2/https");
const crypto_1 = require("crypto");
const shared_1 = require("./shared");
exports.resolveIdentity = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const authUid = request.auth.uid;
    const token = request.auth.token;
    const email = token.email;
    const emailVerified = token.email_verified === true;
    const provider = token.firebase?.sign_in_provider;
    const providers = provider ? [provider] : [];
    if (!email) {
        throw new https_1.HttpsError('invalid-argument', 'Email is required for identity resolution');
    }
    const canonicalEmail = email.toLowerCase().trim();
    // Step 1: Check identityMappings/{authUid} (idempotent)
    const mappingRef = shared_1.db.collection('identityMappings').doc(authUid);
    const mappingDoc = await mappingRef.get();
    if (mappingDoc.exists) {
        const data = mappingDoc.data();
        const identityId = data.identity_id;
        // Sync denormalized role from users/{identityId} to identityMappings.
        // Storage Rules use this role for admin checks within the
        // 2-Firestore-access limit — without it, isAdmin() would need
        // a separate users/{identityId} access, pushing total to 3.
        const userDoc = await shared_1.db.collection('users').doc(identityId).get();
        if (userDoc.exists) {
            const currentRole = userDoc.data().role || 'user';
            if (data.role !== currentRole) {
                await mappingRef.update({ role: currentRole });
            }
        }
        return {
            identityId,
            isNew: false,
            isExisting: true,
            isLinked: false,
            email,
            emailVerified,
        };
    }
    // Step 2: Require email verification for email-based matching
    if (!emailVerified) {
        throw new https_1.HttpsError('permission-denied', 'EMAIL_NOT_VERIFIED');
    }
    // Step 3: Check identityMappings by email (account linking)
    const mappingsByEmail = await shared_1.db
        .collection('identityMappings')
        .where('email', '==', canonicalEmail)
        .get();
    let identityId;
    let isNew = false;
    let isLinked = false;
    if (!mappingsByEmail.empty) {
        const identityIds = new Set();
        mappingsByEmail.forEach((doc) => {
            identityIds.add(doc.data().identity_id);
        });
        if (identityIds.size > 1) {
            throw new https_1.HttpsError('already-exists', 'AMBIGUOUS_EMAIL_MAPPING: multiple identities found for this email');
        }
        identityId = mappingsByEmail.docs[0].data().identity_id;
        isLinked = true;
    }
    else {
        // Step 4: Look up migrated Firestore user by email
        const usersByEmail = await shared_1.db
            .collection('users')
            .where('email', '==', canonicalEmail)
            .get();
        if (usersByEmail.size > 1) {
            throw new https_1.HttpsError('already-exists', 'AMBIGUOUS_EMAIL: multiple users found with this email');
        }
        if (usersByEmail.size === 1) {
            identityId = usersByEmail.docs[0].id;
            isNew = false;
        }
        else {
            // Step 5: New user
            identityId = 'int_' + (0, crypto_1.randomUUID)();
            isNew = true;
        }
    }
    // Step 6: Create mapping (and user record for new identities)
    // Determine the role for the identity mapping:
    //   - New users: 'user'
    //   - Existing/migrated users: read current role from users/{identityId}
    let mappingRole = 'user';
    if (!isNew) {
        const userDoc = await shared_1.db.collection('users').doc(identityId).get();
        if (userDoc.exists) {
            mappingRole = userDoc.data().role || 'user';
        }
    }
    const batch = shared_1.db.batch();
    batch.set(mappingRef, {
        auth_uid: authUid,
        identity_id: identityId,
        email: canonicalEmail,
        email_verified: emailVerified,
        is_new_identity: isNew,
        linked_providers: providers,
        auth_provider: 'firebase',
        role: mappingRole,
    });
    if (isNew) {
        batch.set(shared_1.db.collection('users').doc(identityId), {
            email,
            role: 'user',
            onboarding_status: 'not_started',
            active_context: 'personal',
            professional_activated: false,
            terms_accepted: false,
        });
    }
    await batch.commit();
    return {
        identityId,
        isNew,
        isExisting: !isNew,
        isLinked,
        email,
        emailVerified,
    };
});
//# sourceMappingURL=identity.js.map