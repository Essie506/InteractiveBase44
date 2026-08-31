import { Link } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { User as UserIcon, Compass } from 'lucide-react';

// Public navigation drawer for signed-out Directory visitors.
// Authenticated visitors use the shared persistent sidebar
// (AuthenticatedShell), so this drawer is rendered only when signed out.
export default function DirectoryNavDrawer({ open, onOpenChange }) {
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