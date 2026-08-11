/**
 * Firebase User Repository — Application Identity State
 * ───────────────────────────────────────────────────────────
 * Collection: users/{uid}
 * Doc ID == Firebase Auth UID.
 *
 * M1 status: preparation only. Not wired into userService.
 * Base44 remains the active backend for all user operations.
 */

import { db } from '@/firebase/firebaseClient';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, limit,
} from 'firebase/firestore';
import { toFirestoreDoc, fromFirestoreDoc } from './mappers';

const COLLECTION = 'users';

export async function getUser(uid) {
  const snap = await getDoc(doc(db, COLLECTION, uid));
  return fromFirestoreDoc(snap);
}

export async function createUser(uid, data) {
  await setDoc(doc(db, COLLECTION, uid), toFirestoreDoc({ ...data, id: uid }));
  return { id: uid, ...data };
}

export async function updateUser(uid, data) {
  const { id, ...updateData } = data;
  await updateDoc(doc(db, COLLECTION, uid), toFirestoreDoc(updateData));
  return { id: uid, ...data };
}

export async function deleteUser(uid) {
  await deleteDoc(doc(db, COLLECTION, uid));
}

/**
 * Protected user lookup by email.
 * SECURITY NOTE: This query cannot be executed by ordinary clients
 * under the security rules (users/{uid} is owner-only read).
 * Must be invoked via a trusted Cloud Function in M2+.
 */
export async function getUserByEmail(email) {
  const q = query(collection(db, COLLECTION), where('email', '==', email), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return fromFirestoreDoc(snap.docs[0]);
}