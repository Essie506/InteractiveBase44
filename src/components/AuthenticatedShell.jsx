import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useNav } from '@/lib/NavContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import AuthenticatedSidebarContent from '@/components/AuthenticatedSidebarContent';
import NavCollapseControl from '@/components/nav/NavCollapseControl';
import NavTrigger from '@/components/nav/NavTrigger';

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
//   - Desktop (md+): a collapsible <aside> (w-60 ↔ w-0). When open, a
//     small edge collapse control (NavCollapseControl) sits on the
//     panel's right edge; when collapsed, a shared NavTrigger sits
//     in-flow at the top of main (consistent spacing, not floating).
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
      {/* Desktop sidebar — persistent, collapsible */}
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

      {/* Main content — route content renders beside the sidebar.
          When the sidebar is closed, a shared NavTrigger sits in-flow at
          the top of main (desktop) with consistent spacing — deliberately
          positioned, not floating. Mobile uses each route's own trigger. */}
      <main className="flex-1 overflow-auto relative">
        {!navOpen && !isMobile && (
          <div className="px-6 md:px-10 pt-6 md:pt-10">
            <NavTrigger />
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}