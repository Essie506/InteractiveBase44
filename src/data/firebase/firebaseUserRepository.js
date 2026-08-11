/**
 * Firebase User Repository — Application Identity State
 * ───────────────────────────────────────────────────────────
 * Collection: users/{identityId}
 * Doc ID == Interactive Identity ID (NOT Firebase Auth UID).
 *
 * The Interactive Identity ID is resolved from the Firebase Auth UID
 * via the identityMappings collection. This decouples domain identity
 * references from the authentication provider, so providers can
 * change without altering domain identity keys.
 *
 * M1.1 status: preparation only. Not wired into userService.
 * Base44 remains the active backend for all user operations.
 */

import { db } from '@/firebase/firebaseClient';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, limit,
} from 'firebase/firestore';
import { toFirestoreDoc, fromFirestoreDoc } from './mappers';

const COLLECTION = 'users';

export async function getUser(identityId) {
  const snap = await getDoc(doc(db, COLLECTION, identityId));
  return fromFirestoreDoc(snap);
}

export async function createUser(identityId, data) {
  await setDoc(doc(db, COLLECTION, identityId), toFirestoreDoc({ ...data, id: identityId }));
  return { id: identityId, ...data };
}

export async function updateUser(identityId, data) {
  const { id, ...updateData } = data;
  await updateDoc(doc(db, COLLECTION, identityId), toFirestoreDoc(updateData));
  return { id: identityId, ...data };
}

export async function deleteUser(identityId) {
  await deleteDoc(doc(db, COLLECTION, identityId));
}

/**
 * Protected user lookup by email.
 * SECURITY NOTE: This query cannot be executed by ordinary clients
 * under the security rules (users/{identityId} is owner-only read).
 * Must be invoked via a trusted Cloud Function in M2+.
 */
export async function getUserByEmail(email) {
  const q = query(collection(db, COLLECTION), where('email', '==', email), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return fromFirestoreDoc(snap.docs[0]);
}