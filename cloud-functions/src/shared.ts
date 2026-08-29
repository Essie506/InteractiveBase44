// Shared helpers for Interactive Cloud Functions
// ───────────────────────────────────────────────────────────
// Admin SDK init, CORS config, and reusable auth/identity helpers.
// All onCall functions import from here to avoid duplication.

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

initializeApp();

export const db = getFirestore();

// ── CORS allowed origins ───────────────────────────────────
// Matches:
//   http://localhost           (no port)
//   http://localhost:5182     (any port — local Vite dev)
//   https://*.base44.app       (Base44 Preview / deployed frontends)
// To add a production origin, append |^https:\/\/your-domain\.com$ below.
export const allowedOrigins = /^http:\/\/localhost(:\d+)?$|^https:\/\/.*\.base44\.app$/;

// ── Identity helpers ───────────────────────────────────────

/** Resolves the Interactive Identity ID from a Firebase Auth UID. */
export async function getIdentityId(authUid: string): Promise<string> {
  const mapping = await db.collection('identityMappings').doc(authUid).get();
  if (!mapping.exists) {
    throw new HttpsError('unauthenticated', 'Identity mapping not found');
  }
  return mapping.data()!.identity_id;
}

/** Returns the caller's Interactive Identity ID, or throws unauthenticated. */
export async function requireIdentity(authUid: string): Promise<string> {
  return getIdentityId(authUid);
}

/** Checks if an identity has admin role. */
export async function isAdmin(identityId: string): Promise<boolean> {
  const user = await db.collection('users').doc(identityId).get();
  if (!user.exists) return false;
  return user.data()!.role === 'admin';
}

/** Requires the caller to be an admin, throws permission-denied otherwise. */
export async function requireAdmin(authUid: string): Promise<string> {
  const identityId = await getIdentityId(authUid);
  if (!(await isAdmin(identityId))) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }
  return identityId;
}

// ── Block state ────────────────────────────────────────────

/** Checks if a block relationship exists between two identities (either direction). */
export async function isBlocked(identityA: string, identityB: string): Promise<boolean> {
  const aBlocksB = await db.collection('blockRecords')
    .where('blocker_id', '==', identityA)
    .where('blocked_id', '==', identityB)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (!aBlocksB.empty) return true;

  const bBlocksA = await db.collection('blockRecords')
    .where('blocker_id', '==', identityB)
    .where('blocked_id', '==', identityA)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  return !bBlocksA.empty;
}

// ── Business membership ────────────────────────────────────

/** Gets a business membership record, or null if not a member. */
export async function getBusinessMembership(
  businessId: string,
  identityId: string
): Promise<{ role: string; lifecycle_state: string } | null> {
  const membershipId = `${businessId}_${identityId}`;
  const doc = await db.collection('businessMemberships').doc(membershipId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return { role: data.role, lifecycle_state: data.lifecycle_state };
}

/** Checks if an identity is an active member of a business with the given role(s). */
export async function hasBusinessRole(
  businessId: string,
  identityId: string,
  roles: string[]
): Promise<boolean> {
  const membership = await getBusinessMembership(businessId, identityId);
  if (!membership) return false;
  if (membership.lifecycle_state !== 'active') return false;
  return roles.includes(membership.role);
}

/**
 * Resolves professional reference [{ identity_id }] to display info
 * by reading the professionalProfilesPublic projection. Returns
 * [{ identity_id, display_name, headline, avatar_url, screen_name }]
 * for members that have a public professional profile. Members without
 * a public profile are silently omitted.
 *
 * Used by saveBusinessProfile and backfillProfiles to build the
 * businessProfilesPublic projection without duplicating professional
 * data into the private businessProfile.
 */
export async function resolveProfessionalReferences(
  professionals: any[]
): Promise<any[]> {
  if (!Array.isArray(professionals)) return [];
  const resolved: any[] = [];
  for (const ref of professionals) {
    const identityId = ref?.identity_id;
    if (!identityId) continue;
    const pubSnap = await db.collection('professionalProfilesPublic')
      .where('identity_id', '==', identityId)
      .limit(1)
      .get();
    if (!pubSnap.empty) {
      const pubData = pubSnap.docs[0].data();
      resolved.push({
        identity_id: identityId,
        display_name: pubData.display_name || null,
        headline: pubData.headline || null,
        avatar_url: pubData.avatar_url || null,
        screen_name: pubData.screen_name || null,
      });
    }
  }
  return resolved;
}