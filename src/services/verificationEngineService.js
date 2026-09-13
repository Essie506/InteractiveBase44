// Verification Engine client service
// ───────────────────────────────────────────────────────────
// Reads (verificationSources, verificationState, verificationClaims)
// go directly to Firestore via the Firebase SDK (governed by security
// rules). Writes that change verification state go through the Base44
// backend functions (SubmitVerificationClaims, DecideVerificationClaim)
// via base44.functions.invoke — the client can never set a claim to
// verified directly. Admin source config writes go directly to
// Firestore (rules allow admin write).

import { db, firebaseAuth } from '@/firebase/firebaseClient';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { base44 } from '@/api/base44Client';
import { matchSources } from '@/lib/verificationEngine';

/**
 * List verification sources, optionally filtered by subject /
 * jurisdiction / profession / claim type.
 */
export async function listVerificationSources(filter) {
  const snap = await getDocs(collection(db, 'verificationSources'));
  const sources = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return filter ? matchSources(sources, filter) : sources;
}

/**
 * Read the authoritative derived public verification state for a
 * subject. Returns null if no state has been derived yet.
 */
export async function getVerificationState(subjectType, subjectId) {
  const ref = doc(db, 'verificationState', `${subjectType}_${subjectId}`);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * List all verification claims for a subject (submitter or admin).
 */
export async function listClaimsForSubject(subjectId) {
  const snap = await getDocs(
    query(collection(db, 'verificationClaims'), where('subject_id', '==', subjectId))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * List pending verification claims (admin review queue).
 */
export async function listPendingClaims() {
  const snap = await getDocs(
    query(collection(db, 'verificationClaims'), where('status', '==', 'pending'))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getIdToken() {
  if (!firebaseAuth || !firebaseAuth.currentUser) {
    throw new Error('Not authenticated');
  }
  return await firebaseAuth.currentUser.getIdToken();
}

/**
 * Submit verification claims (creates a parent request + one claim
 * per selected source, all pending). Server-authoritative.
 */
export async function submitVerificationClaims(payload) {
  const idToken = await getIdToken();
  const res = await base44.functions.invoke('SubmitVerificationClaims', { idToken, ...payload });
  return res.data;
}

/**
 * Reviewer/admin decision on a single claim. Re-derives the subject's
 * public verification state and propagates it.
 */
export async function decideVerificationClaim(payload) {
  const idToken = await getIdToken();
  const res = await base44.functions.invoke('DecideVerificationClaim', { idToken, ...payload });
  return res.data;
}

// ── Admin source config (rules allow admin write directly) ──

export async function saveVerificationSource(source) {
  const id = source.id || crypto.randomUUID();
  const ref = doc(db, 'verificationSources', id);
  await setDoc(
    ref,
    { ...source, _updated_date: new Date().toISOString() },
    { merge: true }
  );
  return { id };
}

export async function deleteVerificationSource(id) {
  await deleteDoc(doc(db, 'verificationSources', id));
}