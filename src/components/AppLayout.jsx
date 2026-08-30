import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { LogOut, Menu, X } from 'lucide-react';
import ContextSwitcher from '@/components/ContextSwitcher';
import NotificationBell from '@/components/NotificationBell';
import AuthenticatedSidebarContent from '@/components/AuthenticatedSidebarContent';
import { getContextNavItems } from '@/lib/navItems';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Onboarding guard
  useEffect(() => {
    if (user && user.onboarding_status !== 'completed') {
      const returnTo = location.pathname + location.search;
      navigate('/onboarding?returnTo=' + encodeURIComponent(returnTo));
    }
  }, [user]);

  const handleLogout = () => logout();

  // Shared context-aware navigation config (also used by
  // AuthenticatedSidebarContent and the Directory nav drawer) so the
  // authenticated menu never drifts between surfaces.
  const navItems = getContextNavItems(user);

  return (
    <div className="flex h-screen bg-stone-50">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col bg-slate-900 text-white shrink-0">
        <AuthenticatedSidebarContent />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0">
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
            <button onClick={() => setMobileNavOpen(!mobileNavOpen)}>
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {mobileNavOpen && (
          <div className="md:hidden bg-slate-900 text-white px-3 py-3 space-y-0.5">
            <div className="mb-2">
              <ContextSwitcher />
            </div>
            {navItems.map(item => {
              const Icon = item.icon;
              const active = location.pathname === item.path;
              return (
                <Link key={item.path} to={item.path} onClick={() => setMobileNavOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${active ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
            <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 w-full">
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        )}

        <Outlet />
      </main>

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
    </div>
  );
}