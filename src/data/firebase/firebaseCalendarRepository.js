/**
 * Firebase Calendar Repository
 * ───────────────────────────────────────────────────────────
 * Collections:
 *   calendarEvents/{eventId}
 *   availabilityRules/{ruleId}
 *   externalCalendarConnections/{connectionId}
 *
 * M1 status: preparation only. Not wired into calendar lib.
 */

import { db } from '@/firebase/firebaseClient';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy,
} from 'firebase/firestore';
import { toFirestoreDoc, fromFirestoreDoc } from './mappers';

// ── Calendar Events ────────────────────────────────────────

export async function getEvent(eventId) {
  const snap = await getDoc(doc(db, 'calendarEvents', eventId));
  return fromFirestoreDoc(snap);
}

export async function listEventsForOwner(ownerId, ownerType) {
  // owner_type is 'identity' (Personal/Professional are operating contexts
  // of one identity, not separate owners) or 'business'. Filtering by
  // owner_type keeps identity-owned and business-owned sets disjoint.
  const constraints = [
    where('owner_id', '==', ownerId),
    orderBy('start_time', 'asc'),
  ];
  if (ownerType) {
    constraints.splice(1, 0, where('owner_type', '==', ownerType));
  }
  const q = query(collection(db, 'calendarEvents'), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

// Events assigned to an identity (Business staff assignment). These appear
// on the identity's Calendar but grant VIEW only — never edit authority.
export async function listEventsAssignedToIdentity(identityId) {
  const q = query(
    collection(db, 'calendarEvents'),
    where('assigned_identity_ids', 'array-contains', identityId),
    orderBy('start_time', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

// Events an identity was invited to (via email resolution). View only.
export async function listEventsInvitedToIdentity(identityId) {
  const q = query(
    collection(db, 'calendarEvents'),
    where('invited_identity_ids', 'array-contains', identityId),
    orderBy('start_time', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function listEventsForBusiness(businessId) {
  const q = query(
    collection(db, 'calendarEvents'),
    where('business_id', '==', businessId),
    orderBy('start_time', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

// NOTE: direct client create/update/delete of calendarEvents has been
// removed. All manual Calendar writes now flow through the canonical
// saveCalendarEvent Cloud Function (see src/lib/calendar.js), which is
// the sole authoritative writer and maintains the calendarEventsPublic
// projection. Firestore rules deny direct client writes to calendarEvents.
// Read functions below are retained.

// ── Availability Rules ─────────────────────────────────────

export async function listAvailabilityForOwner(ownerId) {
  const q = query(
    collection(db, 'availabilityRules'),
    where('owner_id', '==', ownerId),
    orderBy('day_of_week', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function listAvailabilityForBusiness(businessId) {
  const q = query(collection(db, 'availabilityRules'), where('business_id', '==', businessId));
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function createAvailability(data) {
  const ref = doc(collection(db, 'availabilityRules'));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function updateAvailability(id, data) {
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, 'availabilityRules', id), toFirestoreDoc(updateData));
  return { id, ...data };
}

export async function deleteAvailability(id) {
  await deleteDoc(doc(db, 'availabilityRules', id));
}

// ── External Calendar Connections ──────────────────────────

export async function listConnections(identityId) {
  const q = query(collection(db, 'externalCalendarConnections'), where('identity_id', '==', identityId));
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function createConnection(data) {
  const ref = doc(collection(db, 'externalCalendarConnections'));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function updateConnection(id, data) {
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, 'externalCalendarConnections', id), toFirestoreDoc(updateData));
  return { id, ...data };
}

export async function deleteConnection(id) {
  await deleteDoc(doc(db, 'externalCalendarConnections', id));
}