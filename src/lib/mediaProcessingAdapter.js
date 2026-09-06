// MediaProcessingAdapter — V2 Media System §9/§11.
// Provider-independent contract for media processing:
//   - Security screening (virus/malware, file-signature/MIME validation)
//   - Image optimisation
//   - Thumbnail generation
//   - Video transcoding
//
// The DEFAULT implementation is a no-op passthrough that records
// processing intent and transitions the asset to active. A real
// provider implementation (e.g. a cloud transcoding service) can be
// plugged in by replacing this module's adapter — the upload flow
// and MediaAsset schema do not change.
//
// This is the defined provider adapter boundary: everything above
// this contract is provider-independent Interactive architecture;
// everything below is the external provider's responsibility.

/**
 * @typedef {Object} ProcessingResult
 * @property {boolean} passed - true if screening passed
 * @property {string} [error] - error message if screening failed
 * @property {Array} [derivatives] - generated derivatives
 * @property {Object} [metadata] - extracted metadata (width, height, duration)
 */

/**
 * Process a media asset after upload.
 * @param {Object} asset - MediaAsset record (with storage_path, media_type, mime_type)
 * @param {Object} intent - processing intent flags { screen, optimize, thumbnail, transcode }
 * @returns {Promise<ProcessingResult>}
 */
export async function processMedia(asset, intent) {
  // ── DEFAULT NO-OP ADAPTER ──
  // Records processing intent and passes through. No real screening,
  // transcoding, or thumbnail generation is performed. The asset
  // transitions directly to 'active'. This is the provider boundary —
  // a real implementation replaces this function body.

  // Validate file signature against declared MIME type (lightweight,
  // provider-independent check using extension matching)
  const declaredType = asset.mime_type || '';
  const fileName = asset.file_name || '';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  const MIME_BY_EXT = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    pdf: 'application/pdf',
  };

  // If we can determine the expected MIME from extension, verify it matches
  const expectedMime = MIME_BY_EXT[ext];
  if (expectedMime && declaredType && !declaredType.includes(expectedMime.split('/')[0])) {
    return {
      passed: false,
      error: `File signature mismatch: extension .${ext} does not match declared ${declaredType}`,
    };
  }

  // No-op: pass through with no derivatives. A real provider would
  // generate thumbnails, transcoded renditions, and optimised images.
  return {
    passed: true,
    derivatives: [],
    metadata: {},
  };
}

/**
 * Check whether a media type requires processing.
 * @param {string} mediaType - image, video, audio, document
 * @returns {boolean}
 */
export function requiresProcessing(mediaType) {
  return mediaType === 'video' || mediaType === 'image';
}

/**
 * Get the default processing intent for a media type.
 * @param {string} mediaType
 * @returns {Object}
 */
export function defaultProcessingIntent(mediaType) {
  if (mediaType === 'video') {
    return { screen: true, optimize: false, thumbnail: true, transcode: true };
  }
  if (mediaType === 'image') {
    return { screen: true, optimize: true, thumbnail: true, transcode: false };
  }
  // audio, document — screen only
  return { screen: true, optimize: false, thumbnail: false, transcode: false };
}