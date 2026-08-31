import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useNav } from '@/lib/NavContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import AuthenticatedSidebarContent from '@/components/AuthenticatedSidebarContent';
import { PanelLeftOpen } from 'lucide-react';
import NavCollapseControl from '@/components/nav/NavCollapseControl';

// Persistent authenticated navigation shell.
// ───────────────────────────────────────────────────────────
// Rendered as a layout route wrapping /directory + the AppLayout
// routes. The sidebar lives HERE (above the per-route content), so
// navigating between /directory and any AppLayout route changes only
// the <Outlet/> — the panel, its width, and its open/closed state are
// never destroyed/recreated.
//
// One panel, one width (w-60), one open/closed state (NavContext),
// one inner implementation (AuthenticatedSidebarContent).
//
// Signed-out visitors get a plain <Outlet/> (no sidebar); the signed-out
// Directory keeps its own public drawer. AppLayout routes are
// ProtectedRoute-gated, so a signed-out user never reaches them here.
//
// Toggleable on all viewports:
//   - Desktop (md+): a collapsible <aside> (w-60 ↔ w-0), full-height
//     (the shell is h-screen, so the sidebar spans the full viewport
//     height regardless of page content). When open, a small edge
//     collapse control (NavCollapseControl) sits on the panel's right
//     edge; when collapsed, a compact edge expand control (PanelLeftOpen)
//     sits at the left edge of main — the symmetric counterpart.
//   - Mobile: the same panel as an overlay Sheet, same state.
export default function AuthenticatedShell() {
  const { user, isLoadingAuth } = useAuth();
  const { navOpen, setNavOpen } = useNav();
  const isMobile = useIsMobile();

  // Only render the authenticated chrome once auth has fully resolved
  // AND the user is confirmed authenticated. During loading, signed-out
  // Directory, or any unresolved/redirecting auth state, render plain
  // content — no sidebar/chrome flash.
  if (isLoadingAuth || !user) {
    return <Outlet />;
  }

  return (
    <div className="flex h-screen bg-stone-50 relative">
      {/* Desktop sidebar — persistent, collapsible, full-height */}
      <aside className={`hidden md:flex flex-col bg-slate-900 text-white shrink-0 transition-all duration-200 overflow-hidden ${navOpen ? 'w-60' : 'w-0'}`}>
        <div className="w-60 flex flex-col h-full">
          <AuthenticatedSidebarContent />
        </div>
      </aside>

      {/* Edge collapse control — right edge of the open left panel.
          Complementary to the right-side filter drawer's chevron; only
          shown on desktop (mobile uses the overlay Sheet's own close). */}
      {navOpen && !isMobile && (
        <NavCollapseControl onClose={() => setNavOpen(false)} className="left-60" />
      )}

      {/* Mobile sidebar — overlay drawer, same panel + state.
          The Sheet's built-in close (X) is the single close control. */}
      {isMobile && (
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="w-60 bg-slate-900 text-white border-r-0 p-0 flex flex-col">
            <AuthenticatedSidebarContent />
          </SheetContent>
        </Sheet>
      )}

      {/* Compact edge expand control — left edge of main when the
          sidebar is collapsed (desktop). Symmetric counterpart to the
          NavCollapseControl on the open panel's right edge. */}
      {!navOpen && !isMobile && (
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          aria-label="Open navigation"
          className="absolute top-8 left-0 translate-x-1/2 w-7 h-7 bg-white border border-stone-200 rounded-full flex items-center justify-center shadow-sm hover:bg-stone-50 hover:border-stone-300 z-40 transition-colors"
        >
          <PanelLeftOpen className="w-4 h-4 text-stone-600" />
        </button>
      )}

      {/* Main content — route content renders beside the sidebar */}
      <main className="flex-1 overflow-auto relative">
        <Outlet />
      </main>
    </div>
  );
}