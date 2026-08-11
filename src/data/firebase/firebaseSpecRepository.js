/**
 * Firebase SpecVault Repository
 * ───────────────────────────────────────────────────────────
 * Collections:
 *   projects/{projectId}
 *   specifications/{specId}
 *   specVersions/{versionId}
 *
 * M1 status: preparation only. Not wired into specService.
 */

import { db } from '@/firebase/firebaseClient';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit,
} from 'firebase/firestore';
import { toFirestoreDoc, fromFirestoreDoc } from './mappers';

// ── Projects ────────────────────────────────────────────────

export async function listProjects() {
  const snap = await getDocs(collection(db, 'projects'));
  return snap.docs.map(fromFirestoreDoc);
}

export async function getProject(id) {
  const snap = await getDoc(doc(db, 'projects', id));
  return fromFirestoreDoc(snap);
}

export async function createProject(data) {
  const ref = doc(collection(db, 'projects'));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function updateProject(id, data) {
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, 'projects', id), toFirestoreDoc(updateData));
  return { id, ...data };
}

export async function deleteProject(id) {
  await deleteDoc(doc(db, 'projects', id));
}

// ── Specifications ──────────────────────────────────────────

export async function listSpecifications(sortField, limitCount) {
  let q = collection(db, 'specifications');
  if (sortField === '-updated_date') {
    q = query(q, orderBy('_updated_date', 'desc'));
  }
  if (limitCount) q = query(q, limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function listSpecificationsForProject(projectId) {
  const q = query(
    collection(db, 'specifications'),
    where('project_id', '==', projectId),
    orderBy('_updated_date', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function getSpecification(id) {
  const snap = await getDoc(doc(db, 'specifications', id));
  return fromFirestoreDoc(snap);
}

export async function createSpecification(data) {
  const ref = doc(collection(db, 'specifications'));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function updateSpecification(id, data) {
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, 'specifications', id), toFirestoreDoc(updateData));
  return { id, ...data };
}

export async function deleteSpecification(id) {
  await deleteDoc(doc(db, 'specifications', id));
}

// ── Spec Versions ───────────────────────────────────────────

export async function listSpecVersions(specificationId) {
  const q = query(
    collection(db, 'specVersions'),
    where('specification_id', '==', specificationId),
    orderBy('_created_date', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function createSpecVersion(data) {
  const ref = doc(collection(db, 'specVersions'));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function deleteSpecVersions(specificationId) {
  const q = query(collection(db, 'specVersions'), where('specification_id', '==', specificationId));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, 'specVersions', d.id))));
}