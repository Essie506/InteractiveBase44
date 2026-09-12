/**
 * Workout Service (Spec 12)
 * ───────────────────────────────────────────────────────────
 * Client-side reads via Firebase SDK + writes via Cloud Functions.
 * Published workouts are public-read; drafts are owner-filtered.
 */

import { collection, getDocs, getDoc, doc, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/firebase/firebaseClient';
import { callSaveWorkout, callDeleteWorkout } from '@/services/firebaseFunctions';
import { getActiveMemberships } from '@/services/businessService';

/**
 * @param {number} [maxResults]
 * @returns {Promise<import('@/types/domain').Workout[]>}
 */
export async function listPublishedWorkouts(maxResults = 50) {
  // §7.14: public browse — filters by visibility == 'public' AND
  // lifecycle_state == 'published' so the query validates against the
  // Firestore rule for unauthenticated visitors.
  const q = query(
    collection(db, 'workouts'),
    where('lifecycle_state', '==', 'published'),
    where('visibility', '==', 'public'),
    orderBy('_updated_date', 'desc'),
    limit(maxResults),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, .../** @type {any} */ (d.data()) }));
}

/**
 * Workouts created by a specific identity (professional context).
 * @param {string} identityId
 * @returns {Promise<import('@/types/domain').Workout[]>}
 */
export async function listMyWorkouts(identityId) {
  const q = query(
    collection(db, 'workouts'),
    where('creator_identity_id', '==', identityId),
    orderBy('_updated_date', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, .../** @type {any} */ (d.data()) }));
}

/**
 * Workouts owned by a business (owner_id == businessId). Includes all
 * workouts created by staff for that business, regardless of which
 * staff member authored them.
 * @param {string} businessId
 * @returns {Promise<import('@/types/domain').Workout[]>}
 */
export async function listBusinessWorkouts(businessId) {
  const q = query(
    collection(db, 'workouts'),
    where('owner_id', '==', businessId),
    orderBy('_updated_date', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, .../** @type {any} */ (d.data()) }));
}

/**
 * Business "My Workouts" aggregation (Spec 12 + Business §1).
 * Returns Business-owned workouts PLUS Professional-owned workouts
 * belonging to ACTIVE staff members of the business — aggregated as
 * references (ownership is never rewritten).
 *
 * - Business-owned: owner_id == businessId (any owner_type).
 * - Staff Professional: owner_type == 'identity', resolved via active
 *   BusinessMembership. When the staff relationship ceases to be active,
 *   that Professional's workouts cease appearing here without being
 *   modified or deleted.
 * - Deduplicated by workout id (a workout could be encountered through
 *   more than one path only if ownership were ambiguous; the dedup guard
 *   is defense-in-depth).
 *
 * @param {string} businessId
 * @returns {Promise<import('@/types/domain').Workout[]>}
 */
export async function listBusinessMyWorkouts(businessId) {
  const [businessWorkouts, memberships] = await Promise.all([
    listBusinessWorkouts(businessId),
    getActiveMemberships(businessId).catch((err) => {
      console.error('[listBusinessMyWorkouts] membership query failed:', err);
      return [];
    }),
  ]);

  const staffIdentityIds = Array.from(
    new Set(memberships.map((m) => m.identity_id).filter(Boolean)),
  );

  const staffWorkoutLists = await Promise.all(
    staffIdentityIds.map((id) => listMyWorkouts(id).catch(() => [])),
  );
  // Staff Professional workouts only — exclude any business-owned workouts
  // a staff member may have created (those are already in businessWorkouts).
  const staffWorkouts = staffWorkoutLists
    .flat()
    .filter((w) => w.owner_type === 'identity');

  // Merge + dedupe by id, sort by updated_date desc.
  const seen = new Set();
  const merged = [...businessWorkouts, ...staffWorkouts].filter((w) => {
    if (!w || !w.id || seen.has(w.id)) return false;
    seen.add(w.id);
    return true;
  });
  merged.sort((a, b) => (b._updated_date || '').localeCompare(a._updated_date || ''));
  return merged;
}

/**
 * Workouts saved by an identity (personal context "My Workouts" = saved
 * collection). Queries saves by identity_id (single-field index) and
 * filters target_system + state client-side, then fetches each workout.
 * @param {string} identityId
 * @returns {Promise<import('@/types/domain').Workout[]>}
 */
export async function listSavedWorkouts(identityId) {
  const savesQ = query(
    collection(db, 'saves'),
    where('identity_id', '==', identityId),
  );
  const savesSnap = await getDocs(savesQ);
  const saves = savesSnap.docs
    .map((d) => ({ id: d.id, .../** @type {any} */ (d.data()) }))
    .filter((s) => s.target_system === 'workout' && s.state === 'active');
  saves.sort((a, b) => (b._created_date || '').localeCompare(a._created_date || ''));
  const workouts = [];
  for (const s of saves) {
    try {
      const w = await getWorkout(s.target_id);
      if (w) workouts.push(w);
    } catch { /* workout may have been archived */ }
  }
  return workouts;
}

/**
 * @param {string} ownerId
 * @param {number} [maxResults]
 * @returns {Promise<import('@/types/domain').Workout[]>}
 */
export async function listPublishedWorkoutsByOwner(ownerId, maxResults = 20) {
  // Public published workouts owned by a specific identity or business.
  // 3-field equality query — supported by single-field indexes.
  const q = query(
    collection(db, 'workouts'),
    where('owner_id', '==', ownerId),
    where('lifecycle_state', '==', 'published'),
    where('visibility', '==', 'public'),
    limit(maxResults),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, .../** @type {any} */ (d.data()) }));
}

/**
 * @param {string} workoutId
 * @returns {Promise<import('@/types/domain').Workout | null>}
 */
export async function getWorkout(workoutId) {
  const snap = await getDoc(doc(db, 'workouts', workoutId));
  if (!snap.exists()) return null;
  return { id: snap.id, .../** @type {any} */ (snap.data()) };
}

/**
 * @param {Record<string, any>} data
 * @returns {Promise<{id: string}>}
 */
export async function saveWorkout(data) {
  return callSaveWorkout(data);
}

export async function deleteWorkout(workoutId) {
  return callDeleteWorkout({ workout_id: workoutId });
}