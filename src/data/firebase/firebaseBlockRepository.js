/**
 * Firebase Block Record Repository
 * ───────────────────────────────────────────────────────────
 * Collection: blockRecords/{blockerId}__{blockedId}
 * Deterministic doc ID enables O(1) security-rule lookups.
 *
 * Block state must be usable by trusted messaging/interaction
 * operations. The isNotBlockedBy() helper in security rules
 * documents the check that Cloud Functions will use.
 *
 * M1 status: preparation only. Not wired into trust lib.
 */

import { db } from '@/firebase/firebaseClient';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where,
} from 'firebase/firestore';
import { toFirestoreDoc, fromFirestoreDoc, blockDocId } from './mappers';

const COLLECTION = 'blockRecords';

export async function getBlock(blockerId, blockedId) {
  const snap = await getDoc(doc(db, COLLECTION, blockDocId(blockerId, blockedId)));
  return fromFirestoreDoc(snap);
}

export async function blockExists(blockerId, blockedId) {
  const snap = await getDoc(doc(db, COLLECTION, blockDocId(blockerId, blockedId)));
  return snap.exists();
}

export async function listBlocksForBlocker(blockerId) {
  const q = query(collection(db, COLLECTION), where('blocker_id', '==', blockerId));
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function createBlock(data) {
  const id = blockDocId(data.blocker_id, data.blocked_id);
  await setDoc(doc(db, COLLECTION, id), toFirestoreDoc({ ...data, id }));
  return { id, ...data };
}

export async function updateBlock(blockerId, blockedId, data) {
  const id = blockDocId(blockerId, blockedId);
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, COLLECTION, id), toFirestoreDoc(updateData));
  return { id, ...data };
}

export async function removeBlock(blockerId, blockedId) {
  await deleteDoc(doc(db, COLLECTION, blockDocId(blockerId, blockedId)));
}