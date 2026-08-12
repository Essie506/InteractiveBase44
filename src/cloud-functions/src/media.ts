// Media migration — admin-only
// ───────────────────────────────────────────────────────────
// Copies existing Base44-hosted Media files into Firebase Cloud Storage.
// Idempotent: skips assets that already have a storage_path.
// Preserves Media IDs, owner, lifecycle state, and source-domain references.
// Retains legacy Base44 URL in legacy_file_url for rollback.
//
// Storage path strategy: media/{mediaId}/original
// Does NOT delete Base44 copies during M4.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getStorage } from 'firebase-admin/storage';
import { db, allowedOrigins, requireAdmin } from './shared';

export const migrateMedia = onCall(
  { region: 'europe-west2', cors: allowedOrigins, timeoutSeconds: 540 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    await requireAdmin(request.auth.uid);

    const { batch_size } = request.data || {};
    const limit = Math.min(batch_size || 100, 500);

    const storage = getStorage();
    const bucket = storage.bucket();

    // List mediaAssets that have a file_url but no storage_path yet
    let query = db.collection('mediaAssets')
      .where('file_url', '>', '')
      .limit(limit);

    const snapshot = await query.get();

    const results = {
      total: snapshot.size,
      migrated: 0,
      failed: 0,
      skipped: 0,
      failures: [] as Array<{ mediaId: string; reason: string }>,
    };

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const mediaId = doc.id;

      // Skip if already migrated
      if (data.storage_path) {
        results.skipped++;
        continue;
      }

      if (!data.file_url) {
        results.failed++;
        results.failures.push({ mediaId, reason: 'No file_url' });
        continue;
      }

      try {
        // Download from Base44 storage
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
              visibility: data.visibility || 'private',
            },
          },
        });

        // Update MediaAsset: store storage_path, preserve legacy URL
        await doc.ref.update({
          storage_path: storagePath,
          legacy_file_url: data.file_url,
          _updated_date: new Date().toISOString(),
        });

        results.migrated++;
      } catch (err: any) {
        results.failed++;
        results.failures.push({ mediaId, reason: err.message || 'Unknown error' });
      }
    }

    return results;
  }
);