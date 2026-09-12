// Post Service — client-side operations for the Post System.
// ───────────────────────────────────────────────────────────
// Reads use Firestore directly (public posts via public query,
// own posts via author query). Writes go through Cloud Functions
// (savePost / deletePost) for authority enforcement.

import { db } from '@/firebase/firebaseClient';
import { collection, query, where, limit, getDocs, doc, getDoc } from 'firebase/firestore';

// Spec §11 Feed & Distribution Engine: distribution is determined by
// visibility, discovery eligibility, and moderation status. Posts
// with discovery_eligibility === false or reporting_status ===
// 'actioned' (moderation action taken) are excluded from the Feed.
function isFeedEligible(p) {
  return p.visibility === 'public'
    && p.discovery_eligibility !== false
    && p.reporting_status !== 'actioned';
}

// Sort posts client-side by _created_date desc. The Feed queries use
// where() + limit() only — no server-side orderBy — so no composite
// index is required. Client-side sort is sufficient for the small
// Feed page-set and avoids any index deployment dependency.
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
 * For authenticated users, uses a single-field query (lifecycle_state)
 * and filters visibility client-side — avoids the composite-index
 * dependency that was silently zeroing the Feed. For unauthenticated
 * users, both filters must be in the query per Firestore rules.
 * @param {number} maxResults
 * @param {{ isAuthenticated?: boolean }} [options]
 * @returns {Promise<Array>}
 */
export async function fetchPublicPosts(maxResults = 20, options = {}) {
  const isAuthed = options.isAuthenticated === true;
  if (isAuthed) {
    // Authenticated users can read all posts (rules: isAuthenticated()).
    // Single-field query on lifecycle_state uses the auto-created
    // single-field index — no composite index needed.
    const q = query(
      collection(db, 'posts'),
      where('lifecycle_state', '==', 'published'),
      limit(maxResults * 3),
    );
    const snap = await getDocs(q);
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const publicPosts = all.filter(isFeedEligible);
    return sortByCreatedDesc(publicPosts).slice(0, maxResults);
  }
  // Unauthenticated — rules require both filters in the query.
  const q = query(
    collection(db, 'posts'),
    where('visibility', '==', 'public'),
    where('lifecycle_state', '==', 'published'),
    limit(maxResults),
  );
  const snap = await getDocs(q);
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return sortByCreatedDesc(all.filter(isFeedEligible)).slice(0, maxResults);
}

/**
 * Fetch posts by a specific author identity, optionally filtered by
 * operating context so personal and professional posts don't mix on
 * their respective profile walls.
 * @param {string} identityId
 * @param {number} maxResults
 * @param {{ operatingContext?: string }} [options]
 * @returns {Promise<Array>}
 */
export async function fetchPostsByAuthor(identityId, maxResults = 20, options = {}) {
  // Single-field query on author_identity_id — auto-created index.
  // Filter lifecycle_state + operating_context client-side to avoid
  // composite-index dependency.
  const q = query(
    collection(db, 'posts'),
    where('author_identity_id', '==', identityId),
    limit(maxResults * 3),
  );
  const snap = await getDocs(q);
  let all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  all = all.filter(p => p.lifecycle_state === 'published');
  if (options.operatingContext) {
    all = all.filter(p => p.operating_context === options.operatingContext);
  }
  return sortByCreatedDesc(all).slice(0, maxResults);
}

/**
 * Fetch posts authored by a business (publishing_account_id == businessId,
 * author_type == 'business'). Used on the business profile wall.
 * @param {string} businessId
 * @param {number} maxResults
 * @returns {Promise<Array>}
 */
export async function fetchPostsByBusiness(businessId, maxResults = 20) {
  // Single-field query on publishing_account_id — auto-created index.
  // Filter author_type + lifecycle_state client-side.
  const q = query(
    collection(db, 'posts'),
    where('publishing_account_id', '==', businessId),
    limit(maxResults * 3),
  );
  const snap = await getDocs(q);
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const published = all.filter(p =>
    p.lifecycle_state === 'published' && p.author_type === 'business'
  );
  return sortByCreatedDesc(published).slice(0, maxResults);
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