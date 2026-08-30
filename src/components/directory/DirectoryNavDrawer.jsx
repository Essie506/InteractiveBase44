import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { User as UserIcon, Compass } from 'lucide-react';
import AuthenticatedSidebarContent from '@/components/AuthenticatedSidebarContent';

// Navigation drawer for the Directory page (which lives outside AppLayout).
//
// Authenticated users get the SAME sidebar content as AppLayout — header +
// notification bell, "Operating as" context switcher, context-aware nav, and
// the signed-in user footer with logout — via AuthenticatedSidebarContent.
// This reuses the single authenticated navigation source (getContextNavItems)
// so the menu cannot drift from AppLayout.
//
// For authenticated users:
//   - the public-style X close button is hidden (hideClose);
//   - nav links do NOT close the drawer, so selecting Directory (or another
//     destination) leaves the drawer open — it is only dismissed explicitly
//     (overlay click / Escape). Route changes never reset drawer state.
//
// Signed-out visitors keep the lightweight public drawer (Directory + Sign
// In), which closes on navigation as before.
export default function DirectoryNavDrawer({ open, onOpenChange }) {
  const { user } = useAuth();

  if (user) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="left"
          transparentOverlay
          hideClose
          className="w-72 bg-slate-900 text-white border-r-0 p-0 flex flex-col"
        >
          <AuthenticatedSidebarContent />
        </SheetContent>
      </Sheet>
    );
  }

  // Signed-out: lightweight public drawer (preserved).
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" transparentOverlay className="w-72 overflow-y-auto bg-slate-900 text-white border-r-0">
        <SheetHeader className="mb-4 text-left">
          <SheetTitle className="text-white flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">I</span>
            </div>
            Interactive
          </SheetTitle>
        </SheetHeader>
        <nav className="space-y-0.5 px-1">
          <Link
            to="/directory"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <Compass className="w-4 h-4" strokeWidth={2} />
            Directory
          </Link>
          <Link
            to="/login"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <UserIcon className="w-4 h-4" strokeWidth={2} />
            Sign In
          </Link>
        </nav>
      </SheetContent>
    </Sheet>
  );
}