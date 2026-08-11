/**
 * Firebase Trust & Verification Repository
 * ───────────────────────────────────────────────────────────
 * Collections:
 *   verificationRequests/{requestId}
 *   trustRecords/{trustId}
 *   trustSignals/{signalId}
 *
 * SECURITY NOTES:
 * - Verification approval/rejection must use a Cloud Function to
 *   atomically update VerificationRequest + TrustRecord + send
 *   notifications. Clients cannot approve/reject.
 * - TrustSignal creation is server-only (system-generated).
 * - Private verification evidence is not publicly readable.
 *
 * M1 status: preparation only. Not wired into trust lib.
 */

import { db } from '@/firebase/firebaseClient';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, limit,
} from 'firebase/firestore';
import { toFirestoreDoc, fromFirestoreDoc } from './mappers';

// ── Verification Requests ───────────────────────────────────

export async function getVerificationRequest(id) {
  const snap = await getDoc(doc(db, 'verificationRequests', id));
  return fromFirestoreDoc(snap);
}

export async function listVerificationRequestsForTarget(targetId) {
  const q = query(
    collection(db, 'verificationRequests'),
    where('target_id', '==', targetId),
    orderBy('_created_date', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function listPendingVerificationRequests() {
  const q = query(
    collection(db, 'verificationRequests'),
    where('status', '==', 'pending_review'),
    orderBy('_created_date', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function createVerificationRequest(data) {
  const ref = doc(collection(db, 'verificationRequests'));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

/**
 * Submitter can update non-status fields (e.g. add evidence).
 * Reviewer approval/rejection should use a Cloud Function.
 */
export async function updateVerificationRequest(id, data) {
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, 'verificationRequests', id), toFirestoreDoc(updateData));
  return { id, ...data };
}

// ── Trust Records ──────────────────────────────────────────

export async function getTrustRecord(targetId) {
  const q = query(collection(db, 'trustRecords'), where('target_id', '==', targetId), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : fromFirestoreDoc(snap.docs[0]);
}

/**
 * SERVER-REQUIRED: TrustRecord creation/updates are reviewer-only.
 * Should be handled by a Cloud Function during verification approval.
 */
export async function createTrustRecord(data) {
  const ref = doc(collection(db, 'trustRecords'));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function updateTrustRecord(id, data) {
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, 'trustRecords', id), toFirestoreDoc(updateData));
  return { id, ...data };
}

// ── Trust Signals ──────────────────────────────────────────

/**
 * SERVER-REQUIRED: TrustSignals are system-generated. No client
 * writes allowed. Cloud Function only.
 */
export async function createTrustSignal(data) {
  const ref = doc(collection(db, 'trustSignals'));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}