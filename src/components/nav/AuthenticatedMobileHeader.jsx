import { useNav } from '@/lib/NavContext';
import NotificationBell from '@/components/NotificationBell';

// Shared authenticated MOBILE header — dark navy full-width banner.
// ───────────────────────────────────────────────────────────
// Rendered by AuthenticatedShell for EVERY authenticated route
// (AppLayout routes + /directory) on mobile only (md:hidden). This is
// the single mobile header for the authenticated app — no per-route
// duplicate headers.
//
// The Interactive icon + "Interactive" on the LEFT is the tap target
// that opens the shared global navigation drawer (NavContext). There is
// NO hamburger on the right — the branding IS the menu button.
//
// Signed-out visitors never see this: the shell renders a plain Outlet
// for them, so the signed-out Directory keeps its own public header.
export default function AuthenticatedMobileHeader() {
  const { toggleNav } = useNav();
  return (
    <header className="md:hidden shrink-0 flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
      <button
        type="button"
        onClick={toggleNav}
        aria-label="Open navigation"
        className="flex items-center gap-2"
      >
        <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-xs">I</span>
        </div>
        <span className="font-semibold">Interactive</span>
      </button>
      <NotificationBell />
    </header>
  );
}