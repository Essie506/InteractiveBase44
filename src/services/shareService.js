/**
 * Share Engine Service (Spec 14.1)
 * ───────────────────────────────────────────────────────────
 * Client-side writes via Cloud Functions. Share records are references
 * to existing content, never duplicates (§14.3).
 */

import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
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
export async function fetchPublicCommentaryShares(maxResults = 20) {
  const q = query(
    collection(db, 'shares'),
    where('share_type', '==', 'commentary'),
    where('visibility', '==', 'public'),
    where('lifecycle_state', '==', 'active'),
    orderBy('_created_date', 'desc'),
    limit(maxResults),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}