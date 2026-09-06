import { base44 } from '@/api/base44Client';
import { mediaRepository } from '@/data/firebase';
import { useFirebase } from '@/lib/backendConfig';
import { callGetProtectedMediaUrl } from '@/services/firebaseFunctions';
import { processMedia, defaultProcessingIntent } from '@/lib/mediaProcessingAdapter';

// Media System — V2 §9 Upload Engine.
// Routes all uploads through the canonical lifecycle:
//   pending_upload → uploading → validating → processing → active
// (or → quarantined / processing_failed on failure)
//
// The Processing Adapter (mediaProcessingAdapter.js) handles
// screening/optimisation/transcoding at the provider boundary.
// The Delivery Adapter (mediaDeliveryAdapter.js) handles CDN/streaming
// at the provider boundary. Both have default no-op/passthrough
// implementations so the Interactive architecture is provider-independent.

function getMediaType(mimeType) {
  if (!mimeType) return 'document';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

// Upload a file through the authoritative Media pipeline.
export async function uploadMedia(file, ownerId, sourceDomain, visibility = 'private', sourceRefId = null, authorizedIdentityIds = null) {
  const mediaType = getMediaType(file.type);
  const intent = defaultProcessingIntent(mediaType);

  // Step 1: Create MediaAsset in uploading state with processing intent
  const assetData = {
    owner_id: ownerId,
    media_type: mediaType,
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    lifecycle_state: 'uploading',
    source_domain: sourceDomain,
    source_ref_id: sourceRefId,
    authorized_identity_ids: authorizedIdentityIds,
    visibility,
    processing_intent: intent,
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
        source_ref_id: sourceRefId,
        lifecycle_state: 'uploading',
      });
    } else {
      // Step 2b: Upload to Base44 storage (legacy path)
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      storagePath = file_url;
    }

    // Step 3: Transition to validating
    const validatingData = { lifecycle_state: 'validating' };
    if (useFirebase) {
      await mediaRepository.updateMediaAsset(asset.id, validatingData);
    } else {
      await base44.entities.MediaAsset.update(asset.id, validatingData);
    }

    // Step 4: Transition to processing
    const processingData = { lifecycle_state: 'processing' };
    if (useFirebase) {
      await mediaRepository.updateMediaAsset(asset.id, processingData);
    } else {
      await base44.entities.MediaAsset.update(asset.id, processingData);
    }

    // Step 5: Run the Processing Adapter (screening, optimisation, transcoding)
    const result = await processMedia(
      { ...asset, storage_path: storagePath, file_name: file.name, mime_type: file.type },
      intent,
    );

    if (!result.passed) {
      // Security screening failed → quarantine
      const quarantineData = {
        lifecycle_state: 'quarantined',
        processing_error: result.error || 'Security screening failed',
      };
      if (useFirebase) {
        await mediaRepository.updateMediaAsset(asset.id, quarantineData);
      } else {
        await base44.entities.MediaAsset.update(asset.id, quarantineData);
      }
      throw new Error(result.error || 'Media failed security screening');
    }

    // Step 6: Transition to active
    if (useFirebase) {
      const downloadUrl = await mediaRepository.getMediaDownloadUrl(storagePath);
      return mediaRepository.updateMediaAsset(asset.id, {
        storage_path: storagePath,
        file_url: downloadUrl,
        lifecycle_state: 'active',
        derivatives: result.derivatives || [],
      });
    }
    return base44.entities.MediaAsset.update(asset.id, {
      file_url: storagePath,
      lifecycle_state: 'active',
      derivatives: result.derivatives || [],
    });
  } catch (err) {
    // Don't overwrite quarantined state with processing_failed
    const failData = {
      lifecycle_state: 'processing_failed',
      processing_error: err.message || 'Upload failed',
    };
    if (useFirebase) {
      const current = await mediaRepository.getMediaAsset(asset.id);
      if (current?.lifecycle_state !== 'quarantined') {
        await mediaRepository.updateMediaAsset(asset.id, failData);
      }
    } else {
      const current = await base44.entities.MediaAsset.get(asset.id);
      if (current?.lifecycle_state !== 'quarantined') {
        await base44.entities.MediaAsset.update(asset.id, failData);
      }
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
 * Gets a displayable URL for a media asset via the Delivery Adapter.
 * @param {object} asset — MediaAsset record
 * @returns {Promise<string|null>} URL or null
 */
export async function getMediaUrl(asset) {
  if (!asset) return null;
  if (useFirebase && asset.storage_path) {
    const sourceDomain = asset.source_domain;
    if (sourceDomain === 'messaging' || sourceDomain === 'verification') {
      try {
        const result = await callGetProtectedMediaUrl({ media_id: asset.id });
        return result.url;
      } catch {
        return null;
      }
    }
    try {
      return await mediaRepository.getMediaDownloadUrl(asset.storage_path);
    } catch {
      return asset.legacy_file_url || asset.file_url || null;
    }
  }
  return asset.file_url || asset.legacy_file_url || null;
}