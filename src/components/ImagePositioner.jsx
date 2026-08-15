import { useRef, useState, useCallback } from 'react';
import { ZoomIn, RotateCcw, Move } from 'lucide-react';

/**
 * ImagePositioner — non-destructive focal-point + zoom editor.
 *
 * Stores presentation metadata (focal point x/y + zoom) separately from
 * the source MediaAsset. The original upload is never modified.
 *
 * Rendering uses object-fit: cover + transform: scale(zoom) with
 * transform-origin at the focal point, so the focal point stays centred
 * when zooming and panning.
 *
 * Props:
 *   imageUrl   — source image URL
 *   value      — { x, y, zoom }  (x,y in 0..1, zoom >= 1)
 *   onChange   — (value) => void
 *   shape      — 'circle' | 'rect'
 *   aspect     — CSS aspect ratio for rect (e.g. '16 / 5')
 *   label      — heading text
 *   preview    — optional { width, label } mobile preview for rect mode
 */
export default function ImagePositioner({
  imageUrl,
  value,
  onChange,
  shape = 'rect',
  aspect = '16 / 5',
  label = 'Reposition',
  preview = null,
}) {
  const containerRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const v = { x: 0.5, y: 0.5, zoom: 1, ...value };

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  const handlePointerDown = (e) => {
    if (v.zoom <= 1) return;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback((e) => {
    if (!dragging || v.zoom <= 1) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Pan range scales with zoom overflow.
    const range = v.zoom - 1;
    const dx = e.movementX / (rect.width * range);
    const dy = e.movementY / (rect.height * range);
    onChange({
      ...v,
      x: clamp(v.x - dx, 0, 1),
      y: clamp(v.y - dy, 0, 1),
    });
  }, [dragging, v, onChange]);

  const handlePointerUp = () => setDragging(false);

  const setZoom = (z) => onChange({ ...v, zoom: clamp(z, 1, 4) });
  const reset = () => onChange({ ...v, x: 0.5, y: 0.5, zoom: 1 });

  const containerStyle = shape === 'circle'
    ? { width: 160, height: 160, borderRadius: '9999px' }
    : { width: '100%', aspectRatio: aspect, borderRadius: 16 };

  const imgStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: '50% 50%',
    transform: `scale(${v.zoom})`,
    transformOrigin: `${v.x * 100}% ${v.y * 100}%`,
    userSelect: 'none',
    pointerEvents: 'none',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
        <Move className="w-4 h-4 text-stone-500" /> {label}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className={`relative overflow-hidden bg-stone-100 border border-stone-200 shrink-0 ${v.zoom > 1 ? 'cursor-grab' : ''} ${dragging ? 'cursor-grabbing' : ''}`}
          style={containerStyle}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="" style={imgStyle} draggable={false} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-stone-400 text-sm">No image</div>
          )}
        </div>

        {preview && shape === 'rect' && imageUrl && (
          <div className="space-y-1">
            <div className="text-xs text-stone-500">{preview.label}</div>
            <div className="overflow-hidden rounded-md border border-stone-200" style={{ width: preview.width, aspectRatio: aspect }}>
              <img src={imageUrl} alt="" style={imgStyle} draggable={false} />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <ZoomIn className="w-4 h-4 text-stone-500 shrink-0" />
        <input
          type="range"
          min={1}
          max={4}
          step={0.05}
          value={v.zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="flex-1 accent-indigo-600"
        />
        <span className="text-xs text-stone-500 w-10 text-right">{Math.round(v.zoom * 100)}%</span>
        <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700">
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>
      {v.zoom <= 1 && (
        <p className="text-xs text-stone-400">Zoom in to reposition the image.</p>
      )}
    </div>
  );
}