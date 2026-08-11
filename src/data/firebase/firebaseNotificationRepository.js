/**
 * Firebase Notification Repository
 * ───────────────────────────────────────────────────────────
 * Collection: notificationRecords/{notificationId}
 *
 * SECURITY NOTE:
 * Notification creation is server-only (allow create: if false).
 * Clients cannot create arbitrary notifications pretending to
 * originate from another system. A Cloud Function must handle
 * notification creation in M2+.
 *
 * M1 status: preparation only. Not wired into notifications lib.
 */

import { db } from '@/firebase/firebaseClient';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit,
} from 'firebase/firestore';
import { toFirestoreDoc, fromFirestoreDoc } from './mappers';

const COLLECTION = 'notificationRecords';

export async function listNotificationsForRecipient(recipientId, limitCount = 50) {
  const q = query(
    collection(db, COLLECTION),
    where('recipient_id', '==', recipientId),
    orderBy('_updated_date', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function getNotification(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return fromFirestoreDoc(snap);
}

/**
 * SERVER-REQUIRED: Notification creation must go through a Cloud
 * Function. Clients cannot create notifications directly.
 */
export async function createNotification(data) {
  const ref = doc(collection(db, COLLECTION));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function markRead(id) {
  await updateDoc(doc(db, COLLECTION, id), {
    is_read: true,
    read_at: new Date().toISOString(),
    _updated_date: new Date().toISOString(),
  });
}

export async function markAllRead(recipientId) {
  const unread = await getDocs(query(
    collection(db, COLLECTION),
    where('recipient_id', '==', recipientId),
    where('is_read', '==', false),
  ));
  const batch = unread.docs.map((d) =>
    updateDoc(doc(db, COLLECTION, d.id), {
      is_read: true,
      read_at: new Date().toISOString(),
      _updated_date: new Date().toISOString(),
    }),
  );
  await Promise.all(batch);
}

export async function deleteNotification(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}