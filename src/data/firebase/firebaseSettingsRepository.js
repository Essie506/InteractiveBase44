/**
 * Firebase Settings Repository
 * ───────────────────────────────────────────────────────────
 * Collections:
 *   userSettings/{settingsId}             (identity_id links to uid)
 *   notificationPreferences/{prefId}       (identity_id links to uid)
 *   onboardingStates/{stateId}             (identity_id links to uid)
 *
 * M1 status: preparation only. Not wired into settingsService.
 */

import { db } from '@/firebase/firebaseClient';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, limit,
} from 'firebase/firestore';
import { toFirestoreDoc, fromFirestoreDoc } from './mappers';

// ── User Settings ───────────────────────────────────────────

export async function getUserSettings(identityId) {
  const q = query(collection(db, 'userSettings'), where('identity_id', '==', identityId), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : fromFirestoreDoc(snap.docs[0]);
}

export async function createUserSettings(data) {
  const ref = doc(collection(db, 'userSettings'));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function updateUserSettings(id, data) {
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, 'userSettings', id), toFirestoreDoc(updateData));
  return { id, ...data };
}

export async function getOrCreateUserSettings(identityId) {
  const existing = await getUserSettings(identityId);
  if (existing) return existing;
  return createUserSettings({ identity_id: identityId });
}

// ── Notification Preferences ────────────────────────────────

export async function getNotificationPreferences(identityId) {
  const q = query(collection(db, 'notificationPreferences'), where('identity_id', '==', identityId), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : fromFirestoreDoc(snap.docs[0]);
}

export async function createNotificationPreferences(data) {
  const ref = doc(collection(db, 'notificationPreferences'));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function updateNotificationPreferences(id, data) {
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, 'notificationPreferences', id), toFirestoreDoc(updateData));
  return { id, ...data };
}

export async function getOrCreateNotificationPreferences(identityId) {
  const existing = await getNotificationPreferences(identityId);
  if (existing) return existing;
  return createNotificationPreferences({ identity_id: identityId });
}

// ── Onboarding States ──────────────────────────────────────

export async function getOnboardingState(identityId) {
  const q = query(collection(db, 'onboardingStates'), where('identity_id', '==', identityId), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : fromFirestoreDoc(snap.docs[0]);
}

export async function createOnboardingState(data) {
  const ref = doc(collection(db, 'onboardingStates'));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function updateOnboardingState(id, data) {
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, 'onboardingStates', id), toFirestoreDoc(updateData));
  return { id, ...data };
}