/**
 * Firebase Location Repository
 * ───────────────────────────────────────────────────────────
 * Collection: locations/{locationId}
 *
 * Private fields (latitude, longitude, address_line1, postal_code)
 * are protected at the document level by security rules.
 * Production hardening should split public/private projections
 * into separate collections for field-level safety.
 *
 * M1 status: preparation only. Not wired into location lib.
 */

import { db } from '@/firebase/firebaseClient';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where,
} from 'firebase/firestore';
import { toFirestoreDoc, fromFirestoreDoc } from './mappers';

const COLLECTION = 'locations';

export async function getLocation(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return fromFirestoreDoc(snap);
}

export async function listLocationsForOwner(ownerId) {
  const q = query(collection(db, COLLECTION), where('owner_id', '==', ownerId));
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function createLocation(data) {
  const ref = doc(collection(db, COLLECTION));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function updateLocation(id, data) {
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, COLLECTION, id), toFirestoreDoc(updateData));
  return { id, ...data };
}

export async function deleteLocation(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}