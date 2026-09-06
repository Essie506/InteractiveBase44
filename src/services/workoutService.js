/**
 * Workout Service (Spec 12)
 * ───────────────────────────────────────────────────────────
 * Client-side reads via Firebase SDK + writes via Cloud Functions.
 * Published workouts are public-read; drafts are owner-filtered.
 */

import { collection, getDocs, getDoc, doc, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/firebase/firebaseClient';
import { callSaveWorkout, callDeleteWorkout } from '@/services/firebaseFunctions';

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
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listMyWorkouts(identityId) {
  const q = query(
    collection(db, 'workouts'),
    where('creator_identity_id', '==', identityId),
    orderBy('_updated_date', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

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
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getWorkout(workoutId) {
  const snap = await getDoc(doc(db, 'workouts', workoutId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function saveWorkout(data) {
  return callSaveWorkout(data);
}

export async function deleteWorkout(workoutId) {
  return callDeleteWorkout({ workout_id: workoutId });
}