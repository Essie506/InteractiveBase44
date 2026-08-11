/**
 * Firebase Identity Mapping Repository
 * ───────────────────────────────────────────────────────────
 * Collection: identityMappings/{authUid}
 * Doc ID == Firebase Auth UID.
 * Field: identity_id → stable Interactive Identity ID.
 *
 * This is the indirection layer that decouples Firebase Auth UIDs
 * from Interactive domain identity references. Domain records
 * (profiles, locations, settings, etc.) reference the Interactive
 * Identity ID, not the Auth UID, so authentication providers can
 * change without altering domain identity keys.
 *
 * M1.1 status: preparation only. Not wired into authService.
 * Base44 remains the active backend for all auth operations.
 */

import { db } from '@/firebase/firebaseClient';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const COLLECTION = 'identityMappings';

/**
 * Resolve the stable Interactive Identity ID for a Firebase Auth UID.
 * Returns null if no mapping exists.
 */
export async function getIdentityId(authUid) {
  const snap = await getDoc(doc(db, COLLECTION, authUid));
  if (!snap.exists()) return null;
  return snap.data().identity_id;
}

/**
 * Create the identity mapping. Called by a trusted Cloud Function
 * on first sign-in — not callable by ordinary clients (security
 * rules deny all client writes to this collection).
 */
export async function createIdentityMapping(authUid, identityId) {
  await setDoc(doc(db, COLLECTION, authUid), {
    identity_id: identityId,
    auth_provider: 'firebase',
  });
  return { auth_uid: authUid, identity_id: identityId };
}