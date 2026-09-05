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

export async function listEventsForOwner(ownerId, ownerType, startDate, endDate) {
  // owner_type is 'identity' (Personal/Professional are operating contexts
  // of one identity, not separate owners) or 'business'. Filtering by
  // owner_type keeps identity-owned and business-owned sets disjoint.
  //
  // §113 Performance: when startDate/endDate are provided, filter
  // server-side by start_time range so large event histories don't
  // transfer the full collection. Requires composite index
  // (owner_id, owner_type, start_time) — declared in firestore.indexes.json.
  const constraints = [
    where('owner_id', '==', ownerId),
  ];
  if (ownerType) {
    constraints.push(where('owner_type', '==', ownerType));
  }
  if (startDate && endDate) {
    constraints.push(where('start_time', '>=', startDate.toISOString()));
    constraints.push(where('start_time', '<=', endDate.toISOString()));
  }
  constraints.push(orderBy('start_time', 'asc'));
  const q = query(collection(db, 'calendarEvents'), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

// Events assigned to an identity (Business staff assignment). These appear
// on the identity's Calendar but grant VIEW only — never edit authority.
//
// NOTE: these direct client queries are NOT used by the main Calendar view
// path. Firestore rules resolve the caller's identity via get(identityMappings)
// and check resource.data against it; the query validator cannot evaluate
// get()/exists()-derived values for list requests, so these queries fail
// with "Missing or insufficient permissions" (a permission denial, NOT a
// missing composite index). The authoritative read path is the getCalendarView
// Cloud Function (Admin SDK). These repository helpers are retained for
// non-view callers that read by doc ID or via the server. We deliberately
// do not add orderBy('start_time') to avoid an unnecessary composite index.
export async function listEventsAssignedToIdentity(identityId) {
  const q = query(
    collection(db, 'calendarEvents'),
    where('assigned_identity_ids', 'array-contains', identityId),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
}

// Events an identity was invited to (via email resolution). View only.
// (Same permission-denial rationale as listEventsAssignedToIdentity —
// the authoritative read path is the getCalendarView Cloud Function.)
export async function listEventsInvitedToIdentity(identityId) {
  const q = query(
    collection(db, 'calendarEvents'),
    where('invited_identity_ids', 'array-contains', identityId),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
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

// ── Calendar Event Exceptions (§55–§56) ────────────────────
// Exceptions modify a single occurrence of a recurring series.
// Read-only here — writes go through the saveOccurrenceException Cloud Function.

export async function listExceptionsForSeries(seriesEventId) {
  const q = query(
    collection(db, 'calendarEventExceptions'),
    where('series_event_id', '==', seriesEventId),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

// ── Calendar Event History (§48, §104, §105) ───────────────
// Read-only schedule-change timeline. Writable only by Cloud Function
// (firestore.rules: calendarEventHistory write denied). Readable by
// anyone authorised to read the parent event (canReadCalendarEvent).
export async function listHistoryForEvent(eventId) {
  const q = query(
    collection(db, 'calendarEventHistory'),
    where('event_id', '==', eventId),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(fromFirestoreDoc)
    .sort((a, b) => new Date(a.changed_at || a._created_date) - new Date(b.changed_at || b._created_date));
}

export async function listExceptionsForSeriesBatch(seriesEventIds) {
  // Firestore 'in' query supports max 10 values. Batch accordingly.
  const all = [];
  for (let i = 0; i < seriesEventIds.length; i += 10) {
    const batch = seriesEventIds.slice(i, i + 10);
    const q = query(
      collection(db, 'calendarEventExceptions'),
      where('series_event_id', 'in', batch),
    );
    const snap = await getDocs(q);
    all.push(...snap.docs.map(fromFirestoreDoc));
  }
  return all;
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