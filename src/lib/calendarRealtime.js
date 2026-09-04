// Calendar Real-Time Updates — Firestore onSnapshot subscriptions (§99).
// ───────────────────────────────────────────────────────────
// Real-time presentation of Calendar state changes. Where current
// scheduling state matters, Calendar updates propagate promptly to
// authorised surfaces (Calendar views, Dashboard, Business Calendar,
// connected participant views — §98).
//
// CRITICAL (§99): Real-time presentation does NOT replace server-side
// authoritative conflict/availability validation. onSnapshot is a
// PRESENTATION mechanism. Conflict detection, availability evaluation,
// and slot-hold validation remain server-side authoritative (Cloud
// Functions with transactions). The client never treats a real-time
// snapshot as authoritative for committing time.
//
// §98: Changes to Calendar state propagate to authorised surfaces
// without duplicate manual editing. onSnapshot achieves this — any
// surface subscribed to the same Firestore collections receives
// updates automatically.

import { db } from '@/firebase/firebaseClient';
import {
  collection, query, where, orderBy, onSnapshot,
} from 'firebase/firestore';
import { fromFirestoreDoc } from '@/data/firebase/mappers';

/**
 * Subscribe to real-time Calendar Event changes for an owner.
 *
 * Returns an unsubscribe function. The callback receives the full
 * refreshed event list on every change (added/modified/removed).
 *
 * @param {string} ownerId — identity ID or business ID
 * @param {string} ownerType — 'identity' | 'business'
 * @param {function} callback — (events: Array) => void
 * @param {object} options — { onError?: (error) => void }
 * @returns {function} unsubscribe
 */
export function subscribeToOwnerEvents(ownerId, ownerType, callback, options = {}) {
  if (!ownerId) {
    callback([]);
    return () => {};
  }

  const constraints = [
    where('owner_id', '==', ownerId),
    orderBy('start_time', 'asc'),
  ];
  if (ownerType) {
    constraints.splice(1, 0, where('owner_type', '==', ownerType));
  }

  const q = query(collection(db, 'calendarEvents'), ...constraints);

  return onSnapshot(
    q,
    (snap) => {
      const events = snap.docs.map(fromFirestoreDoc);
      callback(events);
    },
    (error) => {
      if (options.onError) options.onError(error);
      else console.error('[calendarRealtime] subscription error:', error);
    },
  );
}

/**
 * Subscribe to real-time Calendar Events assigned to an identity
 * (Business staff assignment — view/participation only).
 */
export function subscribeToAssignedEvents(identityId, callback, options = {}) {
  if (!identityId) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, 'calendarEvents'),
    where('assigned_identity_ids', 'array-contains', identityId),
    orderBy('start_time', 'asc'),
  );

  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map(fromFirestoreDoc)),
    (error) => {
      if (options.onError) options.onError(error);
      else console.error('[calendarRealtime] assigned subscription error:', error);
    },
  );
}

/**
 * Subscribe to real-time Calendar Events an identity was invited to.
 */
export function subscribeToInvitedEvents(identityId, callback, options = {}) {
  if (!identityId) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, 'calendarEvents'),
    where('invited_identity_ids', 'array-contains', identityId),
    orderBy('start_time', 'asc'),
  );

  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map(fromFirestoreDoc)),
    (error) => {
      if (options.onError) options.onError(error);
      else console.error('[calendarRealtime] invited subscription error:', error);
    },
  );
}

/**
 * Merge multiple event lists and deduplicate by authoritative Event ID.
 * Used when combining owner + assigned + invited event streams.
 */
export function mergeAndDedupeEvents(...eventLists) {
  const byId = new Map();
  for (const list of eventLists) {
    if (!Array.isArray(list)) continue;
    for (const e of list) {
      if (!e) continue;
      if (!byId.has(e.id)) byId.set(e.id, e);
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.start_time) - new Date(b.start_time),
  );
}

/**
 * Subscribe to real-time Calendar Participation changes for an identity.
 * (Phase 3) — propagates invitation response state changes (pending →
 * accepted/declined/revoked) to authorised Calendar surfaces without
 * duplicate manual editing.
 *
 * Returns an unsubscribe function. The callback receives the full
 * refreshed participation list on every change.
 */
export function subscribeToParticipationForIdentity(identityId, callback, options = {}) {
  if (!identityId) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, 'calendarParticipation'),
    where('identity_id', '==', identityId),
  );

  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map(fromFirestoreDoc)),
    (error) => {
      if (options.onError) options.onError(error);
      else console.error('[calendarRealtime] participation subscription error:', error);
    },
  );
}