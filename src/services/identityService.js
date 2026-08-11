// Identity Resolution Service
// ───────────────────────────────────────────────────────────
// Calls the ResolveIdentity backend function to resolve (or create)
// the Interactive Identity mapping for a Firebase-authenticated user.
//
// M2 status: IMPLEMENTED, NOT YET ACTIVE.
// The cutover is blocked by §17 (see M2 completion report).

import { base44 } from '@/api/base44Client';

const IDENTITY_STORAGE_KEY = 'interactive_identity_id';

/**
 * Resolves the Interactive Identity for a Firebase-authenticated user.
 * Calls the trusted ResolveIdentity backend function with the Firebase ID token.
 *
 * @param {string} idToken — Firebase ID token from the current Firebase user
 * @returns {Promise<{ identityId: string, isNew: boolean, isExisting: boolean, isLinked: boolean }>}
 */
export async function resolveIdentity(idToken) {
  const response = await base44.functions.invoke('ResolveIdentity', { idToken });
  return response.data;
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