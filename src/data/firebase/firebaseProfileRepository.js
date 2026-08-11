/**
 * Firebase Profile Repository — Personal + Professional Profiles
 * ───────────────────────────────────────────────────────────
 * Collections:
 *   personalProfiles/{profileId}     (identity_id links to uid)
 *   professionalProfiles/{profileId} (identity_id links to uid)
 *
 * M1 status: preparation only. Not wired into profileService.
 */

import { db } from '@/firebase/firebaseClient';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, limit,
} from 'firebase/firestore';
import { toFirestoreDoc, fromFirestoreDoc } from './mappers';

const PERSONAL = 'personalProfiles';
const PROFESSIONAL = 'professionalProfiles';

// ── Personal Profiles ──────────────────────────────────────

export async function getPersonalProfile(identityId) {
  const q = query(collection(db, PERSONAL), where('identity_id', '==', identityId), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : fromFirestoreDoc(snap.docs[0]);
}

export async function createPersonalProfile(data) {
  const ref = doc(collection(db, PERSONAL));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function updatePersonalProfile(id, data) {
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, PERSONAL, id), toFirestoreDoc(updateData));
  return { id, ...data };
}

export async function savePersonalProfile(data) {
  const existing = await getPersonalProfile(data.identity_id);
  if (existing) return updatePersonalProfile(existing.id, { ...existing, ...data });
  return createPersonalProfile(data);
}

// ── Professional Profiles ──────────────────────────────────

export async function getProfessionalProfile(identityId) {
  const q = query(collection(db, PROFESSIONAL), where('identity_id', '==', identityId), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : fromFirestoreDoc(snap.docs[0]);
}

export async function createProfessionalProfile(data) {
  const ref = doc(collection(db, PROFESSIONAL));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function updateProfessionalProfile(id, data) {
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, PROFESSIONAL, id), toFirestoreDoc(updateData));
  return { id, ...data };
}

export async function saveProfessionalProfile(data) {
  const existing = await getProfessionalProfile(data.identity_id);
  if (existing) return updateProfessionalProfile(existing.id, { ...existing, ...data });
  return createProfessionalProfile(data);
}

// ── Context Resolution ─────────────────────────────────────

export async function resolveProfileForContext(identityId, context) {
  if (context === 'professional') return getProfessionalProfile(identityId);
  return getPersonalProfile(identityId);
}