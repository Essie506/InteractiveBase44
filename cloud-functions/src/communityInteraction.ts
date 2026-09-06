// Community Interaction — trusted Firebase Cloud Functions (Spec 20).
// ───────────────────────────────────────────────────────────
// Reactions, Comments, and Saves on any supported target (Post, Workout,
// Event, etc.). Community Interaction stores a reference to the target,
// never a duplicate (§8). All writes go through these callables; reads
// are via the Firebase client SDK (public for reactions/comments, private
// for saves via getInteractionState).
//
// Entities: Reaction (§14), Comment (§21), Save (§36/§38).
// Standard reaction types (§14): support, celebrate, strong, nice_work,
// helpful, inspiring.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId } from './shared';

const VALID_REACTION_TYPES = ['support', 'celebrate', 'strong', 'nice_work', 'helpful', 'inspiring'];

// ── toggleReaction ────────────────────────────────────────────
// Idempotent toggle: creates an active reaction or removes it.
export const toggleReaction = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const identityId = await getIdentityId(request.auth.uid);
    const { target_system, target_type, target_id, reaction_type } = request.data || {};
    if (!target_system || !target_id || !reaction_type) {
      throw new HttpsError('invalid-argument', 'target_system, target_id, reaction_type required');
    }
    if (!VALID_REACTION_TYPES.includes(reaction_type)) {
      throw new HttpsError('invalid-argument', `Invalid reaction type: ${reaction_type}`);
    }
    const now = new Date().toISOString();

    const existing = await db.collection('reactions')
      .where('identity_id', '==', identityId)
      .where('target_system', '==', target_system)
      .where('target_id', '==', target_id)
      .where('reaction_type', '==', reaction_type)
      .where('state', '==', 'active')
      .limit(1)
      .get();

    if (!existing.empty) {
      await existing.docs[0].ref.update({ state: 'removed', _updated_date: now });
      return { state: 'removed' };
    }

    const ref = db.collection('reactions').doc();
    await ref.set({
      identity_id: identityId,
      target_system,
      target_type: target_type || target_system,
      target_id,
      reaction_type,
      state: 'active',
      _created_date: now,
      _updated_date: now,
    });
    return { state: 'active' };
  },
);

// ── createComment ─────────────────────────────────────────────
export const createComment = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const identityId = await getIdentityId(request.auth.uid);
    const { target_system, target_type, target_id, body, parent_comment_id } = request.data || {};
    if (!target_system || !target_id || !body || !body.trim()) {
      throw new HttpsError('invalid-argument', 'target_system, target_id, body required');
    }
    const now = new Date().toISOString();
    const ref = db.collection('comments').doc();
    await ref.set({
      identity_id: identityId,
      target_system,
      target_type: target_type || target_system,
      target_id,
      parent_comment_id: parent_comment_id || null,
      body: body.trim().slice(0, 2000),
      edit_state: 'original',
      moderation_state: 'approved',
      visibility_state: 'visible',
      pinned: false,
      reaction_count: 0,
      reply_count: 0,
      _created_date: now,
      _updated_date: now,
    });
    return { id: ref.id };
  },
);

// ── deleteComment ─────────────────────────────────────────────
// Author-only soft delete (visibility → hidden, moderation → removed).
export const deleteComment = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const identityId = await getIdentityId(request.auth.uid);
    const { comment_id } = request.data || {};
    if (!comment_id) throw new HttpsError('invalid-argument', 'comment_id required');
    const doc = await db.collection('comments').doc(comment_id).get();
    if (!doc.exists) throw new HttpsError('not-found', 'Comment not found');
    if (doc.data()?.identity_id !== identityId) {
      throw new HttpsError('permission-denied', 'Only the author can delete this comment');
    }
    await doc.ref.update({
      visibility_state: 'hidden',
      moderation_state: 'removed',
      _updated_date: new Date().toISOString(),
    });
    return { state: 'deleted' };
  },
);

// ── toggleSave ───────────────────────────────────────────────
// Idempotent toggle: creates an active save or removes it.
export const toggleSave = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const identityId = await getIdentityId(request.auth.uid);
    const { target_system, target_type, target_id } = request.data || {};
    if (!target_system || !target_id) {
      throw new HttpsError('invalid-argument', 'target_system, target_id required');
    }
    const now = new Date().toISOString();

    const existing = await db.collection('saves')
      .where('identity_id', '==', identityId)
      .where('target_system', '==', target_system)
      .where('target_id', '==', target_id)
      .where('state', '==', 'active')
      .limit(1)
      .get();

    if (!existing.empty) {
      await existing.docs[0].ref.update({ state: 'removed', _updated_date: now });
      return { state: 'removed' };
    }

    const ref = db.collection('saves').doc();
    await ref.set({
      identity_id: identityId,
      target_system,
      target_type: target_type || target_system,
      target_id,
      collection_ref: null,
      state: 'active',
      _created_date: now,
      _updated_date: now,
    });
    return { state: 'active' };
  },
);

// ── getInteractionState ──────────────────────────────────────
// Returns the caller's active reaction types + save state for a target.
// Used by the UI to show the user's own interaction state (private data
// that Firestore rules cannot resolve via Firebase UID → identity).
export const getInteractionState = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const identityId = await getIdentityId(request.auth.uid);
    const { target_system, target_id } = request.data || {};
    if (!target_system || !target_id) {
      throw new HttpsError('invalid-argument', 'target_system, target_id required');
    }

    const [reactionsSnap, saveSnap] = await Promise.all([
      db.collection('reactions')
        .where('identity_id', '==', identityId)
        .where('target_system', '==', target_system)
        .where('target_id', '==', target_id)
        .where('state', '==', 'active')
        .get(),
      db.collection('saves')
        .where('identity_id', '==', identityId)
        .where('target_system', '==', target_system)
        .where('target_id', '==', target_id)
        .where('state', '==', 'active')
        .limit(1)
        .get(),
    ]);

    return {
      my_reaction_types: reactionsSnap.docs.map((d) => d.data().reaction_type),
      my_save_state: saveSnap.empty ? 'none' : 'active',
    };
  },
);