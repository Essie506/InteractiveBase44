"use strict";
// Media Cloud Functions (M4 Security Correction)
// ───────────────────────────────────────────────────────────
// 1. getProtectedMediaUrl — server-mediated access to protected
//    media (message attachments, verification evidence). Verifies
//    source-domain authorization server-side and returns a
//    short-lived signed URL (15 minutes). Prevents long-lived
//    download URL sharing.
//
// 2. migrateMedia — admin-only, copies Base44-hosted Media files
//    into Firebase Cloud Storage. Idempotent. Preserves Media IDs,
//    owner, lifecycle state, and source-domain references. Resolves
//    source_ref_id for message attachments and verification evidence.
//    Retains legacy Base44 URL in legacy_file_url for rollback.
//
// M4 Hardening:
//   - Cursor-based scan ordered by document ID; application logic
//     filters migrated vs unmigrated (no query-level storage_path
//     filter, which can exclude missing-field legacy documents).
//   - dry_run mode performs analysis without uploading or writing.
//   - Legacy URL validation restricts fetch() to expected Base44
//     storage origins — rejects malformed or unexpected external URLs.
//   - authorized_identity_ids is only written when a new value is
//     derived — existing server-authoritative values are preserved.
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateMedia = exports.getProtectedMediaUrl = void 0;
const https_1 = require("firebase-functions/v2/https");
const storage_1 = require("firebase-admin/storage");
const shared_1 = require("./shared");
// ── getProtectedMediaUrl ────────────────────────────────────
// Server-mediated access to protected media.
// Verifies source-domain authorization server-side and returns
// a short-lived signed URL (15 minutes). This is the authoritative
// access mechanism for protected media — the client should call
// this function instead of getDownloadURL() for messaging and
// verification source domains.
//
// Authorization:
//   - Owner: always allowed (any lifecycle state except deleted)
//   - Admin: always allowed
//   - Message attachment: must be active participant in the
//     Conversation referenced by source_ref_id
//   - Verification evidence: must be the submitter of the
//     VerificationRequest referenced by source_ref_id
//   - Non-protected media: public visibility + active lifecycle
exports.getProtectedMediaUrl = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const { media_id } = request.data || {};
    if (!media_id) {
        throw new https_1.HttpsError('invalid-argument', 'media_id is required');
    }
    // Resolve caller identity
    const callerIdentityId = await (0, shared_1.getIdentityId)(request.auth.uid);
    // Read media asset
    const assetRef = shared_1.db.collection('mediaAssets').doc(media_id);
    const assetDoc = await assetRef.get();
    if (!assetDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Media asset not found');
    }
    const asset = assetDoc.data();
    // Check lifecycle state
    const lifecycleState = asset.lifecycle_state || 'active';
    if (lifecycleState === 'deleted' || lifecycleState === 'scheduled_for_deletion') {
        throw new https_1.HttpsError('permission-denied', 'Media is not available');
    }
    // Owner always has access
    const isOwner = asset.owner_id === callerIdentityId;
    // Admin always has access
    const admin = await (0, shared_1.isAdmin)(callerIdentityId);
    if (!isOwner && !admin) {
        // Source-domain authorization for non-owners
        const sourceDomain = asset.source_domain;
        const sourceRefId = asset.source_ref_id;
        if (sourceDomain === 'messaging') {
            // Message attachment: verify conversation participation
            if (!sourceRefId) {
                throw new https_1.HttpsError('permission-denied', 'Attachment not linked to a conversation');
            }
            const convDoc = await shared_1.db.collection('conversations').doc(sourceRefId).get();
            if (!convDoc.exists) {
                throw new https_1.HttpsError('permission-denied', 'Conversation not found');
            }
            const conv = convDoc.data();
            const participantIds = conv.participant_ids || [];
            if (!participantIds.includes(callerIdentityId) || conv.status !== 'active') {
                throw new https_1.HttpsError('permission-denied', 'Not a participant in this conversation');
            }
        }
        else if (sourceDomain === 'verification') {
            // Verification evidence: verify submitter
            if (!sourceRefId) {
                throw new https_1.HttpsError('permission-denied', 'Evidence not linked to a verification request');
            }
            const reqDoc = await shared_1.db.collection('verificationRequests').doc(sourceRefId).get();
            if (!reqDoc.exists) {
                throw new https_1.HttpsError('permission-denied', 'Verification request not found');
            }
            const req = reqDoc.data();
            if (req.submitted_by_id !== callerIdentityId) {
                throw new https_1.HttpsError('permission-denied', 'Not authorized to view this evidence');
            }
        }
        else {
            // Non-protected source domain: check visibility
            if (asset.visibility !== 'public' || lifecycleState !== 'active') {
                throw new https_1.HttpsError('permission-denied', 'Not authorized to view this media');
            }
        }
    }
    // Generate short-lived signed URL (15 minutes)
    const storagePath = asset.storage_path || `media/${media_id}/original`;
    const storage = (0, storage_1.getStorage)();
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);
    const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    });
    return { url: signedUrl, expires_in: 900 };
});
// ── Legacy URL validation ────────────────────────────────────
// Only fetch from expected Base44 legacy storage origins.
// Rejects malformed or unexpected external URLs to prevent
// arbitrary server-side fetches during migration.
const ALLOWED_LEGACY_HOSTS = [
    'media.base44.com',
    'static.wixstatic.com',
];
function validateLegacyUrl(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') {
            return { valid: false, reason: 'URL must use HTTPS' };
        }
        if (!ALLOWED_LEGACY_HOSTS.includes(parsed.hostname)) {
            return { valid: false, reason: `Unexpected host: ${parsed.hostname}` };
        }
        return { valid: true };
    }
    catch {
        return { valid: false, reason: 'Malformed URL' };
    }
}
// ── migrateMedia ────────────────────────────────────────────
// Admin-only. Copies Base44-hosted Media files into Firebase Storage.
//
// Query progression: cursor-based scan ordered by document ID.
// We do NOT filter by storage_path at the query level — Firestore
// treats absent fields separately from explicit nulls in some index
// configurations, and a `== null` query can silently exclude legacy
// documents with a missing storage_path field. Instead, we scan in
// document-ID order and filter in application logic: process records
// where !data.storage_path (covers both absent and null) and a valid
// legacy file_url exists. The cursor (last document ID) is returned
// for the next batch, ensuring deterministic progression that never
// stalls on already-migrated documents.
//
// Idempotent: skips assets that already have a storage_path
// (defensive safety net alongside the query filter).
//
// Preserves: Media IDs, owner, lifecycle state, visibility,
// source_domain. Retains legacy Base44 URL in legacy_file_url.
//
// Authorization metadata: authorized_identity_ids is only written
// when a new value is derived from the verification request's
// submitted_by_id. Existing server-authoritative values are
// preserved — never overwritten with null.
//
// dry_run: when true, performs candidate/source-reference analysis
// without uploading files or updating Firestore. Returns candidate
// IDs, migration state, resolved source_ref_id, authorization
// resolution status, and validation failures.
exports.migrateMedia = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins, timeoutSeconds: 540 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    await (0, shared_1.requireAdmin)(request.auth.uid);
    const { dry_run, batch_size, cursor } = request.data || {};
    // Validate batch_size as a finite integer; fall back to 100 default
    const limit = (typeof batch_size === 'number'
        && Number.isFinite(batch_size)
        && Number.isInteger(batch_size))
        ? Math.max(1, Math.min(batch_size, 500))
        : 100;
    const storage = (0, storage_1.getStorage)();
    const bucket = storage.bucket();
    // Cursor-based scan ordered deterministically by document ID.
    // No query-level storage_path filter — application logic handles
    // all three states (absent, null, populated) to avoid excluding
    // legacy documents with missing fields.
    let query = shared_1.db.collection('mediaAssets')
        .orderBy('__name__')
        .limit(limit);
    if (typeof cursor === 'string' && cursor.length > 0) {
        query = query.startAfter(cursor);
    }
    const snapshot = await query.get();
    const lastDoc = snapshot.docs[snapshot.size - 1] || null;
    const nextCursor = lastDoc ? lastDoc.id : null;
    const hasMore = snapshot.size === limit;
    const results = {
        dry_run: !!dry_run,
        total: snapshot.size,
        migrated: 0,
        failed: 0,
        skipped: 0,
        next_cursor: hasMore ? nextCursor : null,
        has_more: hasMore,
        candidates: [],
        failures: [],
    };
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const mediaId = doc.id;
        // Application-level filter: process only unmigrated records.
        // Handles all three storage_path states: absent (undefined),
        // explicit null, and populated. Populated → skip (already migrated).
        if (data.storage_path) {
            results.skipped++;
            continue;
        }
        // Validate file_url exists
        if (!data.file_url) {
            results.failed++;
            results.failures.push({ mediaId, reason: 'No file_url to migrate from' });
            if (dry_run) {
                results.candidates.push({
                    mediaId,
                    ownerId: data.owner_id || '',
                    sourceDomain: data.source_domain || '',
                    hasFileUrl: false,
                    hasStoragePath: false,
                    hasLegacyFileUrl: !!data.legacy_file_url,
                    resolvedSourceRefId: data.source_ref_id || null,
                    authorizedIdentityIdsResolved: false,
                    validationFailures: ['No file_url'],
                });
            }
            continue;
        }
        // Validate legacy URL is from expected Base44 origin
        const urlValidation = validateLegacyUrl(data.file_url);
        if (!urlValidation.valid) {
            results.failed++;
            results.failures.push({ mediaId, reason: `Invalid legacy URL: ${urlValidation.reason}` });
            if (dry_run) {
                results.candidates.push({
                    mediaId,
                    ownerId: data.owner_id || '',
                    sourceDomain: data.source_domain || '',
                    hasFileUrl: true,
                    hasStoragePath: false,
                    hasLegacyFileUrl: !!data.legacy_file_url,
                    resolvedSourceRefId: data.source_ref_id || null,
                    authorizedIdentityIdsResolved: false,
                    validationFailures: [urlValidation.reason],
                });
            }
            continue;
        }
        // Resolve source_ref_id for protected media if not already set
        let sourceRefId = data.source_ref_id || null;
        let authorizedIdentityIds = null;
        if (!sourceRefId) {
            if (data.source_domain === 'messaging') {
                // Find the conversation containing a message with this attachment
                const msgsSnapshot = await shared_1.db.collection('messages')
                    .where('attachment_media_ids', 'array-contains', mediaId)
                    .limit(1)
                    .get();
                if (!msgsSnapshot.empty) {
                    sourceRefId = msgsSnapshot.docs[0].data().conversation_id || null;
                }
            }
            else if (data.source_domain === 'verification') {
                // Find the verification request containing this evidence
                const reqsSnapshot = await shared_1.db.collection('verificationRequests')
                    .where('evidence_media_ids', 'array-contains', mediaId)
                    .limit(1)
                    .get();
                if (!reqsSnapshot.empty) {
                    sourceRefId = reqsSnapshot.docs[0].id;
                }
            }
        }
        // For verification evidence, derive authorized_identity_ids
        // from the verification request's submitted_by_id. Storage Rules
        // use this for source-domain authorization within the 2-access limit.
        if (data.source_domain === 'verification' && sourceRefId) {
            const reqDoc = await shared_1.db.collection('verificationRequests').doc(sourceRefId).get();
            if (reqDoc.exists) {
                const req = reqDoc.data();
                if (req.submitted_by_id) {
                    authorizedIdentityIds = [req.submitted_by_id];
                }
            }
        }
        // dry_run: record analysis and skip upload/write
        if (dry_run) {
            results.candidates.push({
                mediaId,
                ownerId: data.owner_id || '',
                sourceDomain: data.source_domain || '',
                hasFileUrl: true,
                hasStoragePath: false,
                hasLegacyFileUrl: !!data.legacy_file_url,
                resolvedSourceRefId: sourceRefId,
                authorizedIdentityIdsResolved: authorizedIdentityIds !== null,
                validationFailures: [],
            });
            continue;
        }
        // --- Live migration ---
        try {
            // Download from validated Base44 storage origin
            const response = await fetch(data.file_url);
            if (!response.ok) {
                throw new Error(`Download failed: HTTP ${response.status}`);
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            // Upload to Firebase Storage at media/{mediaId}/original
            const storagePath = `media/${mediaId}/original`;
            const file = bucket.file(storagePath);
            await file.save(buffer, {
                metadata: {
                    contentType: data.mime_type || 'application/octet-stream',
                    metadata: {
                        mediaId,
                        ownerId: data.owner_id || '',
                        sourceDomain: data.source_domain || '',
                        sourceRefId: sourceRefId || '',
                        visibility: data.visibility || 'private',
                    },
                },
            });
            // Build update — only include authorized_identity_ids when
            // a new value was derived. This preserves existing server-
            // authoritative values instead of overwriting with null.
            const updateData = {
                storage_path: storagePath,
                source_ref_id: sourceRefId || data.source_ref_id || null,
                legacy_file_url: data.file_url,
                _updated_date: new Date().toISOString(),
            };
            if (authorizedIdentityIds !== null) {
                updateData.authorized_identity_ids = authorizedIdentityIds;
            }
            await doc.ref.update(updateData);
            results.migrated++;
        }
        catch (err) {
            results.failed++;
            results.failures.push({ mediaId, reason: err.message || 'Unknown error' });
        }
    }
    return results;
});
//# sourceMappingURL=media.js.map