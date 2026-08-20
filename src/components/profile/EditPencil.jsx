import { Pencil } from 'lucide-react';

/**
 * Subtle pencil edit button used across all Interactive profile types.
 * Shown only when `editable` is true on the parent view.
 */
export function EditPencil({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center justify-center w-6 h-6 -ml-1 text-stone-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
    >
      <Pencil className="w-3.5 h-3.5" />
    </button>
  );
}