import { useRef, useState } from 'react';
import { ZoomIn, RotateCcw, Move } from 'lucide-react';

/**
 * ImagePositioner — non-destructive focal-point + zoom editor.
 *
 * Stores presentation metadata (focal point x/y + zoom) separately from
 * the source MediaAsset. The original upload is never modified.
 *
 * Interaction model:
 *   - Drag (mouse or touch) anywhere on the image to set the focal point
 *     to the pointer position. Works at any zoom level.
 *   - Zoom slider scales the image around the focal point.
 *
 * Props:
 *   imageUrl, value { x, y, zoom }, onChange, shape, aspect, label, preview
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
  // Ref mirror of latest value + onChange so pointer handlers never read
  // stale closures between rapid move events.
  const stateRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const v = { x: 0.5, y: 0.5, zoom: 1, ...value };
  stateRef.current = { v, onChange };

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  const setFocalFromPointer = (e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { v, onChange } = stateRef.current;
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    onChange({ ...v, x, y });
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    setDragging(true);
    setFocalFromPointer(e);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };

  const handlePointerMove = (e) => {
    if (!dragging) return;
    setFocalFromPointer(e);
  };

  const handlePointerUp = (e) => {
    setDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };

  const setZoom = (z) => onChange({ ...v, zoom: clamp(z, 1, 4) });
  const reset = () => onChange({ x: 0.5, y: 0.5, zoom: 1 });

  const containerStyle = shape === 'circle'
    ? { width: 180, height: 180, borderRadius: '9999px' }
    : shape === 'rounded'
    ? { width: 180, height: 180, borderRadius: 16 }
    : { width: '100%', aspectRatio: aspect, borderRadius: 16 };

  const imgStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
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
          className={`relative overflow-hidden bg-stone-100 border border-stone-200 shrink-0 cursor-grab ${dragging ? 'cursor-grabbing' : ''} touch-none`}
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
      <p className="text-xs text-stone-400">Drag on the image to set the focal point. Use the slider to zoom.</p>
    </div>
  );
}