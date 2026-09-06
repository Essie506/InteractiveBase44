"use strict";
// Search Index Cloud Function — V2 Search & Discovery §15.5.
// Server-side index maintenance. Called by connected-system writers
// (post, workout, etc.) after a content record is published, updated,
// or deleted. Keeps the searchIndex collection in sync.
//
// Provider-independent: the index is Firestore-based by default. An
// external adapter (Algolia/Typesense) can replace the index/unindex
// bodies without changing the call sites.
Object.defineProperty(exports, "__esModule", { value: true });
exports.unindexContent = exports.indexContent = void 0;
exports.indexContentInline = indexContentInline;
exports.unindexContentInline = unindexContentInline;
const https_1 = require("firebase-functions/v2/https");
const shared_1 = require("./shared");
/**
 * Tokenise text for the search index.
 */
function tokenise(text) {
    if (!text)
        return [];
    return text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 2);
}
/**
 * Build an index document from a content record.
 */
function buildIndexDocument(params) {
    const { contentId, contentType, system, title, description, tags, ownerId, visibility, extra } = params;
    const textFields = [title, description, ...(tags || [])].filter(Boolean).join(' ');
    const tokens = [...new Set(tokenise(textFields))];
    return {
        content_id: contentId,
        content_type: contentType,
        system,
        title: title || '',
        description: (description || '').slice(0, 300),
        tags: tags || [],
        tokens,
        owner_id: ownerId || null,
        visibility: visibility || 'public',
        _updated_date: new Date().toISOString(),
        ...(extra || {}),
    };
}
// ── indexContent ──────────────────────────────────────────
// Upserts a document into the search index. Called after a content
// record is published or updated.
exports.indexContent = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    const { contentId, contentType, system, title, description, tags, ownerId, visibility, extra } = request.data || {};
    if (!contentId || !system) {
        throw new https_1.HttpsError('invalid-argument', 'contentId and system are required.');
    }
    const indexDoc = buildIndexDocument({ contentId, contentType, system, title, description, tags, ownerId, visibility, extra });
    const ref = shared_1.db.collection('searchIndex').doc(`${system}_${contentId}`);
    await ref.set(indexDoc, { merge: true });
    return { status: 'indexed', id: ref.id };
});
// ── unindexContent ─────────────────────────────────────────
// Removes a document from the search index. Called after a content
// record is deleted or removed from discovery.
exports.unindexContent = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    const { system, contentId } = request.data || {};
    if (!system || !contentId) {
        throw new https_1.HttpsError('invalid-argument', 'system and contentId are required.');
    }
    const ref = shared_1.db.collection('searchIndex').doc(`${system}_${contentId}`);
    await ref.delete();
    return { status: 'unindexed', id: ref.id };
});
// ── Server-side helper (not exported as callable) ─────────
// Used by other cloud functions to update the index inline after
// publishing content, without a round-trip to the client.
async function indexContentInline(contentId, system, fields) {
    const indexDoc = buildIndexDocument({ contentId, system, ...fields });
    const ref = shared_1.db.collection('searchIndex').doc(`${system}_${contentId}`);
    await ref.set(indexDoc, { merge: true });
}
async function unindexContentInline(system, contentId) {
    const ref = shared_1.db.collection('searchIndex').doc(`${system}_${contentId}`);
    await ref.delete();
}
//# sourceMappingURL=searchIndex.js.map