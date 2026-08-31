// Shared authenticated sidebar content.
// ───────────────────────────────────────────────────────────
// Renders the exact inner content of the AppLayout desktop sidebar:
// Interactive header + notification bell, "Operating as" context switcher,
// context-aware navigation (from getContextNavItems — single source of
// truth), and the signed-in user footer with logout.
//
// Used by:
//   - AppLayout desktop <aside> (persistent sidebar)
//   - DirectoryNavDrawer (when authenticated) so the Directory left drawer
//     matches the AppLayout sidebar without a second nav definition.
//
// Nav links close the drawer on MOBILE after navigating (so the user
// lands on the destination with the drawer closed). On DESKTOP the
// drawer stays open across navigation (persistent nav) — the close is
// guarded by useIsMobile().

import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useNav } from '@/lib/NavContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { LogOut } from 'lucide-react';
import ContextSwitcher from '@/components/ContextSwitcher';
import NotificationBell from '@/components/NotificationBell';
import { getContextNavItems } from '@/lib/navItems';

export default function AuthenticatedSidebarContent() {
  const { user, logout } = useAuth();
  const { setNavOpen } = useNav();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navItems = getContextNavItems(user);

  // Mobile-only: close the drawer after navigating to a destination.
  // Desktop keeps the drawer open across navigation (persistent nav).
  const closeOnMobileNavigate = () => {
    if (isMobile) setNavOpen(false);
  };

  return (
    <>
      <div className="px-6 py-7">
        <div className="flex items-center justify-between">
          <Link to="/dashboard" onClick={closeOnMobileNavigate} className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">I</span>
            </div>
            <span className="text-lg font-semibold tracking-tight">Interactive</span>
          </Link>
          <NotificationBell />
        </div>
      </div>

      <div className="px-3 mb-2">
        <ContextSwitcher />
      </div>

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const active = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={closeOnMobileNavigate}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              <Icon className="w-4 h-4" strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-slate-800">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-medium overflow-hidden">
            {user?.avatar_url ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" /> : (user?.display_name?.[0] || user?.email?.[0] || '?').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user?.display_name || 'User'}</div>
            <div className="text-xs text-slate-500 truncate">{user?.email}</div>
          </div>
          <button onClick={() => logout()} className="text-slate-400 hover:text-white transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
}