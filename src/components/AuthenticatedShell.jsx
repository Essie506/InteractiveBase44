import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useNav } from '@/lib/NavContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import AuthenticatedSidebarContent from '@/components/AuthenticatedSidebarContent';
import { PanelLeftOpen } from 'lucide-react';
import NavCollapseControl from '@/components/nav/NavCollapseControl';
import AuthenticatedTopNav from '@/components/nav/AuthenticatedTopNav';
import { getPageIdentity } from '@/lib/pageIdentity';

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
// A shared authenticated top navbar (AuthenticatedTopNav) sits above the
// sidebar + content on desktop: white bar, Interactive branding left,
// current page identity right (from getPageIdentity), thin bottom border.
// Below it, the sidebar + main content. The sidebar is toggleable:
//   - Desktop (md+): a collapsible <aside> (w-60 ↔ w-0) with small edge
//     collapse/expand controls (NavCollapseControl / PanelLeftOpen).
//   - Mobile: the same panel as an overlay Sheet, same state; the navbar
//     is hidden (each route uses its own mobile header/trigger).
export default function AuthenticatedShell() {
  const { user, isLoadingAuth } = useAuth();
  const { navOpen, setNavOpen } = useNav();
  const isMobile = useIsMobile();
  const location = useLocation();
  const identity = getPageIdentity(location.pathname);

  // Only render the authenticated chrome once auth has fully resolved
  // AND the user is confirmed authenticated. During loading, signed-out
  // Directory, or any unresolved/redirecting auth state, render plain
  // content — no sidebar/chrome flash.
  if (isLoadingAuth || !user) {
    return <Outlet />;
  }

  return (
    <div className="flex flex-col h-screen bg-stone-50">
      {/* Shared authenticated top navbar — desktop only. White bar:
          Interactive branding left, current page identity right, thin
          bottom border. Mobile uses each route's own header/trigger. */}
      <div className="hidden md:block shrink-0">
        <AuthenticatedTopNav pageIcon={identity.icon} pageLabel={identity.label} />
      </div>

      <div className="flex flex-1 overflow-hidden relative">
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
    </div>
  );
}