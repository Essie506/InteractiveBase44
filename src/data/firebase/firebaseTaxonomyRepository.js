/**
 * Firebase Taxonomy Repository — Service + Facility Definitions
 * ───────────────────────────────────────────────────────────
 * Collections:
 *   serviceDefinitions/{defId}   — canonical service taxonomy (shared)
 *   facilityDefinitions/{defId}  — canonical facility taxonomy (business)
 *
 * Read by any authenticated user (for selection UI).
 * Written by admins only (Firestore rules enforce).
 */

import { db } from '@/firebase/firebaseClient';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { fromFirestoreDoc } from './mappers';

const SERVICES = 'serviceDefinitions';
const FACILITIES = 'facilityDefinitions';

export async function getServiceDefinitions(domain) {
  let q;
  if (domain) {
    q = query(collection(db, SERVICES), where('domains', 'array-contains', domain));
  } else {
    q = query(collection(db, SERVICES));
  }
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function getFacilityDefinitions() {
  const q = query(collection(db, FACILITIES));
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}