import { base44 } from '@/api/base44Client';
import { mediaRepository } from '@/data/firebase';
import { useFirebase } from '@/lib/backendConfig';

// Media System — M3: routes to Firebase when configured.
// Media metadata is migrated to Firestore. Media FILES remain on Base44
// storage temporarily — file_url references are preserved.
// This is a remaining migration dependency (M3 §25).

function getMediaType(mimeType) {
  if (!mimeType) return 'document';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

// Upload a file through the authoritative Media pipeline.
export async function uploadMedia(file, ownerId, sourceDomain, visibility = 'private') {
  // Step 1: Create MediaAsset in uploading state
  const assetData = {
    owner_id: ownerId,
    media_type: getMediaType(file.type),
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    lifecycle_state: 'uploading',
    source_domain: sourceDomain,
    visibility,
  };

  let asset;
  if (useFirebase) {
    asset = await mediaRepository.createMediaAsset(assetData);
  } else {
    asset = await base44.entities.MediaAsset.create(assetData);
  }

  try {
    let storagePath;
    if (useFirebase) {
      // Step 2a: Upload to Firebase Cloud Storage
      storagePath = await mediaRepository.uploadMediaFile(asset.id, file, {
        owner_id: ownerId,
        visibility,
        source_domain: sourceDomain,
        lifecycle_state: 'uploading',
      });
    } else {
      // Step 2b: Upload to Base44 storage (legacy path)
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      storagePath = file_url;
    }

    // Step 3: Transition to active
    if (useFirebase) {
      // Resolve the Firebase Storage download URL for display purposes.
      // Firebase Storage download URLs are long-lived (do not expire).
      // file_url is preserved for backward compatibility with components
      // that display media via URL. storage_path is the authoritative
      // reference for server-side operations and storage rules.
      const downloadUrl = await mediaRepository.getMediaDownloadUrl(storagePath);
      return mediaRepository.updateMediaAsset(asset.id, {
        storage_path: storagePath,
        file_url: downloadUrl,
        lifecycle_state: 'active',
      });
    }
    return base44.entities.MediaAsset.update(asset.id, {
      file_url: storagePath,
      lifecycle_state: 'active',
    });
  } catch (err) {
    const failData = {
      lifecycle_state: 'processing_failed',
      processing_error: err.message || 'Upload failed',
    };
    if (useFirebase) {
      await mediaRepository.updateMediaAsset(asset.id, failData);
    } else {
      await base44.entities.MediaAsset.update(asset.id, failData);
    }
    throw err;
  }
}

export async function archiveMedia(mediaId) {
  if (useFirebase) return mediaRepository.updateMediaAsset(mediaId, { lifecycle_state: 'archived' });
  return base44.entities.MediaAsset.update(mediaId, { lifecycle_state: 'archived' });
}

export async function scheduleDeletion(mediaId) {
  if (useFirebase) return mediaRepository.updateMediaAsset(mediaId, { lifecycle_state: 'scheduled_for_deletion' });
  return base44.entities.MediaAsset.update(mediaId, { lifecycle_state: 'scheduled_for_deletion' });
}

export async function getMedia(mediaId) {
  if (!mediaId) return null;
  try {
    if (useFirebase) return mediaRepository.getMediaAsset(mediaId);
    return await base44.entities.MediaAsset.get(mediaId);
  } catch {
    return null;
  }
}

export function canAccessMedia(asset, viewerId, sourceDomainPermission) {
  if (!asset) return false;
  if (asset.lifecycle_state !== 'active') return false;
  if (asset.owner_id === viewerId) return true;
  if (asset.visibility === 'public') return sourceDomainPermission;
  if (asset.visibility === 'protected') return sourceDomainPermission && asset.owner_id === viewerId;
  return false;
}

export async function removeReference(mediaId) {
  return true;
}

/**
 * Gets a displayable URL for a media asset.
 * In Firebase mode, resolves a Firebase Storage download URL from the storage_path.
 * In Base44 mode, returns the file_url directly.
 * @param {object} asset — MediaAsset record
 * @returns {Promise<string|null>} URL or null
 */
export async function getMediaUrl(asset) {
  if (!asset) return null;
  if (useFirebase && asset.storage_path) {
    try {
      return await mediaRepository.getMediaDownloadUrl(asset.storage_path);
    } catch {
      // Fall back to legacy URL if Storage URL resolution fails
      return asset.legacy_file_url || asset.file_url || null;
    }
  }
  return asset.file_url || asset.legacy_file_url || null;
}