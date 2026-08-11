// Firebase Authentication Service
// ───────────────────────────────────────────────────────────
// Wraps Firebase Authentication operations behind an Interactive-facing
// contract matching the existing authService API.
//
// M2 status: IMPLEMENTED, NOT YET ACTIVE.
// The cutover is blocked by §17 (Base44 SDK entity access requires a
// Base44 authenticated session — see M2 completion report).
// This service is ready for activation once the hybrid bridge is resolved.

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

function ensureConfigured() {
  if (!isConfigured) {
    throw new Error(
      'Firebase is not configured. Set VITE_FIREBASE_* environment variables. ' +
      'See M2 completion report for required configuration.'
    );
  }
}

// ── Registration ──────────────────────────────────────────

export async function register({ email, password }) {
  ensureConfigured();
  const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  return userCredential.user;
}

// ── Email/Password Login ───────────────────────────────────

export async function loginViaEmailPassword(email, password) {
  ensureConfigured();
  const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  return userCredential.user;
}

// ── Google Login ───────────────────────────────────────────

export async function loginWithGoogle() {
  ensureConfigured();
  const result = await signInWithPopup(firebaseAuth, googleProvider);
  return result.user;
}

// ── Logout ────────────────────────────────────────────────

export async function logout() {
  ensureConfigured();
  await signOut(firebaseAuth);
}

// ── Auth State ─────────────────────────────────────────────

export function onAuthStateChange(callback) {
  ensureConfigured();
  return onAuthStateChanged(firebaseAuth, callback);
}

export function getCurrentUser() {
  return firebaseAuth.currentUser;
}

export async function getIdToken() {
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

export async function isAuthenticated() {
  return firebaseAuth.currentUser !== null;
}

// ── Email Verification ─────────────────────────────────────
// Firebase uses email-link verification, not OTP codes.
// The existing Base44 registration flow uses OTP — this is a UX difference
// documented in the M2 completion report.

export async function sendEmailVerification() {
  ensureConfigured();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('No authenticated user');
  await firebaseSendEmailVerification(user);
}

export async function resendEmailVerification() {
  return sendEmailVerification();
}

export async function reloadUser() {
  const user = firebaseAuth.currentUser;
  if (user) await reload(user);
  return user;
}

// ── Password Reset ─────────────────────────────────────────

export async function resetPasswordRequest(email) {
  ensureConfigured();
  await sendPasswordResetEmail(firebaseAuth, email);
}

export async function resetPassword({ resetCode, newPassword }) {
  ensureConfigured();
  await confirmPasswordReset(firebaseAuth, resetCode, newPassword);
}

// ── Profile Updates ────────────────────────────────────────

export async function updateProfile(data) {
  ensureConfigured();
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('No authenticated user');
  await firebaseUpdateProfile(user, data);
}