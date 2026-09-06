// Post System — Cloud Functions
// ───────────────────────────────────────────────────────────
// Canonical server-side writers for Post lifecycle.
// Posts are content authored by identities (personal/professional)
// or businesses. Community Interaction (reactions, comments, saves,
// shares) targets Posts via target_system='post'.
//
// All functions are onCall with Firebase-verified identity.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId, getBusinessMembership } from './shared';
import { indexContentInline, unindexContentInline } from './searchIndex';

// ── savePost ──────────────────────────────────────────────
// Creates or updates a Post. Enforces author authority:
//   - identity-authored: caller must be the author_identity_id
//   - business-authored: caller must be an active business member
// Maintains lifecycle, visibility, and denormalised counters.
export const savePost = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const callerIdentityId = await getIdentityId(request.auth.uid);

    const {
      id, author_identity_id, author_type, business_id, body,
      media_urls, media_asset_ids, link_url, link_preview,
      visibility, operating_context, lifecycle_state,
      // V2 Post Type Engine + Universal Post Model fields
      post_type, title, summary, rich_text,
      linked_content_references, tags, categories, mentions, hashtags,
      locality_settings, discovery_eligibility,
    } = request.data || {};

    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'Post body is required.');
    }
    if (!visibility || !['public', 'connections', 'private'].includes(visibility)) {
      throw new HttpsError('invalid-argument', 'Invalid visibility.');
    }

    const VALID_POST_TYPES = [
      'standard', 'achievement', 'educational', 'workout',
      'business_update', 'promotion', 'event', 'calendar_event',
      'blog_share', 'progress_update', 'community_question',
    ];
    const effectivePostType = VALID_POST_TYPES.includes(post_type) ? post_type : 'standard';

    const effectiveAuthorType = author_type || 'identity';

    // Authority: identity-authored posts must match caller
    if (effectiveAuthorType === 'identity') {
      if (author_identity_id && author_identity_id !== callerIdentityId) {
        throw new HttpsError('permission-denied', 'You can only create posts as yourself.');
      }
    } else if (effectiveAuthorType === 'business') {
      if (!business_id) {
        throw new HttpsError('invalid-argument', 'business_id is required for business-authored posts.');
      }
      const membership = await getBusinessMembership(business_id, callerIdentityId);
      if (!membership || membership.lifecycle_state !== 'active') {
        throw new HttpsError('permission-denied', 'You must be an active member of this business to post as it.');
      }
    } else {
      throw new HttpsError('invalid-argument', 'Invalid author_type.');
    }

    const now = new Date().toISOString();
    const postData: any = {
      author_identity_id: effectiveAuthorType === 'identity' ? callerIdentityId : (author_identity_id || callerIdentityId),
      author_type: effectiveAuthorType,
      publishing_account_id: effectiveAuthorType === 'business' ? business_id : callerIdentityId,
      publishing_account_type: effectiveAuthorType,
      business_id: effectiveAuthorType === 'business' ? business_id : null,
      operating_context: operating_context || (effectiveAuthorType === 'business' ? 'business' : 'personal'),
      post_type: effectivePostType,
      title: title || null,
      summary: summary || null,
      rich_text: rich_text || null,
      body: body.trim(),
      media_urls: Array.isArray(media_urls) ? media_urls : [],
      media_asset_ids: Array.isArray(media_asset_ids) ? media_asset_ids : [],
      link_url: link_url || null,
      link_preview: link_preview || null,
      linked_content_references: Array.isArray(linked_content_references) ? linked_content_references : [],
      tags: Array.isArray(tags) ? tags : [],
      categories: Array.isArray(categories) ? categories : [],
      mentions: Array.isArray(mentions) ? mentions : [],
      hashtags: Array.isArray(hashtags) ? hashtags : [],
      locality_settings: locality_settings || null,
      visibility,
      lifecycle_state: lifecycle_state || 'published',
      discovery_eligibility: typeof discovery_eligibility === 'boolean' ? discovery_eligibility : true,
      reporting_status: 'clear',
      _updated_date: now,
    };

    let postRef;
    if (id) {
      // Update existing post — verify ownership
      postRef = db.collection('posts').doc(id);
      const postDoc = await postRef.get();
      if (!postDoc.exists) {
        throw new HttpsError('not-found', 'Post not found.');
      }
      const existing = postDoc.data()!;
      if (existing.author_type === 'identity' && existing.author_identity_id !== callerIdentityId) {
        throw new HttpsError('permission-denied', 'You can only edit your own posts.');
      }
      if (existing.author_type === 'business') {
        const membership = await getBusinessMembership(existing.business_id, callerIdentityId);
        if (!membership || membership.lifecycle_state !== 'active') {
          throw new HttpsError('permission-denied', 'You must be an active member of this business to edit its posts.');
        }
      }
      postData.edited_at = now;
      await postRef.update(postData);
    } else {
      // Create new post
      postData._created_date = now;
      postData.reaction_count = 0;
      postData.comment_count = 0;
      postData.share_count = 0;
      postData.save_count = 0;
      postData.view_count = 0;
      postRef = db.collection('posts').doc();
      await postRef.set(postData);
    }

    // ── Cross-system search indexing (V2 §15.5) ──
    // Index the post for discovery if it is published, public, and eligible.
    if (postData.lifecycle_state === 'published' && postData.visibility === 'public' && postData.discovery_eligibility !== false) {
      try {
        await indexContentInline(postRef.id, 'post', {
          contentType: 'post',
          title: postData.title || postData.body?.slice(0, 80) || '',
          description: postData.summary || postData.body || '',
          tags: [...(postData.tags || []), ...(postData.hashtags || [])],
          ownerId: postData.author_identity_id,
          visibility: postData.visibility,
        });
      } catch (err) {
        // Index failure must not block the post write.
        console.error('search index failed for post', postRef.id, err);
      }
    }

    return { id: postRef.id, status: id ? 'updated' : 'created' };
  },
);

// ── deletePost ─────────────────────────────────────────────
// Soft-deletes a post (sets lifecycle_state to 'deleted').
// Preserves history. Only the author or business member can delete.
export const deletePost = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const callerIdentityId = await getIdentityId(request.auth.uid);

    const { id } = request.data || {};
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
      const membership = await getBusinessMembership(post.business_id, callerIdentityId);
      if (!membership || membership.lifecycle_state !== 'active') {
        throw new HttpsError('permission-denied', 'You must be an active member of this business to delete its posts.');
      }
    }

    await postRef.update({
      lifecycle_state: 'deleted',
      _updated_date: new Date().toISOString(),
    });

    // Remove from search index (V2 §15.5)
    try {
      await unindexContentInline('post', id);
    } catch (err) {
      console.error('search unindex failed for post', id, err);
    }

    return { id, status: 'deleted' };
  },
);