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
import { storage } from '@/firebase/firebaseClient';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

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

// ── Firebase Cloud Storage operations ───────────────────────
// Storage path: media/{mediaId}/original
// Derivatives: media/{mediaId}/derivatives/{type}
// Custom metadata stores owner/visibility for rule evaluation.

/**
 * Uploads a file to Firebase Cloud Storage at media/{mediaId}/original.
 * @param {string} mediaId — MediaAsset ID (Firestore doc ID)
 * @param {File|Blob} file — The file to upload
 * @param {object} metadata — { owner_id, visibility, source_domain, lifecycle_state }
 * @returns {Promise<string>} storagePath
 */
export async function uploadMediaFile(mediaId, file, metadata = {}) {
  const storagePath = `media/${mediaId}/original`;
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, file, {
    customMetadata: {
      mediaId,
      ownerId: metadata.owner_id || '',
      visibility: metadata.visibility || 'private',
      sourceDomain: metadata.source_domain || '',
      lifecycleState: metadata.lifecycle_state || 'uploading',
    },
  });
  return storagePath;
}

/**
 * Gets a download URL for a Storage path.
 * @param {string} storagePath — e.g. "media/{mediaId}/original"
 * @returns {Promise<string>} download URL
 */
export async function getMediaDownloadUrl(storagePath) {
  const fileRef = ref(storage, storagePath);
  return getDownloadURL(fileRef);
}

/**
 * Deletes a file from Firebase Cloud Storage.
 * @param {string} storagePath — e.g. "media/{mediaId}/original"
 */
export async function deleteMediaFile(storagePath) {
  const fileRef = ref(storage, storagePath);
  await deleteObject(fileRef);
}