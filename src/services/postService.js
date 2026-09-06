// Post Service — client-side operations for the Post System.
// ───────────────────────────────────────────────────────────
// Reads use Firestore directly (public posts via public query,
// own posts via author query). Writes go through Cloud Functions
// (savePost / deletePost) for authority enforcement.

import { db } from '@/firebase/firebaseClient';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';

// Re-export the callable wrappers for convenience
export { callSavePost, callDeletePost } from '@/services/firebaseFunctions';

/**
 * Fetch public posts for the Feed.
 * @param {number} maxResults
 * @returns {Promise<Array>}
 */
export async function fetchPublicPosts(maxResults = 20) {
  const q = query(
    collection(db, 'posts'),
    where('visibility', '==', 'public'),
    where('lifecycle_state', '==', 'published'),
    orderBy('_created_date', 'desc'),
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Fetch posts by a specific author identity.
 * @param {string} identityId
 * @param {number} maxResults
 * @returns {Promise<Array>}
 */
export async function fetchPostsByAuthor(identityId, maxResults = 20) {
  const q = query(
    collection(db, 'posts'),
    where('author_identity_id', '==', identityId),
    where('lifecycle_state', '==', 'published'),
    orderBy('_created_date', 'desc'),
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Fetch a single post by ID.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function fetchPostById(id) {
  const docRef = doc(db, 'posts', id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}