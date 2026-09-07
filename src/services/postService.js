// Post Service — client-side operations for the Post System.
// ───────────────────────────────────────────────────────────
// Reads use Firestore directly (public posts via public query,
// own posts via author query). Writes go through Cloud Functions
// (savePost / deletePost) for authority enforcement.

import { db } from '@/firebase/firebaseClient';
import { collection, query, where, limit, getDocs, doc, getDoc } from 'firebase/firestore';

// Sort posts client-side by _created_date desc. The composite Firestore
// index (visibility, lifecycle_state, _created_date) is defined in
// firestore.indexes.json but not yet deployed — server-side orderBy
// fails with FAILED_PRECONDITION until it is. Client-side sort avoids
// the hard dependency and works for the small Feed page-set.
function sortByCreatedDesc(items) {
  return items.sort((a, b) => {
    const aT = a._created_date?.toDate ? a._created_date.toDate().getTime() : new Date(a._created_date || 0).getTime();
    const bT = b._created_date?.toDate ? b._created_date.toDate().getTime() : new Date(b._created_date || 0).getTime();
    return bT - aT;
  });
}

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
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return sortByCreatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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