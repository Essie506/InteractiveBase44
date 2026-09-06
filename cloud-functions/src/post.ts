// Post System — Cloud Functions
// ───────────────────────────────────────────────────────────
// Canonical server-side writers for Post lifecycle.
// Posts are content authored by identities (personal/professional)
// or businesses. Community Interaction (reactions, comments, saves,
// shares) targets Posts via target_system='post'.
//
// All functions are onCall with Firebase-verified identity.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { requireAuth, requireIdentityId, approvedOrigins } from './shared';

const db = getFirestore();

// ── savePost ──────────────────────────────────────────────
// Creates or updates a Post. Enforces author authority:
//   - identity-authored: caller must be the author_identity_id
//   - business-authored: caller must be an active business member
// Maintains lifecycle, visibility, and denormalised counters.
export const savePost = onCall({ cors: approvedOrigins }, async (req) => {
  requireAuth(req);
  const callerIdentityId = await requireIdentityId(req);

  const { id, author_identity_id, author_type, business_id, body, media_urls, media_asset_ids, link_url, link_preview, visibility, operating_context, lifecycle_state } = req.data || {};

  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Post body is required.');
  }
  if (!visibility || !['public', 'connections', 'private'].includes(visibility)) {
    throw new HttpsError('invalid-argument', 'Invalid visibility.');
  }

  // Authority: identity-authored posts must match caller
  if (author_type === 'identity') {
    if (author_identity_id !== callerIdentityId) {
      throw new HttpsError('permission-denied', 'You can only create posts as yourself.');
    }
  } else if (author_type === 'business') {
    // Business-authored: verify membership
    if (!business_id) {
      throw new HttpsError('invalid-argument', 'business_id is required for business-authored posts.');
    }
    const membershipSnap = await db.collection('businessMemberships')
      .where('business_id', '==', business_id)
      .where('identity_id', '==', callerIdentityId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    if (membershipSnap.empty) {
      throw new HttpsError('permission-denied', 'You must be an active member of this business to post as it.');
    }
  } else {
    throw new HttpsError('invalid-argument', 'Invalid author_type.');
  }

  const now = FieldValue.serverTimestamp();
  const postData: any = {
    author_identity_id: author_identity_id || callerIdentityId,
    author_type,
    business_id: author_type === 'business' ? business_id : null,
    operating_context: operating_context || (author_type === 'business' ? 'business' : 'personal'),
    body: body.trim(),
    media_urls: media_urls || [],
    media_asset_ids: media_asset_ids || [],
    link_url: link_url || null,
    link_preview: link_preview || null,
    visibility,
    lifecycle_state: lifecycle_state || 'published',
    updated_date: now,
  };

  if (id) {
    // Update existing post — verify ownership
    const postRef = db.collection('posts').doc(id);
    const postDoc = await postRef.get();
    if (!postDoc.exists) {
      throw new HttpsError('not-found', 'Post not found.');
    }
    const existing = postDoc.data()!;
    if (existing.author_type === 'identity' && existing.author_identity_id !== callerIdentityId) {
      throw new HttpsError('permission-denied', 'You can only edit your own posts.');
    }
    if (existing.author_type === 'business') {
      const membershipSnap = await db.collection('businessMemberships')
        .where('business_id', '==', existing.business_id)
        .where('identity_id', '==', callerIdentityId)
        .where('status', '==', 'active')
        .limit(1)
        .get();
      if (membershipSnap.empty) {
        throw new HttpsError('permission-denied', 'You must be an active member of this business to edit its posts.');
      }
    }
    postData.edited_at = now;
    await postRef.update(postData);
    return { id, status: 'updated' };
  }

  // Create new post
  postData.created_date = now;
  postData.reaction_count = 0;
  postData.comment_count = 0;
  postData.share_count = 0;
  postData.save_count = 0;
  const postRef = db.collection('posts').doc();
  await postRef.set(postData);
  return { id: postRef.id, status: 'created' };
});

// ── deletePost ─────────────────────────────────────────────
// Soft-deletes a post (sets lifecycle_state to 'deleted').
// Preserves history. Only the author or business member can delete.
export const deletePost = onCall({ cors: approvedOrigins }, async (req) => {
  requireAuth(req);
  const callerIdentityId = await requireIdentityId(req);

  const { id } = req.data || {};
  if (!id) {
    throw new HttpsError('invalid-argument', 'Post ID is required.');
  }

  const postRef = db.collection('posts').doc(id);
  const postDoc = await postRef.get();
  if (!postDoc.exists) {
    throw new HttpsError('not-found', 'Post not found.');
  }
  const post = postDoc.data()!;

  // Authority check
  if (post.author_type === 'identity') {
    if (post.author_identity_id !== callerIdentityId) {
      throw new HttpsError('permission-denied', 'You can only delete your own posts.');
    }
  } else {
    const membershipSnap = await db.collection('businessMemberships')
      .where('business_id', '==', post.business_id)
      .where('identity_id', '==', callerIdentityId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    if (membershipSnap.empty) {
      throw new HttpsError('permission-denied', 'You must be an active member of this business to delete its posts.');
    }
  }

  await postRef.update({
    lifecycle_state: 'deleted',
    updated_date: FieldValue.serverTimestamp(),
  });
  return { id, status: 'deleted' };
});