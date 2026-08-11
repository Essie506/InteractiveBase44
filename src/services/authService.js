import { base44 } from '@/api/base44Client';
import { useFirebase } from '@/lib/backendConfig';
import { firebaseAuthService } from '@/services/firebaseAuthService';

// Interactive Authentication Service
// ───────────────────────────────────────────────────────────
// Routes to Firebase Authentication when configured (M3 cutover),
// falls back to Base44 when not configured (rollback only).
//
// The active Firebase login journey uses:
//   - signInWithPopup(auth, new GoogleAuthProvider()) for Google
//   - signInWithEmailAndPassword for Email/Password
//
// Base44 auth methods are reachable ONLY when useFirebase is false
// (rollback). They are never called from the active Firebase flow.

// ── Login (active: Firebase, rollback: Base44) ─────────────

export async function loginViaEmailPassword(email, password) {
  if (useFirebase) {
    return firebaseAuthService.loginViaEmailPassword(email, password);
  }
  return base44.auth.loginViaEmailPassword(email, password);
}

export async function loginWithProvider(provider, fromUrl) {
  if (useFirebase) {
    // Firebase Google Sign-In via popup — no Base44 redirect.
    // AuthContext's onAuthStateChanged listener handles identity
    // resolution and identityMappings after the popup completes.
    await firebaseAuthService.loginWithGoogle();
    // Redirect to the return-to destination. The Firebase session
    // is persisted; on page load, AuthContext re-initialises and
    // resolves the Interactive Identity ID.
    window.location.href = fromUrl || '/';
    return;
  }
  // Rollback only — Base44 redirect authentication
  return base44.auth.loginWithProvider(provider, fromUrl);
}

// ── Logout (active: Firebase, rollback: Base44) ─────────────

export async function logout(redirectUrl) {
  if (useFirebase) {
    await firebaseAuthService.logout();
    if (redirectUrl) window.location.href = redirectUrl;
    return;
  }
  return base44.auth.logout(redirectUrl);
}

export function redirectToLogin(nextUrl) {
  if (useFirebase) {
    window.location.href = '/login';
    return;
  }
  return base44.auth.redirectToLogin(nextUrl);
}

// ── Registration (Base44 OTP flow — separate UX migration) ─
// Firebase uses email-link verification, not OTP codes. The
// registration flow retains Base44 OTP until the OTP → email-link
// UX migration is performed. These are the only Base44 auth
// calls reachable when Firebase is active and are limited to
// the registration journey.

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

// ── Password Reset (active: Firebase, rollback: Base44) ────

export async function resetPasswordRequest(email) {
  if (useFirebase) {
    return firebaseAuthService.resetPasswordRequest(email);
  }
  return base44.auth.resetPasswordRequest(email);
}

export async function resetPassword({ resetToken, resetCode, newPassword }) {
  if (useFirebase) {
    return firebaseAuthService.resetPassword({ resetCode: resetCode || resetToken, newPassword });
  }
  return base44.auth.resetPassword({ resetToken, newPassword });
}

// ── Session / Profile (active: Firebase, rollback: Base44) ─

export async function me() {
  if (useFirebase) {
    return firebaseAuthService.getCurrentUser();
  }
  return base44.auth.me();
}

export async function isAuthenticated() {
  if (useFirebase) {
    return firebaseAuthService.isAuthenticated();
  }
  return base44.auth.isAuthenticated();
}

export async function updateProfile(data) {
  if (useFirebase) {
    return firebaseAuthService.updateProfile(data);
  }
  return base44.auth.updateMe(data);
}