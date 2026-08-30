import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  LayoutDashboard, User as UserIcon, Settings, FileText, Search,
  LogOut, Briefcase, Building2, Users, Calendar, MessageSquare,
  Clock, ShieldCheck, Compass,
} from 'lucide-react';

// Lightweight navigation drawer for the Directory page (which lives
// outside AppLayout). Replicates the same context-aware nav items as
// AppLayout so logged-in users get their normal menu, and logged-out
// users get a minimal Directory + Sign In menu.
//
// Opening/closing this drawer does NOT navigate or reset Directory
// filter state — it is purely a visibility toggle. Clicking a nav item
// navigates (expected) and closes the drawer.
export default function DirectoryNavDrawer({ open, onOpenChange }) {
  const { user, logout } = useAuth();

  const activeContext = user?.active_context || 'personal';
  const activeBusinessId = user?.active_business_id;
  const isProfessionalActive = user?.professional_activated || user?.professional_onboarding_status === 'active';

  let navItems = [];

  if (!user) {
    navItems = [
      { path: '/directory', label: 'Directory', icon: Compass },
      { path: '/login', label: 'Sign In', icon: UserIcon },
    ];
  } else if (activeContext === 'professional' && isProfessionalActive) {
    navItems = [
      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/professional', label: 'Workspace', icon: Building2 },
      { path: '/messages', label: 'Messages', icon: MessageSquare },
      { path: '/calendar', label: 'Calendar', icon: Calendar },
      { path: '/availability', label: 'Availability', icon: Clock },
      { path: '/professional-profile', label: 'Pro Profile', icon: Briefcase },
      { path: '/verify-professional', label: 'Verification', icon: ShieldCheck },
      { path: '/settings', label: 'Settings', icon: Settings },
      { path: '/specifications', label: 'Specs', icon: FileText },
      { path: '/search', label: 'AI Search', icon: Search },
      { path: '/directory', label: 'Directory', icon: Compass },
    ];
  } else if (activeContext === 'business' && activeBusinessId) {
    navItems = [
      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { path: `/business/${activeBusinessId}/workspace`, label: 'Workspace', icon: Building2 },
      { path: '/messages', label: 'Messages', icon: MessageSquare },
      { path: '/calendar', label: 'Calendar', icon: Calendar },
      { path: `/business/${activeBusinessId}/staff`, label: 'Staff', icon: Users },
      { path: `/business/${activeBusinessId}/profile`, label: 'Biz Profile', icon: FileText },
      { path: `/business/${activeBusinessId}/verify`, label: 'Verification', icon: ShieldCheck },
      { path: '/settings', label: 'Settings', icon: Settings },
      { path: '/specifications', label: 'Specs', icon: FileText },
      { path: '/search', label: 'AI Search', icon: Search },
      { path: '/directory', label: 'Directory', icon: Compass },
    ];
  } else {
    navItems = [
      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/calendar', label: 'Calendar', icon: Calendar },
      { path: '/messages', label: 'Messages', icon: MessageSquare },
      { path: '/profile', label: 'Profile', icon: UserIcon },
      { path: '/settings', label: 'Settings', icon: Settings },
      { path: '/specifications', label: 'Specs', icon: FileText },
      { path: '/search', label: 'AI Search', icon: Search },
      { path: '/directory', label: 'Directory', icon: Compass },
    ];
  }

  const handleLogout = () => {
    onOpenChange(false);
    logout();
  };

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
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => onOpenChange(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <Icon className="w-4 h-4" strokeWidth={2} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        {user && (
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 mt-4 mx-1 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors w-[calc(100%-0.5rem)]"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        )}
      </SheetContent>
    </Sheet>
  );
}