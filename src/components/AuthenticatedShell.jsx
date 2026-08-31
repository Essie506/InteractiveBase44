import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useNav } from '@/lib/NavContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import AuthenticatedSidebarContent from '@/components/AuthenticatedSidebarContent';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

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
//   - Desktop (md+): a collapsible <aside> (w-60 ↔ w-0). A "Collapse"
//     button sits at the bottom of the panel; when collapsed, an
//     expand button floats at the top-left of main (hidden on
//     /directory, where the page logo toggles instead).
//   - Mobile: the same panel as an overlay Sheet, same state.
export default function AuthenticatedShell() {
  const { user } = useAuth();
  const { navOpen, setNavOpen, toggleNav } = useNav();
  const isMobile = useIsMobile();
  const location = useLocation();
  const isDirectory = location.pathname === '/directory';

  if (!user) {
    return <Outlet />;
  }

  const collapseButton = (
    <div className="px-3 pb-3 shrink-0">
      <button
        onClick={() => setNavOpen(false)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
      >
        <PanelLeftClose className="w-4 h-4" />
        Collapse
      </button>
    </div>
  );

  return (
    <div className="flex h-screen bg-stone-50">
      {/* Desktop sidebar — persistent, collapsible */}
      <aside className={`hidden md:flex flex-col bg-slate-900 text-white shrink-0 transition-all duration-200 overflow-hidden ${navOpen ? 'w-60' : 'w-0'}`}>
        <div className="w-60 flex flex-col h-full">
          <AuthenticatedSidebarContent />
          {collapseButton}
        </div>
      </aside>

      {/* Mobile sidebar — overlay drawer, same panel + state */}
      {isMobile && (
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" hideClose className="w-60 bg-slate-900 text-white border-r-0 p-0 flex flex-col">
            <AuthenticatedSidebarContent />
            {collapseButton}
          </SheetContent>
        </Sheet>
      )}

      {/* Main content — route content renders beside the sidebar */}
      <main className="flex-1 overflow-auto relative">
        {!navOpen && !isDirectory && (
          <button
            onClick={toggleNav}
            className="hidden md:flex absolute top-3 left-3 z-40 w-8 h-8 items-center justify-center rounded-lg bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 shadow-sm"
            aria-label="Open navigation"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
        <Outlet />
      </main>
    </div>
  );
}