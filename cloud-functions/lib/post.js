"use strict";
// Post System — Cloud Functions
// ───────────────────────────────────────────────────────────
// Canonical server-side writers for Post lifecycle.
// Posts are content authored by identities (personal/professional)
// or businesses. Community Interaction (reactions, comments, saves,
// shares) targets Posts via target_system='post'.
//
// ── Context separation (architecture rule) ──
// Personal, Professional and Business are separate operating
// accounts/contexts accessible through one login. They may share the
// same person, email, display name and avatar, but their content
// ownership, history, walls, permissions and provenance remain
// separate. The Feed may aggregate all contexts for discovery; it
// does not alter canonical ownership.
//
// savePost enforces this rule:
//   1. On UPDATE, authorship/provenance fields are immutable — an edit
//      can never move a Post between Personal/Professional/Business
//      histories.
//   2. On CREATE, the operating account is resolved from the caller's
//      authoritative server-side User record (active_context +
//      professional activation / business membership), never silently
//      defaulted from a client field.
//   3. The Business invariant (operating_context === 'business' ⇔
//      author_type === 'business' + valid business_id) is structural.
//   4. Client-supplied context fields that conflict with the
//      server-resolved account are rejected, not coerced.
//
// All functions are onCall with Firebase-verified identity.
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePost = exports.savePost = void 0;
exports.resolvePostOperatingAccount = resolvePostOperatingAccount;
exports.assertNoContextConflict = assertNoContextConflict;
const https_1 = require("firebase-functions/v2/https");
const shared_1 = require("./shared");
const searchIndex_1 = require("./searchIndex");
function resolvePostOperatingAccount(callerIdentityId, userData, businessMembership, clientBusinessId) {
    const activeContext = userData?.active_context || 'personal';
    if (activeContext === 'business') {
        // Business-authored — resolve the business from the server-side
        // active_business_id (authoritative), falling back to the client-
        // supplied business_id, then validate active membership.
        const bizId = userData?.active_business_id || clientBusinessId || null;
        if (!bizId) {
            throw new https_1.HttpsError('invalid-argument', 'Business context requires a business.');
        }
        if (!businessMembership || businessMembership.lifecycle_state !== 'active') {
            throw new https_1.HttpsError('permission-denied', 'You must be an active member of this business to post as it.');
        }
        return {
            author_type: 'business',
            operating_context: 'business',
            business_id: bizId,
            publishing_account_id: bizId,
            publishing_account_type: 'business',
        };
    }
    if (activeContext === 'professional') {
        // Canonical Professional activation rule (mirrors saveWorkout).
        const isProfessionallyActivated = !!userData?.professional_activated ||
            userData?.professional_onboarding_status === 'active';
        if (!isProfessionallyActivated) {
            throw new https_1.HttpsError('permission-denied', 'Only an activated Professional context can create Professional posts.');
        }
        return {
            author_type: 'identity',
            operating_context: 'professional',
            business_id: null,
            publishing_account_id: callerIdentityId,
            publishing_account_type: 'identity',
        };
    }
    // personal (default)
    return {
        author_type: 'identity',
        operating_context: 'personal',
        business_id: null,
        publishing_account_id: callerIdentityId,
        publishing_account_type: 'identity',
    };
}
// Rejects a client payload whose authorship/provenance fields conflict
// with the server-resolved (or, on update, the existing immutable)
// operating account. Client fields that are absent (undefined) are not
// conflicts — only explicit mismatches are rejected.
function assertNoContextConflict(payload, resolved) {
    if (payload.author_type !== undefined && payload.author_type !== resolved.author_type) {
        throw new https_1.HttpsError('invalid-argument', 'author_type conflicts with the server-resolved operating account.');
    }
    if (payload.operating_context !== undefined && payload.operating_context !== resolved.operating_context) {
        throw new https_1.HttpsError('invalid-argument', 'operating_context conflicts with the server-resolved operating account.');
    }
    if (payload.business_id !== undefined && payload.business_id !== resolved.business_id) {
        throw new https_1.HttpsError('invalid-argument', 'business_id conflicts with the server-resolved operating account.');
    }
    if (payload.publishing_account_id !== undefined && payload.publishing_account_id !== resolved.publishing_account_id) {
        throw new https_1.HttpsError('invalid-argument', 'publishing_account_id conflicts with the server-resolved operating account.');
    }
    if (payload.publishing_account_type !== undefined && payload.publishing_account_type !== resolved.publishing_account_type) {
        throw new https_1.HttpsError('invalid-argument', 'publishing_account_type conflicts with the server-resolved operating account.');
    }
}
const VALID_POST_TYPES = [
    'standard', 'achievement', 'educational', 'workout',
    'business_update', 'promotion', 'event', 'calendar_event',
    'blog_share', 'progress_update', 'community_question',
];
// ── savePost ──────────────────────────────────────────────
// Creates or updates a Post. Authorship/provenance is immutable after
// creation; on creation the operating account is resolved from the
// caller's authoritative server-side User record.
exports.savePost = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    const callerIdentityId = await (0, shared_1.getIdentityId)(request.auth.uid);
    const { id, body, media_urls, media_asset_ids, link_url, link_preview, visibility, lifecycle_state, 
    // V2 Post Type Engine + Universal Post Model fields
    post_type, title, summary, rich_text, linked_content_references, tags, categories, mentions, hashtags, locality_settings, discovery_eligibility, 
    // Client-supplied context (NOT authoritative — validated against
    // server-resolved / existing-immutable state)
    author_type, business_id, operating_context, publishing_account_id, publishing_account_type, } = request.data || {};
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'Post body is required.');
    }
    if (!visibility || !['public', 'connections', 'private'].includes(visibility)) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid visibility.');
    }
    const effectivePostType = VALID_POST_TYPES.includes(post_type) ? post_type : 'standard';
    const now = new Date().toISOString();
    // Mutable content fields shared by create + update.
    // Authorship/provenance fields are deliberately ABSENT here — they
    // are resolved on create and preserved on update.
    const contentFields = {
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
        _updated_date: now,
    };
    let postRef;
    let indexedOwnerId;
    if (id) {
        // ── UPDATE — authorship/provenance is immutable ──
        postRef = shared_1.db.collection('posts').doc(id);
        const postDoc = await postRef.get();
        if (!postDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Post not found.');
        }
        const existing = postDoc.data();
        // Authority (existing owner)
        if (existing.author_type === 'identity') {
            if (existing.author_identity_id !== callerIdentityId) {
                throw new https_1.HttpsError('permission-denied', 'You can only edit your own posts.');
            }
        }
        else {
            const membership = await (0, shared_1.getBusinessMembership)(existing.business_id, callerIdentityId);
            if (!membership || membership.lifecycle_state !== 'active') {
                throw new https_1.HttpsError('permission-denied', 'You must be an active member of this business to edit its posts.');
            }
        }
        // The existing post's account IS the immutable resolved account.
        // Reject any client attempt to change context fields. A missing
        // operating_context is never defaulted — the existing value is
        // preserved because it is absent from the update payload.
        const existingAccount = {
            author_type: existing.author_type,
            operating_context: existing.operating_context,
            business_id: existing.business_id || null,
            publishing_account_id: existing.publishing_account_id,
            publishing_account_type: existing.publishing_account_type,
        };
        assertNoContextConflict(request.data || {}, existingAccount);
        // Update ONLY mutable fields. reporting_status and all
        // authorship/provenance fields are untouched (Firestore preserves
        // unmentioned fields on update).
        await postRef.update({ ...contentFields, edited_at: now });
        indexedOwnerId = existing.author_identity_id;
    }
    else {
        // ── CREATE — resolve operating account from authoritative server state ──
        const userDoc = await shared_1.db.collection('users').doc(callerIdentityId).get();
        const userData = userDoc.exists ? userDoc.data() : null;
        // Pre-fetch business membership for the prospective business (server
        // active_business_id preferred; client business_id as fallback).
        const prospectiveBizId = userData?.active_business_id || business_id || null;
        let businessMembership = null;
        if (prospectiveBizId) {
            businessMembership = await (0, shared_1.getBusinessMembership)(prospectiveBizId, callerIdentityId);
        }
        const resolved = resolvePostOperatingAccount(callerIdentityId, userData, businessMembership, business_id);
        // Reject client payload that conflicts with the resolved account.
        assertNoContextConflict(request.data || {}, resolved);
        const postData = {
            ...contentFields,
            // author_identity_id retains the posting person as audit/creator
            // provenance. For business posts, canonical ownership/wall still
            // belongs to the Business (via publishing_account_id + author_type +
            // operating_context), never to this individual.
            author_identity_id: callerIdentityId,
            author_type: resolved.author_type,
            business_id: resolved.business_id,
            operating_context: resolved.operating_context,
            publishing_account_id: resolved.publishing_account_id,
            publishing_account_type: resolved.publishing_account_type,
            reporting_status: 'clear',
            _created_date: now,
            reaction_count: 0,
            comment_count: 0,
            share_count: 0,
            save_count: 0,
            view_count: 0,
        };
        postRef = shared_1.db.collection('posts').doc();
        await postRef.set(postData);
        indexedOwnerId = postData.author_identity_id;
    }
    // ── Cross-system search indexing (V2 §15.5) ──
    // Index the post for discovery if it is published, public, and eligible.
    if (contentFields.lifecycle_state === 'published' && contentFields.visibility === 'public' && contentFields.discovery_eligibility !== false) {
        try {
            await (0, searchIndex_1.indexContentInline)(postRef.id, 'post', {
                contentType: 'post',
                title: contentFields.title || contentFields.body?.slice(0, 80) || '',
                description: contentFields.summary || contentFields.body || '',
                tags: [...(contentFields.tags || []), ...(contentFields.hashtags || [])],
                ownerId: indexedOwnerId,
                visibility: contentFields.visibility,
            });
        }
        catch (err) {
            // Index failure must not block the post write.
            console.error('search index failed for post', postRef.id, err);
        }
    }
    return { id: postRef.id, status: id ? 'updated' : 'created' };
});
// ── deletePost ─────────────────────────────────────────────
// Soft-deletes a post (sets lifecycle_state to 'deleted').
// Preserves history. Only the author or business member can delete.
exports.deletePost = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    const callerIdentityId = await (0, shared_1.getIdentityId)(request.auth.uid);
    const { id } = request.data || {};
    if (!id) {
        throw new https_1.HttpsError('invalid-argument', 'Post ID is required.');
    }
    const postRef = shared_1.db.collection('posts').doc(id);
    const postDoc = await postRef.get();
    if (!postDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Post not found.');
    }
    const post = postDoc.data();
    // Authority check
    if (post.author_type === 'identity') {
        if (post.author_identity_id !== callerIdentityId) {
            throw new https_1.HttpsError('permission-denied', 'You can only delete your own posts.');
        }
    }
    else {
        const membership = await (0, shared_1.getBusinessMembership)(post.business_id, callerIdentityId);
        if (!membership || membership.lifecycle_state !== 'active') {
            throw new https_1.HttpsError('permission-denied', 'You must be an active member of this business to delete its posts.');
        }
    }
    await postRef.update({
        lifecycle_state: 'deleted',
        _updated_date: new Date().toISOString(),
    });
    // Remove from search index (V2 §15.5)
    try {
        await (0, searchIndex_1.unindexContentInline)('post', id);
    }
    catch (err) {
        console.error('search unindex failed for post', id, err);
    }
    return { id, status: 'deleted' };
});
//# sourceMappingURL=post.js.map