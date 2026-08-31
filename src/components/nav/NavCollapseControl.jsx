import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

// Edge-mounted collapse control for the LEFT navigation panel.
// Sits on the right edge of the open panel; clicking collapses it.
// Mirrors the right-side Directory filter drawer's chevron-tab
// treatment so the two drawers have complementary, visually distinct
// collapse controls (left = ChevronLeft, right = ChevronRight).
//
// Position is supplied by the caller via `className` (e.g. `left-60`)
// so the control stays generic and reusable across shells.
export default function NavCollapseControl({ onClose, className }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Collapse navigation"
      className={cn(
        'absolute top-8 -translate-x-1/2 w-7 h-7 bg-white border border-stone-200 rounded-full flex items-center justify-center shadow-sm hover:bg-stone-50 hover:border-stone-300 z-40 transition-colors',
        className
      )}
    >
      <ChevronLeft className="w-4 h-4 text-stone-600" />
    </button>
  );
}