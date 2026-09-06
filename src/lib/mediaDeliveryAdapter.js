// MediaDeliveryAdapter — V2 Media System §6.
// Provider-independent contract for media delivery:
//   - CDN distribution
//   - Adaptive bitrate streaming (HLS/DASH for video)
//   - Adaptive resolution selection
//   - Progressive loading
//
// The DEFAULT implementation returns the Firebase Storage download URL
// directly (passthrough). A real provider implementation (e.g. a CDN
// with HLS streaming) can be plugged in by replacing this module's
// adapter — the consumption code and MediaAsset schema do not change.
//
// This is the defined provider adapter boundary for delivery.

import { mediaRepository } from '@/data/firebase';
import { useFirebase } from '@/lib/backendConfig';
import { callGetProtectedMediaUrl } from '@/services/firebaseFunctions';

/**
 * Get the delivery URL for a media asset.
 * Falls back to the stored file_url when no provider is configured.
 * @param {Object} asset - MediaAsset record
 * @returns {Promise<string|null>} delivery URL
 */
export async function getDeliveryUrl(asset) {
  if (!asset) return null;

  // ── DEFAULT PASSTHROUGH ADAPTER ──
  // Returns the Firebase Storage download URL directly. No CDN,
  // no adaptive streaming. A real provider would return a CDN URL
  // or an HLS manifest URL for video.

  if (useFirebase && asset.storage_path) {
    const sourceDomain = asset.source_domain;
    // Protected media (messaging, verification): server-mediated signed URL
    if (sourceDomain === 'messaging' || sourceDomain === 'verification') {
      try {
        const result = await callGetProtectedMediaUrl({ media_id: asset.id });
        return result.url;
      } catch {
        return null;
      }
    }
    // Non-protected: Firebase Storage download URL
    try {
      return await mediaRepository.getMediaDownloadUrl(asset.storage_path);
    } catch {
      return asset.legacy_file_url || asset.file_url || null;
    }
  }

  return asset.file_url || asset.legacy_file_url || null;
}

/**
 * Get the streaming manifest URL for a video asset.
 * Falls back to the direct URL when no streaming provider is configured.
 * @param {Object} asset - MediaAsset record (video)
 * @returns {Promise<string|null>} streaming URL or direct URL
 */
export async function getStreamingUrl(asset) {
  if (!asset) return null;
  // ── DEFAULT: no streaming manifest — return direct URL ──
  return getDeliveryUrl(asset);
}

/**
 * Get the thumbnail URL for a media asset.
 * Uses the first 'thumbnail' derivative if available, otherwise falls
 * back to the delivery URL for images, or null for video without a
 * generated thumbnail.
 * @param {Object} asset - MediaAsset record
 * @returns {Promise<string|null>} thumbnail URL
 */
export async function getThumbnailUrl(asset) {
  if (!asset) return null;
  if (Array.isArray(asset.derivatives)) {
    const thumb = asset.derivatives.find((d) => d.type === 'thumbnail');
    if (thumb?.url) return thumb.url;
  }
  // Images can serve as their own thumbnail
  if (asset.media_type === 'image') return getDeliveryUrl(asset);
  return null;
}

/**
 * Check whether a media asset has completed processing and is ready
 * for delivery.
 * @param {Object} asset - MediaAsset record
 * @returns {boolean}
 */
export function isDeliveryReady(asset) {
  return asset?.lifecycle_state === 'active';
}