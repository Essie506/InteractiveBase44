// Current Identity Storage
// ───────────────────────────────────────────────────────────
// Stores the current authenticated user's Interactive Identity ID.
// Set by AuthContext after Firebase Auth + identity resolution.
// Used by services that need the current identity (e.g., userService
// updateUserState) when operating in Firebase mode.

let currentIdentityId = null;

export function setCurrentIdentityId(id) {
  currentIdentityId = id;
}

export function getCurrentIdentityId() {
  return currentIdentityId;
}