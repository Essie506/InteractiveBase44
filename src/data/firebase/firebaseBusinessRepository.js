/**
 * Firebase Business Repository
 * ───────────────────────────────────────────────────────────
 * Collections:
 *   businesses/{businessId}
 *   businessProfiles/{profileId}
 *   businessMemberships/{businessId}_{identityId}  (deterministic ID)
 *   businessInvitations/{invitationId}
 *   subscriptionPlans/{planId}
 *   businessSubscriptions/{subscriptionId}
 *
 * M1 status: preparation only. Not wired into businessService.
 */

import { db } from '@/firebase/firebaseClient';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, limit,
} from 'firebase/firestore';
import { toFirestoreDoc, fromFirestoreDoc, membershipDocId } from './mappers';

// ── Businesses ─────────────────────────────────────────────

export async function getBusiness(businessId) {
  const snap = await getDoc(doc(db, 'businesses', businessId));
  return fromFirestoreDoc(snap);
}

export async function createBusiness(data) {
  const ref = doc(collection(db, 'businesses'));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function updateBusiness(id, data) {
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, 'businesses', id), toFirestoreDoc(updateData));
  return { id, ...data };
}

// ── Business Profiles ──────────────────────────────────────

export async function getBusinessProfile(businessId) {
  const q = query(collection(db, 'businessProfiles'), where('business_id', '==', businessId), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : fromFirestoreDoc(snap.docs[0]);
}

export async function createBusinessProfile(data) {
  const ref = doc(collection(db, 'businessProfiles'));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function updateBusinessProfile(id, data) {
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, 'businessProfiles', id), toFirestoreDoc(updateData));
  return { id, ...data };
}

export async function saveBusinessProfile(data) {
  const existing = await getBusinessProfile(data.business_id);
  if (existing) return updateBusinessProfile(existing.id, { ...existing, ...data });
  return createBusinessProfile(data);
}

// ── Public Projection ───────────────────────────────────────
// businessProfilesPublic/{businessId} — doc ID == business_id.
// Public fields only (merged with businesses.verification_state);
// readable by anyone (including guests).

export async function getPublicBusinessProfile(businessId) {
  if (!businessId) return null;
  const snap = await getDoc(doc(db, 'businessProfilesPublic', businessId));
  return snap.exists() ? fromFirestoreDoc(snap) : null;
}

// ── Business Memberships ───────────────────────────────────
// Deterministic doc ID: {businessId}_{identityId}

export async function getMembership(businessId, identityId) {
  const snap = await getDoc(doc(db, 'businessMemberships', membershipDocId(businessId, identityId)));
  return fromFirestoreDoc(snap);
}

export async function getMembershipsForBusiness(businessId) {
  const q = query(collection(db, 'businessMemberships'), where('business_id', '==', businessId));
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function getActiveMembershipsForBusiness(businessId) {
  const q = query(
    collection(db, 'businessMemberships'),
    where('business_id', '==', businessId),
    where('lifecycle_state', '==', 'active'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function getMembershipsForIdentity(identityId) {
  const q = query(collection(db, 'businessMemberships'), where('identity_id', '==', identityId));
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function createMembership(businessId, identityId, data) {
  const id = membershipDocId(businessId, identityId);
  await setDoc(doc(db, 'businessMemberships', id), toFirestoreDoc({ ...data, id }));
  return { id, ...data };
}

export async function updateMembership(businessId, identityId, data) {
  const id = membershipDocId(businessId, identityId);
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, 'businessMemberships', id), toFirestoreDoc(updateData));
  return { id, ...data };
}

export async function deleteMembership(businessId, identityId) {
  await deleteDoc(doc(db, 'businessMemberships', membershipDocId(businessId, identityId)));
}

// ── Business Invitations ───────────────────────────────────

export async function getInvitationsForEmail(email) {
  const q = query(collection(db, 'businessInvitations'), where('email', '==', email));
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function getInvitationsForBusiness(businessId) {
  const q = query(collection(db, 'businessInvitations'), where('business_id', '==', businessId));
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function createInvitation(data) {
  const ref = doc(collection(db, 'businessInvitations'));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function updateInvitation(id, data) {
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, 'businessInvitations', id), toFirestoreDoc(updateData));
  return { id, ...data };
}

// ── Subscription Plans ──────────────────────────────────────

export async function getActivePlans() {
  const q = query(collection(db, 'subscriptionPlans'), where('status', '==', 'active'));
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

// ── Business Subscriptions ─────────────────────────────────

export async function getBusinessSubscription(businessId) {
  const q = query(collection(db, 'businessSubscriptions'), where('business_id', '==', businessId), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : fromFirestoreDoc(snap.docs[0]);
}

export async function createBusinessSubscription(data) {
  const ref = doc(collection(db, 'businessSubscriptions'));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}