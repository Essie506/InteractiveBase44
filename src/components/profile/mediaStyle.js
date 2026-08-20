/**
 * Builds the CSS style for focal-point + zoom rendering of an image.
 * Used by ProfileHeader and ImagePositioner to apply presentation
 * metadata (focal point x/y + zoom) without modifying the source MediaAsset.
 */
export function mediaStyle(pos) {
  const p = { x: 0.5, y: 0.5, zoom: 1, ...pos };
  return {
    objectFit: 'cover',
    transform: `scale(${p.zoom})`,
    transformOrigin: `${p.x * 100}% ${p.y * 100}%`,
  };
}