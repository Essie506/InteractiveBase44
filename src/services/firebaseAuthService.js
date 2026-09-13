// Firebase Authentication Service
// ───────────────────────────────────────────────────────────
// Wraps Firebase Authentication operations behind an Interactive-facing
// contract matching the existing authService API.
//
// M3 status: ACTIVE.
// All Firebase Auth operations go through getAuthInstance(), which reads
// the live-binding firebaseAuth export at call time and throws if it
// has not been initialised. This guarantees no auth operation can
// execute before initFirebase() completes, and every operation uses
// the current initialised Auth instance — never a stale or undefined value.

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification as firebaseSendEmailVerification,
  confirmPasswordReset,
  updateProfile as firebaseUpdateProfile,
  reload
} from 'firebase/auth';
import { firebaseAuth, isConfigured } from '@/firebase/firebaseClient';

const googleProvider = new GoogleAuthProvider();

/**
 * Returns the current Firebase Auth instance, or throws if Firebase
 * has not been initialised.
 *
 * This is the single safe entry point for all auth operations. It
 * reads the live-binding `firebaseAuth` export at call time (not at
 * module-load time), so it always sees the value set by initFirebase().
 * The `isConfigured` flag and the `firebaseAuth` instance are checked
 * together — they are set atomically in initFirebase(), so if either
 * is missing the service is not ready.
 *
 * @returns {import('firebase/auth').Auth}
 * @throws {Error} if Firebase is not configured or the Auth instance is unavailable.
 */
function getAuthInstance() {
  if (!isConfigured || !firebaseAuth) {
    throw new Error(
      'Firebase Auth is not initialised. Ensure VITE_FIREBASE_* env vars are set ' +
      'or initFirebase() has completed before calling any auth operation.'
    );
  }
  return firebaseAuth;
}

// ── Registration ──────────────────────────────────────────

/**
 * Register a new user with email and password.
 * @param {{ email: string, password: string }} params
 * @returns {Promise<import('firebase/auth').User>}
 */
export async function register({ email, password }) {
  const auth = getAuthInstance();
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

// ── Email/Password Login ───────────────────────────────────

/**
 * Sign in an existing user with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import('firebase/auth').User>}
 */
export async function loginViaEmailPassword(email, password) {
  const auth = getAuthInstance();
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

// ── Google Login ───────────────────────────────────────────

/**
 * Sign in with a Google popup.
 * @returns {Promise<import('firebase/auth').User>}
 */
export async function loginWithGoogle() {
  const auth = getAuthInstance();
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

// ── Logout ────────────────────────────────────────────────

/**
 * Sign out the current user.
 * @returns {Promise<void>}
 */
export async function logout() {
  const auth = getAuthInstance();
  await signOut(auth);
}

// ── Auth State ─────────────────────────────────────────────

/**
 * Subscribe to Firebase auth state changes.
 * @param {(user: (import('firebase/auth').User | null)) => void} callback
 * @returns {() => void} Unsubscribe function.
 */
export function onAuthStateChange(callback) {
  const auth = getAuthInstance();
  return onAuthStateChanged(auth, callback);
}

/**
 * Get the current Firebase user, or null if not signed in.
 * @returns {(import('firebase/auth').User | null)}
 */
export function getCurrentUser() {
  const auth = getAuthInstance();
  return auth.currentUser;
}

/**
 * Get the current user's Firebase ID token, or null if not signed in.
 * @returns {Promise<(string | null)>}
 */
export async function getIdToken() {
  const auth = getAuthInstance();
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

/**
 * Check if a user is currently authenticated.
 * @returns {Promise<boolean>}
 */
export async function isAuthenticated() {
  const auth = getAuthInstance();
  return auth.currentUser !== null;
}

// ── Email Verification ─────────────────────────────────────
// Firebase uses email-link verification, not OTP codes.
// The existing Base44 registration flow uses OTP — this is a UX difference
// documented in the M2 completion report.

/**
 * Send a verification email to the current user.
 * @returns {Promise<void>}
 * @throws {Error} if no user is signed in.
 */
export async function sendEmailVerification() {
  const auth = getAuthInstance();
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user');
  await firebaseSendEmailVerification(user);
}

/**
 * Resend the verification email to the current user.
 * @returns {Promise<void>}
 */
export async function resendEmailVerification() {
  return sendEmailVerification();
}

/**
 * Reload the current user's profile from Firebase.
 * @returns {Promise<(import('firebase/auth').User | null)>}
 */
export async function reloadUser() {
  const auth = getAuthInstance();
  const user = auth.currentUser;
  if (user) await reload(user);
  return user;
}

// ── Password Reset ─────────────────────────────────────────

/**
 * Send a password reset email.
 * @param {string} email
 * @returns {Promise<void>}
 */
export async function resetPasswordRequest(email) {
  const auth = getAuthInstance();
  await sendPasswordResetEmail(auth, email);
}

/**
 * Reset password using a reset code.
 * @param {{ resetCode: string, newPassword: string }} params
 * @returns {Promise<void>}
 */
export async function resetPassword({ resetCode, newPassword }) {
  const auth = getAuthInstance();
  await confirmPasswordReset(auth, resetCode, newPassword);
}

// ── Profile Updates ────────────────────────────────────────

/**
 * Update the current user's profile.
 * @param {Partial<{ displayName: string, photoURL: string }>} data
 * @returns {Promise<void>}
 * @throws {Error} if no user is signed in.
 */
export async function updateProfile(data) {
  const auth = getAuthInstance();
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user');
  await firebaseUpdateProfile(user, data);
}

// Named export for grouped access (used by AuthContext)
export const firebaseAuthService = {
  register,
  loginViaEmailPassword,
  loginWithGoogle,
  logout,
  onAuthStateChange,
  getCurrentUser,
  getIdToken,
  isAuthenticated,
  sendEmailVerification,
  resendEmailVerification,
  reloadUser,
  resetPasswordRequest,
  resetPassword,
  updateProfile,
};