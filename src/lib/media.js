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
    // Step 2: Upload file to storage (Base44 storage — temporary M3 dependency)
    const { file_url } = await base44.integrations.Core.UploadFile({ file });

    // Step 3: Transition to active
    const updateData = { file_url, lifecycle_state: 'active' };
    if (useFirebase) {
      return mediaRepository.updateMediaAsset(asset.id, updateData);
    }
    return base44.entities.MediaAsset.update(asset.id, updateData);
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