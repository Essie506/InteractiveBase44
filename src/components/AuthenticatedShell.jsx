import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useNav } from '@/lib/NavContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import AuthenticatedSidebarContent from '@/components/AuthenticatedSidebarContent';
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
// Layout: a full-height global nav drawer on the far left + a content
// area to its right. The content area is a column: the shared top
// navbar (AuthenticatedTopNav) on top, page content below.
//   - Global drawer: full-height (the shell is h-screen, so the aside
//     spans the full viewport height regardless of page content), w-60
//     ↔ w-0, persistent open/closed state (NavContext). The navbar's
//     left trigger opens/closes it. It is NOT the page-specific workspace
//     sidebar — that lives inside page content (e.g. Professional
//     Workspace), to the right of this drawer.
//   - Mobile: the same panel as an overlay Sheet, same state; the
//     navbar is hidden (each route uses its own mobile header/trigger).
export default function AuthenticatedShell() {
  const { user, isLoadingAuth } = useAuth();
  const { navOpen, setNavOpen, toggleNav } = useNav();
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
    <div className="flex h-screen bg-stone-50 relative">
      {/* Global nav drawer — full-height, far left, w-60 ↔ w-0.
          This is the persistent Interactive navigation, NOT a page
          workspace sidebar. Full viewport height (shell is h-screen). */}
      <aside className={`hidden md:flex flex-col bg-slate-900 text-white shrink-0 transition-all duration-200 overflow-hidden ${navOpen ? 'w-60' : 'w-0'}`}>
        <div className="w-60 flex flex-col h-full">
          <AuthenticatedSidebarContent />
        </div>
      </aside>

      {/* Mobile drawer — overlay Sheet, same panel + state. The
          Sheet's built-in close (X) is the mobile close control. */}
      {isMobile && (
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="w-60 bg-slate-900 text-white border-r-0 p-0 flex flex-col">
            <AuthenticatedSidebarContent />
          </SheetContent>
        </Sheet>
      )}

      {/* Content area — right of the global drawer: shared navbar on
          top, page content below. Page-specific secondary sidebars
          (e.g. Professional Workspace) render inside <Outlet/>, separate
          from this global drawer. */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Shared top navbar — desktop only. Left: global nav trigger
            (opens/closes the drawer); right: current page identity. */}
        <div className="hidden md:block shrink-0">
          <AuthenticatedTopNav
            pageIcon={identity.icon}
            pageLabel={identity.label}
            navOpen={navOpen}
            onToggleNav={toggleNav}
          />
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
}