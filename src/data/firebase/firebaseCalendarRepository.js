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

export async function listEventsForOwner(ownerId) {
  const q = query(
    collection(db, 'calendarEvents'),
    where('owner_id', '==', ownerId),
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

export async function createEvent(data) {
  const ref = doc(collection(db, 'calendarEvents'));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function updateEvent(id, data) {
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, 'calendarEvents', id), toFirestoreDoc(updateData));
  return { id, ...data };
}

export async function deleteEvent(id) {
  await deleteDoc(doc(db, 'calendarEvents', id));
}

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