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
//   - Query filters unmigrated assets (storage_path == null) so
//     migrated documents are excluded from subsequent batches and
//     migration progresses naturally without cursor pagination.
//   - dry_run mode performs analysis without uploading or writing.
//   - Legacy URL validation restricts fetch() to expected Base44
//     storage origins — rejects malformed or unexpected external URLs.
//   - authorized_identity_ids is only written when a new value is
//     derived — existing server-authoritative values are preserved.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getStorage } from 'firebase-admin/storage';
import { db, allowedOrigins, requireAdmin, getIdentityId, isAdmin } from './shared';

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
export const getProtectedMediaUrl = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { media_id } = request.data || {};
    if (!media_id) {
      throw new HttpsError('invalid-argument', 'media_id is required');
    }

    // Resolve caller identity
    const callerIdentityId = await getIdentityId(request.auth.uid);

    // Read media asset
    const assetRef = db.collection('mediaAssets').doc(media_id);
    const assetDoc = await assetRef.get();
    if (!assetDoc.exists) {
      throw new HttpsError('not-found', 'Media asset not found');
    }
    const asset = assetDoc.data()!;

    // Check lifecycle state
    const lifecycleState = asset.lifecycle_state || 'active';
    if (lifecycleState === 'deleted' || lifecycleState === 'scheduled_for_deletion') {
      throw new HttpsError('permission-denied', 'Media is not available');
    }

    // Owner always has access
    const isOwner = asset.owner_id === callerIdentityId;

    // Admin always has access
    const admin = await isAdmin(callerIdentityId);

    if (!isOwner && !admin) {
      // Source-domain authorization for non-owners
      const sourceDomain = asset.source_domain;
      const sourceRefId = asset.source_ref_id;

      if (sourceDomain === 'messaging') {
        // Message attachment: verify conversation participation
        if (!sourceRefId) {
          throw new HttpsError('permission-denied', 'Attachment not linked to a conversation');
        }
        const convDoc = await db.collection('conversations').doc(sourceRefId).get();
        if (!convDoc.exists) {
          throw new HttpsError('permission-denied', 'Conversation not found');
        }
        const conv = convDoc.data()!;
        const participantIds: string[] = conv.participant_ids || [];
        if (!participantIds.includes(callerIdentityId) || conv.status !== 'active') {
          throw new HttpsError('permission-denied', 'Not a participant in this conversation');
        }
      } else if (sourceDomain === 'verification') {
        // Verification evidence: verify submitter
        if (!sourceRefId) {
          throw new HttpsError('permission-denied', 'Evidence not linked to a verification request');
        }
        const reqDoc = await db.collection('verificationRequests').doc(sourceRefId).get();
        if (!reqDoc.exists) {
          throw new HttpsError('permission-denied', 'Verification request not found');
        }
        const req = reqDoc.data()!;
        if (req.submitted_by_id !== callerIdentityId) {
          throw new HttpsError('permission-denied', 'Not authorized to view this evidence');
        }
      } else {
        // Non-protected source domain: check visibility
        if (asset.visibility !== 'public' || lifecycleState !== 'active') {
          throw new HttpsError('permission-denied', 'Not authorized to view this media');
        }
      }
    }

    // Generate short-lived signed URL (15 minutes)
    const storagePath = asset.storage_path || `media/${media_id}/original`;
    const storage = getStorage();
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    });

    return { url: signedUrl, expires_in: 900 };
  }
);

// ── Legacy URL validation ────────────────────────────────────
// Only fetch from expected Base44 legacy storage origins.
// Rejects malformed or unexpected external URLs to prevent
// arbitrary server-side fetches during migration.
const ALLOWED_LEGACY_HOSTS = [
  'media.base44.com',
  'static.wixstatic.com',
];

function validateLegacyUrl(url: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return { valid: false, reason: 'URL must use HTTPS' };
    }
    if (!ALLOWED_LEGACY_HOSTS.includes(parsed.hostname)) {
      return { valid: false, reason: `Unexpected host: ${parsed.hostname}` };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'Malformed URL' };
  }
}

// ── migrateMedia ────────────────────────────────────────────
// Admin-only. Copies Base44-hosted Media files into Firebase Storage.
//
// Query progression: filters by storage_path == null, which matches
// both null and absent (missing-field) legacy documents. Already-
// migrated assets (storage_path set) are excluded from the query,
// so each batch retrieves fresh unmigrated documents and the
// migration progresses naturally without cursor-based pagination.
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
export const migrateMedia = onCall(
  { region: 'europe-west2', cors: allowedOrigins, timeoutSeconds: 540 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await requireAdmin(request.auth.uid);

    const { dry_run, batch_size } = request.data || {};
    // Clamp batch_size to safe range 1–500
    const limit = Math.max(1, Math.min(batch_size || 100, 500));

    const storage = getStorage();
    const bucket = storage.bucket();

    // Select unmigrated MediaAssets: storage_path is null OR absent.
    // Firestore `== null` matches both null and missing fields, so
    // legacy documents without a storage_path field are included.
    // Already-migrated assets (storage_path set) are excluded,
    // ensuring migration progresses across batches without
    // re-processing the same documents.
    const query = db.collection('mediaAssets')
      .where('storage_path', '==', null)
      .limit(limit);

    const snapshot = await query.get();

    const results = {
      dry_run: !!dry_run,
      total: snapshot.size,
      migrated: 0,
      failed: 0,
      skipped: 0,
      candidates: [] as Array<{
        mediaId: string;
        ownerId: string;
        sourceDomain: string;
        hasFileUrl: boolean;
        hasStoragePath: boolean;
        hasLegacyFileUrl: boolean;
        resolvedSourceRefId: string | null;
        authorizedIdentityIdsResolved: boolean;
        validationFailures: string[];
      }>,
      failures: [] as Array<{ mediaId: string; reason: string }>,
    };

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const mediaId = doc.id;

      // Defensive safety net: skip if already migrated
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
            validationFailures: [urlValidation.reason!],
          });
        }
        continue;
      }

      // Resolve source_ref_id for protected media if not already set
      let sourceRefId = data.source_ref_id || null;
      let authorizedIdentityIds: string[] | null = null;

      if (!sourceRefId) {
        if (data.source_domain === 'messaging') {
          // Find the conversation containing a message with this attachment
          const msgsSnapshot = await db.collection('messages')
            .where('attachment_media_ids', 'array-contains', mediaId)
            .limit(1)
            .get();
          if (!msgsSnapshot.empty) {
            sourceRefId = msgsSnapshot.docs[0].data().conversation_id || null;
          }
        } else if (data.source_domain === 'verification') {
          // Find the verification request containing this evidence
          const reqsSnapshot = await db.collection('verificationRequests')
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
        const reqDoc = await db.collection('verificationRequests').doc(sourceRefId).get();
        if (reqDoc.exists) {
          const req = reqDoc.data()!;
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
        const updateData: Record<string, any> = {
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
      } catch (err: any) {
        results.failed++;
        results.failures.push({ mediaId, reason: err.message || 'Unknown error' });
      }
    }

    return results;
  }
);