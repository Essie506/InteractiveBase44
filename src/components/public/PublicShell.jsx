import { Outlet } from 'react-router-dom';
import { useNav } from '@/lib/NavContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import PublicNavContent from '@/components/public/PublicNavContent';
import PublicMobileNav from '@/components/public/PublicMobileNav';

// Persistent public (signed-out) navigation shell.
// ───────────────────────────────────────────────────────────
// Rendered by AuthenticatedShell when there is no authenticated user.
// Mirrors the authenticated shell's reflow behaviour so the public
// experience matches the signed-in one:
//
//   - Desktop: a full-height left drawer that REFLOWS the content
//     (w-72 ↔ w-0). When closed, content uses the full available width;
//     when open, the content frame shrinks horizontally so the complete
//     page stays visible beside the drawer — the drawer never overlays.
//   - Mobile: the same panel as an overlay Sheet (preserving the
//     existing mobile overlay behaviour), plus the public bottom nav.
//
// The right-side Directory filter drawer is owned by the Directory page
// itself (it reflows when this left drawer is closed and overlays the
// already-reduced content when this drawer is open — see Directory.jsx).
export default function PublicShell() {
  const { navOpen, setNavOpen } = useNav();
  const isMobile = useIsMobile();

  return (
    <div className="flex h-screen bg-stone-50 relative">
      {/* Desktop left drawer — reflows content (w-72 ↔ w-0). */}
      <aside className={`hidden md:flex flex-col bg-slate-900 text-white shrink-0 transition-all duration-200 overflow-hidden ${navOpen ? 'w-72' : 'w-0'}`}>
        <div className="w-72 flex flex-col h-full">
          <PublicNavContent />
        </div>
      </aside>

      {/* Mobile left drawer — overlay Sheet, same panel + state. */}
      {isMobile && (
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" transparentOverlay className="w-72 bg-slate-900 text-white border-r-0 p-0 flex flex-col">
            <PublicNavContent />
          </SheetContent>
        </Sheet>
      )}

      {/* Content area — shrinks/grows with the left drawer. */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto relative pb-14 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* Public mobile bottom nav (mobile only). */}
      <PublicMobileNav />
    </div>
  );
}