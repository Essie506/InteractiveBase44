import { useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useNav } from '@/lib/NavContext';
import { Menu, X } from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';
import { getContextNavItems } from '@/lib/navItems';

// Thin main-content wrapper used inside AuthenticatedShell for the
// authenticated app routes. The persistent sidebar is owned by the
// shell — AppLayout no longer renders it. This component keeps only:
//   - the onboarding guard,
//   - the mobile top header (hamburger toggles the shared sidebar),
//   - the mobile bottom nav,
//   - the <Outlet/> for the actual page.
export default function AppLayout() {
  const { user } = useAuth();
  const { navOpen, toggleNav } = useNav();
  const location = useLocation();
  const navigate = useNavigate();

  // Onboarding guard
  useEffect(() => {
    if (user && user.onboarding_status !== 'completed') {
      const returnTo = location.pathname + location.search;
      navigate('/onboarding?returnTo=' + encodeURIComponent(returnTo));
    }
  }, [user]);

  const navItems = getContextNavItems(user);

  return (
    <>
      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">I</span>
          </div>
          <span className="font-semibold">Interactive</span>
        </Link>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button onClick={toggleNav} aria-label="Toggle navigation">
            {navOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div className="pb-16 md:pb-0">
        <Outlet />
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 flex items-center justify-around px-2 py-2 z-50">
        {navItems.slice(0, 4).map(item => {
          const Icon = item.icon;
          const active = location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path} className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg ${active ? 'text-indigo-600' : 'text-stone-400'}`}>
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}