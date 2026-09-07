/**
 * Share Engine Service (Spec 14.1)
 * ───────────────────────────────────────────────────────────
 * Client-side writes via Cloud Functions. Share records are references
 * to existing content, never duplicates (§14.3).
 */

import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '@/firebase/firebaseClient';
import { callCreateShare, callDeleteShare } from '@/services/firebaseFunctions';

export async function createShare(targetSystem, targetType, targetId, shareType = 'simple', commentaryBody = null) {
  return callCreateShare({
    target_system: targetSystem,
    target_type: targetType,
    target_id: targetId,
    share_type: shareType,
    commentary_body: commentaryBody,
  });
}

export async function deleteShare(shareId) {
  return callDeleteShare({ share_id: shareId });
}

/**
 * Fetch public commentary shares for the Feed (§14.4/§14.7).
 * Commentary shares are new posts that accompany a shared reference.
 * Simple shares are internal records and do NOT appear in the Feed.
 * @param {number} maxResults
 * @returns {Promise<Array>}
 */
export async function fetchPublicCommentaryShares(maxResults = 20, options = {}) {
  const isAuthed = options.isAuthenticated === true;
  if (isAuthed) {
    // Authenticated users can read all shares (rules: isAuthenticated()).
    // Single-field query on lifecycle_state — no composite index needed.
    const q = query(
      collection(db, 'shares'),
      where('lifecycle_state', '==', 'active'),
      limit(maxResults * 3),
    );
    const snap = await getDocs(q);
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const filtered = all.filter(s => s.share_type === 'commentary' && s.visibility === 'public');
    filtered.sort((a, b) => {
      const aT = a._created_date?.toDate ? a._created_date.toDate().getTime() : new Date(a._created_date || 0).getTime();
      const bT = b._created_date?.toDate ? b._created_date.toDate().getTime() : new Date(b._created_date || 0).getTime();
      return bT - aT;
    });
    return filtered.slice(0, maxResults);
  }
  // Unauthenticated — rules require visibility + lifecycle_state in query.
  // share_type is not rule-required, so filter it client-side to reduce
  // the query to two fields (zigzag-mergeable with single-field indexes).
  const q = query(
    collection(db, 'shares'),
    where('visibility', '==', 'public'),
    where('lifecycle_state', '==', 'active'),
    limit(maxResults * 3),
  );
  const snap = await getDocs(q);
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const filtered = all.filter(s => s.share_type === 'commentary');
  filtered.sort((a, b) => {
    const aT = a._created_date?.toDate ? a._created_date.toDate().getTime() : new Date(a._created_date || 0).getTime();
    const bT = b._created_date?.toDate ? b._created_date.toDate().getTime() : new Date(b._created_date || 0).getTime();
    return bT - aT;
  });
  return filtered.slice(0, maxResults);
}