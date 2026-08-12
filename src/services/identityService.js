// Identity Resolution Service
// ───────────────────────────────────────────────────────────
// Resolves (or creates) the Interactive Identity mapping for a
// Firebase-authenticated user.
//
// Architecture:
//   Firebase Auth UID → identityMappings/{authUid} → Interactive Identity ID → Firestore users/{identityId}
//
// Resolution order:
//   1. Read identityMappings/{authUid} from Firestore directly (subsequent
//      login). No Cloud Function call — the Firestore security rules allow
//      the authenticated user to read their own mapping (uid() == authUid).
//   2. If no mapping exists, call the resolveIdentity Firebase Cloud
//      Function (first-time login / migration). This is a trusted server
//      operation that uses Firebase Auth context (verified by Firebase
//      infrastructure) and the Firebase Admin SDK to create the mapping.
//      The client never receives service-account credentials.
//
// The Firebase Functions Web SDK automatically passes the user's ID token
// to the onCall function — no manual token handling is needed.

import { httpsCallable } from 'firebase/functions';
import { getIdentityId } from '@/data/firebase/firebaseIdentityRepository';
import { getFunctionsInstance } from '@/firebase/firebaseClient';

const IDENTITY_STORAGE_KEY = 'interactive_identity_id';

/**
 * Resolves the Interactive Identity for a Firebase-authenticated user.
 *
 * @param {string} authUid — Firebase Auth UID
 * @param {string} _idToken — Firebase ID token (unused; the Firebase
 *   Functions SDK passes it automatically to the onCall function)
 * @returns {Promise<{ identityId: string, isNew: boolean, isExisting: boolean, isLinked: boolean }>}
 */
export async function resolveIdentity(authUid, _idToken) {
  // Step 1: Try Firestore directly (subsequent login — no Cloud Function call).
  // The Firestore security rules allow the authenticated user to read
  // their own identityMappings/{authUid} document (uid() == authUid).
  const existingIdentityId = await getIdentityId(authUid);
  if (existingIdentityId) {
    return {
      identityId: existingIdentityId,
      isNew: false,
      isExisting: true,
      isLinked: false,
    };
  }

  // Step 2: First-time login — call the resolveIdentity Firebase Cloud Function.
  // The Firebase Functions SDK automatically passes the user's ID token;
  // the onCall function verifies it via Firebase infrastructure (context.auth).
  // The function uses the Firebase Admin SDK to read/write Firestore,
  // bypassing security rules. No service-account credentials reach the client.
  const functions = getFunctionsInstance();
  const callable = httpsCallable(functions, 'resolveIdentity');
  const result = await callable();
  return result.data;
}

/**
 * Stores the resolved Interactive Identity ID in localStorage.
 * Used for session persistence during the hybrid M2 state.
 */
export function storeIdentityId(identityId) {
  localStorage.setItem(IDENTITY_STORAGE_KEY, identityId);
}

/**
 * Retrieves the stored Interactive Identity ID from localStorage.
 */
export function getStoredIdentityId() {
  return localStorage.getItem(IDENTITY_STORAGE_KEY);
}

/**
 * Clears the stored Interactive Identity ID (used on logout).
 */
export function clearStoredIdentityId() {
  localStorage.removeItem(IDENTITY_STORAGE_KEY);
}