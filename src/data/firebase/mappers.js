/**
 * Shared mapper utilities for converting between Interactive entity
 * objects (Base44 format) and Firestore document snapshots.
 *
 * Base44 entities carry: id, created_date, updated_date, created_by_id
 * Firestore documents use the document ID and store timestamps as
 * prefixed meta fields to avoid collisions with domain fields.
 */

import { serverTimestamp, Timestamp } from 'firebase/firestore';

/**
 * Convert an Interactive entity object to a Firestore document.
 * Strips the system-managed `id` (use document ID instead).
 */
export function toFirestoreDoc(entity) {
  const { id, created_date, updated_date, created_by_id, ...data } = entity;
  const doc = { ...data };
  if (created_date) doc._created_date = created_date;
  if (created_by_id) doc.created_by_id = created_by_id;
  doc._updated_date = serverTimestamp();
  return doc;
}

/**
 * Convert a Firestore document snapshot to an Interactive entity object.
 */
export function fromFirestoreDoc(snapshot) {
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  const { _created_date, _updated_date, ...rest } = data;
  return {
    id: snapshot.id,
    ...rest,
    created_date: timestampToIso(_created_date),
    updated_date: timestampToIso(_updated_date),
  };
}

function timestampToIso(value) {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  return value;
}

/**
 * Deterministic document ID for business memberships.
 * Enables O(1) security-rule lookups via exists()/get().
 * Format: {businessId}_{identityId}
 */
export function membershipDocId(businessId, identityId) {
  return `${businessId}_${identityId}`;
}

/**
 * Deterministic document ID for block records.
 * Format: {blockerId}__{blockedId}
 */
export function blockDocId(blockerId, blockedId) {
  return `${blockerId}__${blockedId}`;
}