import { base44 } from '@/api/base44Client';

// Interactive Authentication Service
// Wraps Base44 authentication operations behind an Interactive-facing contract.
// The future Firebase implementation will replace these internals with
// Firebase Authentication without changing the public API.

export async function register({ email, password }) {
  return base44.auth.register({ email, password });
}

export async function verifyOtp({ email, otpCode }) {
  return base44.auth.verifyOtp({ email, otpCode });
}

export function setToken(token) {
  return base44.auth.setToken(token);
}

export async function resendOtp(email) {
  return base44.auth.resendOtp(email);
}

export async function loginViaEmailPassword(email, password) {
  return base44.auth.loginViaEmailPassword(email, password);
}

export function loginWithProvider(provider, fromUrl) {
  return base44.auth.loginWithProvider(provider, fromUrl);
}

export function logout(redirectUrl) {
  return base44.auth.logout(redirectUrl);
}

export function redirectToLogin(nextUrl) {
  return base44.auth.redirectToLogin(nextUrl);
}

export async function me() {
  return base44.auth.me();
}

export async function isAuthenticated() {
  return base44.auth.isAuthenticated();
}

// Update the authenticated user's profile-visible fields.
// These are fields that affect how the user appears (display_name, avatar_url).
export async function updateProfile(data) {
  return base44.auth.updateMe(data);
}

// Password reset
export async function resetPasswordRequest(email) {
  return base44.auth.resetPasswordRequest(email);
}

export async function resetPassword({ resetToken, newPassword }) {
  return base44.auth.resetPassword({ resetToken, newPassword });
}