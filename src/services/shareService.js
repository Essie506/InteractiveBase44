/**
 * Share Engine Service (Spec 14.1)
 * ───────────────────────────────────────────────────────────
 * Client-side writes via Cloud Functions. Share records are references
 * to existing content, never duplicates (§14.3).
 */

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