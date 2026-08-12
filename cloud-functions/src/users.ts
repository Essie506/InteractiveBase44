// Protected user lookup + participant resolution — server-only
// ───────────────────────────────────────────────────────────
// findUserByEmail: Respects recipient search_visibility privacy setting.
//   Returns minimal display info only — no sensitive data.
//
// resolveParticipants: Resolves display info for a set of identities.
//   Does not expose private user records to clients.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId, isAdmin } from './shared';

// ── findUserByEmail ─────────────────────────────────────────

export const findUserByEmail = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await getIdentityId(request.auth.uid);
    const { email } = request.data || {};

    if (!email) {
      throw new HttpsError('invalid-argument', 'email required');
    }

    const canonicalEmail = email.toLowerCase().trim();

    // Look up user by email
    const userSnap = await db.collection('users')
      .where('email', '==', canonicalEmail)
      .limit(1)
      .get();

    if (userSnap.empty) {
      return { found: false };
    }

    const userDoc = userSnap.docs[0];
    const userData = userDoc.data();

    // Check search_visibility privacy gate
    const settingsSnap = await db.collection('userSettings')
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
  }
);

// ── resolveParticipants ────────────────────────────────────

export const resolveParticipants = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await getIdentityId(request.auth.uid);
    const { identity_ids } = request.data || {};

    if (!identity_ids || !Array.isArray(identity_ids)) {
      throw new HttpsError('invalid-argument', 'identity_ids array required');
    }

    const results: Record<string, any> = {};

    for (const id of identity_ids) {
      try {
        const userDoc = await db.collection('users').doc(id).get();
        if (userDoc.exists) {
          const userData = userDoc.data()!;
          results[id] = {
            identity_id: id,
            display_name: userData.display_name || userData.email,
            avatar_url: userData.avatar_url || null,
          };
        } else {
          results[id] = { identity_id: id, display_name: 'Unknown User', avatar_url: null };
        }
      } catch {
        results[id] = { identity_id: id, display_name: 'Unknown User', avatar_url: null };
      }
    }

    return { results };
  }
);

// ── setUserRole ────────────────────────────────────────────
// Admin-only. Updates a user's role and syncs the denormalized
// role to all identityMappings documents for that identity.
// Storage Rules use identityMappings/{uid}.role for admin checks
// within the 2-Firestore-access limit.
export const setUserRole = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const callerIdentityId = await getIdentityId(request.auth.uid);

    // Only admins can change roles
    if (!(await isAdmin(callerIdentityId))) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { identity_id, role } = request.data || {};
    if (!identity_id || !role) {
      throw new HttpsError('invalid-argument', 'identity_id and role are required');
    }

    if (!['user', 'admin'].includes(role)) {
      throw new HttpsError('invalid-argument', 'Invalid role. Must be "user" or "admin"');
    }

    const batch = db.batch();

    // Update users/{identityId}.role (authoritative source)
    batch.update(db.collection('users').doc(identity_id), { role });

    // Sync identityMappings/{uid}.role for all mappings with this identity
    const mappingsSnap = await db.collection('identityMappings')
      .where('identity_id', '==', identity_id)
      .get();

    for (const mappingDoc of mappingsSnap.docs) {
      batch.update(mappingDoc.ref, { role });
    }

    await batch.commit();

    return { identity_id, role, mappings_updated: mappingsSnap.size };
  }
);