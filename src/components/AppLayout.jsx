import { useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { getContextNavItems } from '@/lib/navItems';

// Thin main-content wrapper used inside AuthenticatedShell for the
// authenticated app routes. The persistent sidebar AND the mobile
// header are owned by the shell — AppLayout no longer renders either.
// This component keeps only:
//   - the onboarding guard,
//   - the mobile bottom nav,
//   - the <Outlet/> for the actual page.
export default function AppLayout() {
  const { user } = useAuth();
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