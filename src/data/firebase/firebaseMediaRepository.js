/**
 * Firebase Media Asset Repository
 * ───────────────────────────────────────────────────────────
 * Collection: mediaAssets/{mediaId}
 *
 * Cloud Storage is NOT enabled in M1 (Spark plan limitation).
 * This repository handles Firestore metadata only — no file
 * upload/storage operations. Storage Security Rules will be
 * created in the later Media migration phase.
 *
 * Protected media metadata must not expose public file URLs.
 *
 * M1 status: preparation only. Not wired into media lib.
 */

import { db } from '@/firebase/firebaseClient';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit,
} from 'firebase/firestore';
import { toFirestoreDoc, fromFirestoreDoc } from './mappers';

const COLLECTION = 'mediaAssets';

export async function getMediaAsset(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return fromFirestoreDoc(snap);
}

export async function listMediaForOwner(ownerId, limitCount = 100) {
  const q = query(
    collection(db, COLLECTION),
    where('owner_id', '==', ownerId),
    orderBy('_created_date', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function createMediaAsset(data) {
  const ref = doc(collection(db, COLLECTION));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function updateMediaAsset(id, data) {
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, COLLECTION, id), toFirestoreDoc(updateData));
  return { id, ...data };
}

export async function deleteMediaAsset(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}