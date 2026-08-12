// Protected user lookup + participant resolution — server-only
// ───────────────────────────────────────────────────────────
// findUserByEmail: Respects recipient search_visibility privacy setting.
//   Returns minimal display info only — no sensitive data.
//
// resolveParticipants: Resolves display info for a set of identities.
//   Does not expose private user records to clients.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId } from './shared';

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