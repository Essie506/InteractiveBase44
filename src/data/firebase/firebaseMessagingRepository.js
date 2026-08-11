/**
 * Firebase Messaging Repository
 * ───────────────────────────────────────────────────────────
 * Collections:
 *   conversations/{conversationId}
 *   conversations/{conversationId}/messages/{messageId}  (subcollection)
 *
 * SECURITY NOTE:
 * Conversation creation and message-request handling are classified
 * as server-required operations. The security rules deny client-side
 * conversation creation (allow create: if false) to enforce:
 *   - direct-message restrictions
 *   - block state
 *   - request state
 * A Cloud Function must handle conversation creation in M2+.
 *
 * M1 status: preparation only. Not wired into messaging lib.
 */

import { db } from '@/firebase/firebaseClient';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, limit,
} from 'firebase/firestore';
import { toFirestoreDoc, fromFirestoreDoc } from './mappers';

// ── Conversations ───────────────────────────────────────────

export async function getConversation(conversationId) {
  const snap = await getDoc(doc(db, 'conversations', conversationId));
  return fromFirestoreDoc(snap);
}

export async function listConversationsForParticipant(identityId) {
  const q = query(
    collection(db, 'conversations'),
    where('participant_ids', 'array-contains', identityId),
    orderBy('last_message_at', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

/**
 * SERVER-REQUIRED: Conversation creation must go through a Cloud
 * Function to enforce message-request and block-state rules.
 * This method is provided for the Cloud Function to call with
 * admin credentials, not for direct client use.
 */
export async function createConversation(data) {
  const ref = doc(collection(db, 'conversations'));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}

export async function updateConversation(id, data) {
  const { id: _, ...updateData } = data;
  await updateDoc(doc(db, 'conversations', id), toFirestoreDoc(updateData));
  return { id, ...data };
}

// ── Messages (subcollection) ───────────────────────────────

export async function listMessages(conversationId) {
  const q = query(
    collection(db, 'conversations', conversationId, 'messages'),
    orderBy('_created_date', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

/**
 * Messages can be created by clients only when the conversation is
 * accepted and the sender is a participant. The security rules
 * enforce this. For message-request scenarios (new conversations,
 * pending requests), a Cloud Function is required.
 */
export async function createMessage(conversationId, data) {
  const ref = doc(collection(db, 'conversations', conversationId, 'messages'));
  await setDoc(ref, toFirestoreDoc(data));
  return { id: ref.id, ...data };
}