import { base44 } from '@/api/base44Client';

// Interactive User / Application-State Service
// Abstracts reads/writes of Interactive application state currently stored on
// the Base44 User entity (onboarding_status, active_context, active_business_id,
// professional_activated, terms_accepted, etc.).
//
// During M0 the implementation continues to call Base44 internally.
// The future Firebase implementation will store this state in a Firestore
// users/{uid} document separate from Firebase Authentication.

// Update Interactive application state on the authenticated identity.
// Accepts the same field names the UI uses today.
export async function updateUserState(data) {
  return base44.auth.updateMe(data);
}

// Convenience: update both profile-visible and application-state fields in one call.
// Preserved for pages that currently pass a mixed payload to updateMe.
export async function updateUser(data) {
  return base44.auth.updateMe(data);
}

// Resolve the current authenticated identity (delegates to authService).
export async function getCurrentUser() {
  return base44.auth.me();
}