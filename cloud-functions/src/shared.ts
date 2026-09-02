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

// ── Connection relationship ─────────────────────────────────
// A Connection is an explicit identity-to-identity relationship,
// SEPARATE from Messaging. The canonical Connection doc ID is the
// two sorted identity IDs joined by '__', so there is at most one
// Connection relationship per identity pair. An active block in
// either direction overrides a Connection for access purposes.

/** Deterministic canonical Connection doc ID for an identity pair. */
export function connectionPairId(identityA: string, identityB: string): string {
  return [identityA, identityB].sort().join('__');
}

/**
 * Returns true iff an active, unblocked Connection exists between two
 * identities. This is the semantic helper profile access code depends
 * on — not raw collection reads — so the relationship implementation
 * can evolve without rewriting access checks.
 */
export async function hasAcceptedConnection(identityA: string, identityB: string): Promise<boolean> {
  if (!identityA || !identityB || identityA === identityB) return false;
  const blocked = await isBlocked(identityA, identityB);
  if (blocked) return false;
  const pairId = connectionPairId(identityA, identityB);
  const doc = await db.collection('connections').doc(pairId).get();
  if (!doc.exists) return false;
  return doc.data()!.status === 'active';
}

// ── Business membership ────────────────────────────────────

/** Gets a business membership record, or null if not a member. */
export async function getBusinessMembership(
  businessId: string,
  identityId: string
): Promise<{ role: string; lifecycle_state: string; permissions?: string[] } | null> {
  const membershipId = `${businessId}_${identityId}`;
  const doc = await db.collection('businessMemberships').doc(membershipId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return { role: data.role, lifecycle_state: data.lifecycle_state, permissions: data.permissions };
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
 * Business Calendar management permission. Reuses the existing
 * BusinessMembership role + permissions architecture (businessPermissions
 * taxonomy: 'manage_calendar'). owner/admin roles have manage_calendar by
 * default; staff may be granted it via the permissions override array.
 *
 * This is the canonical Calendar event mutation capability — NOT a parallel
 * permission system. Assignment/share status alone never satisfies this.
 */
export async function hasBusinessCalendarPermission(
  businessId: string,
  identityId: string
): Promise<boolean> {
  const membership = await getBusinessMembership(businessId, identityId);
  if (!membership) return false;
  if (membership.lifecycle_state !== 'active') return false;
  if (['owner', 'admin'].includes(membership.role)) return true;
  const extraPerms: string[] = Array.isArray(membership.permissions) ? membership.permissions : [];
  return extraPerms.includes('manage_calendar');
}

/**
 * Resolve a list of email addresses to stable Interactive identity IDs.
 * Email is a discovery/invitation mechanism, NOT an ownership key.
 *
 * Resolution uses the canonical users collection by email (lowercased).
 * Returns resolved identity IDs and the emails that did NOT resolve.
 * Does NOT expose arbitrary identity lookup data — only the resulting
 * association (identity IDs) is returned to the caller.
 *
 * Used by saveCalendarEvent to build invited_identity_ids /
 * invited_guest_emails without inventing identities for unknown emails.
 */
export async function resolveEmailsToIdentities(
  emails: string[]
): Promise<{ resolved: Record<string, string>; unresolved: string[] }> {
  const result: { resolved: Record<string, string>; unresolved: string[] } = {
    resolved: {},
    unresolved: [],
  };
  if (!Array.isArray(emails) || emails.length === 0) return result;
  const seen = new Set<string>();
  for (const raw of emails) {
    if (!raw) continue;
    const canonical = String(raw).toLowerCase().trim();
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    const snap = await db.collection('users').where('email', '==', canonical).limit(1).get();
    if (snap.empty) {
      result.unresolved.push(canonical);
    } else {
      result.resolved[canonical] = snap.docs[0].id;
    }
  }
  return result;
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