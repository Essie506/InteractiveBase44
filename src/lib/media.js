import { base44 } from '@/api/base44Client';

// Media System — Upload Once, Reference Everywhere
// Media owns the asset; connected systems own why/where it's used.

function getMediaType(mimeType) {
  if (!mimeType) return 'document';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

// Upload a file through the authoritative Media pipeline.
// Returns an Active MediaAsset with a stable Media ID.
export async function uploadMedia(file, ownerId, sourceDomain, visibility = 'private') {
  // 1. Create MediaAsset in uploading state (stable ID assigned)
  const asset = await base44.entities.MediaAsset.create({
    owner_id: ownerId,
    media_type: getMediaType(file.type),
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    lifecycle_state: 'uploading',
    source_domain: sourceDomain,
    visibility,
  });

  try {
    // 2. Upload file to storage
    const { file_url } = await base44.integrations.Core.UploadFile({ file });

    // 3. Transition to active
    const active = await base44.entities.MediaAsset.update(asset.id, {
      file_url,
      lifecycle_state: 'active',
    });
    return active;
  } catch (err) {
    // Failed upload → processing_failed (does not destroy any existing active version)
    await base44.entities.MediaAsset.update(asset.id, {
      lifecycle_state: 'processing_failed',
      processing_error: err.message || 'Upload failed',
    });
    throw err;
  }
}

// Archive a media asset (does NOT delete if referenced elsewhere)
export async function archiveMedia(mediaId) {
  return base44.entities.MediaAsset.update(mediaId, {
    lifecycle_state: 'archived',
  });
}

// Schedule deletion — actual deletion deferred to allow reference checks
export async function scheduleDeletion(mediaId) {
  return base44.entities.MediaAsset.update(mediaId, {
    lifecycle_state: 'scheduled_for_deletion',
  });
}

// Get a media asset by ID (for rendering / reference resolution)
export async function getMedia(mediaId) {
  if (!mediaId) return null;
  try {
    return await base44.entities.MediaAsset.get(mediaId);
  } catch {
    return null;
  }
}

// Dual-authorisation: source-domain permission + media permission = access
// This is a frontend check; true enforcement requires backend RLS.
export function canAccessMedia(asset, viewerId, sourceDomainPermission) {
  if (!asset) return false;
  if (asset.lifecycle_state !== 'active') return false;
  // Owner always has access
  if (asset.owner_id === viewerId) return true;
  // Public media — source-domain permission required
  if (asset.visibility === 'public') return sourceDomainPermission;
  // Protected media — both source-domain AND media permission required
  if (asset.visibility === 'protected') return sourceDomainPermission && asset.owner_id === viewerId;
  // Private/connections — owner only (for now)
  return false;
}

// Remove a profile reference without deleting the underlying asset.
// The asset may still be referenced by other systems.
export async function removeReference(mediaId) {
  // Do NOT delete — just note that this profile no longer references it.
  // The asset lifecycle is managed by Media, not by the referencing system.
  return true;
}