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
//      login). No Base44 dependency — the Firestore security rules allow
//      the authenticated user to read their own mapping (uid() == authUid).
//   2. If no mapping exists, call the ResolveIdentity backend function
//      (first-time login / migration). This is a trusted server operation
//      that verifies the Firebase ID token and creates the mapping. It
//      does not require a Base44 frontend auth token — the Firebase token
//      is the auth proof.

import { getIdentityId } from '@/data/firebase/firebaseIdentityRepository';

const IDENTITY_STORAGE_KEY = 'interactive_identity_id';

/**
 * Resolves the Interactive Identity for a Firebase-authenticated user.
 *
 * @param {string} authUid — Firebase Auth UID
 * @param {string} idToken — Firebase ID token from the current Firebase user
 * @returns {Promise<{ identityId: string, isNew: boolean, isExisting: boolean, isLinked: boolean }>}
 */
export async function resolveIdentity(authUid, idToken) {
  // Step 1: Try Firestore directly (subsequent login — no Base44 call).
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

  // Step 2: First-time login — call ResolveIdentity via direct HTTP.
  // Uses the standard Base44 function URL format (/functions/{name}) which
  // does not require the Base44 app ID. The function is a trusted server
  // operation that verifies the Firebase ID token and creates the
  // identityMappings/{authUid} document in Firestore. No Base44 SDK
  // initialization, no Base44 auth token, no VITE_BASE44_APP_ID needed.
  const response = await fetch('/functions/ResolveIdentity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: 'Unknown error', code: 'UNKNOWN' }));
    const err = new Error(errorBody.error || `ResolveIdentity failed: ${response.status}`);
    err.code = errorBody.code || 'UNKNOWN';
    throw err;
  }

  return response.json();
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