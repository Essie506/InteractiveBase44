import { useNav } from '@/lib/NavContext';

// Header-level trigger that opens the left navigation drawer.
// Renders the Interactive brand mark + label. Shown only when the nav
// is closed; when open, the panel's edge collapse control takes over
// so there is no duplicate "Interactive" trigger beside the open nav.
//
// Defaults to the shared NavContext toggle (authenticated shell). For
// public drawers that manage their own open state, pass an `onOpen`.
export default function NavTrigger({ onOpen }) {
  const { toggleNav } = useNav();
  const handleOpen = onOpen ?? toggleNav;
  return (
    <button
      type="button"
      onClick={handleOpen}
      className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
      aria-label="Open navigation menu"
    >
      <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
        <span className="text-white font-bold text-sm">I</span>
      </div>
      <span className="font-semibold text-stone-800">Interactive</span>
    </button>
  );
}