// Share Engine — trusted Firebase Cloud Functions (Spec 14.1).
// ───────────────────────────────────────────────────────────
// Creates and manages share records. Shares are references to existing
// content, never duplicates (§14.3). The Share Engine does not own
// original content, permissions, notifications, moderation, reactions
// or comments — those remain in their respective systems.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId } from './shared';

// ── createShare ──────────────────────────────────────────────
// Creates a Simple or Commentary share record (§14.4/§14.5).
export const createShare = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const identityId = await getIdentityId(request.auth.uid);
    const { target_system, target_type, target_id, share_type, commentary_body, visibility } = request.data || {};
    if (!target_system || !target_id) {
      throw new HttpsError('invalid-argument', 'target_system, target_id required');
    }

    const isCommentary = share_type === 'commentary';
    const now = new Date().toISOString();
    const ref = db.collection('shares').doc();
    await ref.set({
      sharer_identity_id: identityId,
      share_type: isCommentary ? 'commentary' : 'simple',
      target_system,
      target_type: target_type || target_system,
      target_id,
      commentary_body: isCommentary ? (commentary_body || '').trim().slice(0, 5000) : null,
      visibility: visibility || 'public',
      lifecycle_state: 'active',
      _created_date: now,
      _updated_date: now,
    });
    return { id: ref.id };
  },
);

// ── deleteShare ──────────────────────────────────────────────
// Soft-delete: marks the share as deleted (§14.9). History preserved.
export const deleteShare = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const identityId = await getIdentityId(request.auth.uid);
    const { share_id } = request.data || {};
    if (!share_id) throw new HttpsError('invalid-argument', 'share_id required');
    const doc = await db.collection('shares').doc(share_id).get();
    if (!doc.exists) throw new HttpsError('not-found', 'Share not found');
    if (doc.data()?.sharer_identity_id !== identityId) {
      throw new HttpsError('permission-denied', 'Only the sharer can delete this share');
    }
    await doc.ref.update({
      lifecycle_state: 'deleted',
      _updated_date: new Date().toISOString(),
    });
    return { state: 'deleted' };
  },
);