import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { LayoutDashboard, User as UserIcon, Settings, FileText, Search, LogOut, Menu, X, Briefcase, Building2, Users, Calendar, MessageSquare, Clock } from 'lucide-react';
import ContextSwitcher from '@/components/ContextSwitcher';
import NotificationBell from '@/components/NotificationBell';

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

  // Build context-aware navigation
  const activeContext = user?.active_context || 'personal';
  const activeBusinessId = user?.active_business_id;
  const isProfessionalActive = user?.professional_activated || user?.professional_onboarding_status === 'active';

  let navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/calendar', label: 'Calendar', icon: Calendar },
    { path: '/messages', label: 'Messages', icon: MessageSquare },
    { path: '/profile', label: 'Profile', icon: UserIcon },
    { path: '/settings', label: 'Settings', icon: Settings },
    { path: '/specifications', label: 'Specs', icon: FileText },
    { path: '/search', label: 'AI Search', icon: Search },
  ];

  if (activeContext === 'professional' && isProfessionalActive) {
    navItems = [
      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/calendar', label: 'Calendar', icon: Calendar },
      { path: '/availability', label: 'Availability', icon: Clock },
      { path: '/messages', label: 'Messages', icon: MessageSquare },
      { path: '/professional-profile', label: 'Pro Profile', icon: Briefcase },
      { path: '/settings', label: 'Settings', icon: Settings },
      { path: '/specifications', label: 'Specs', icon: FileText },
      { path: '/search', label: 'AI Search', icon: Search },
    ];
  }

  if (activeContext === 'business' && activeBusinessId) {
    navItems = [
      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/calendar', label: 'Calendar', icon: Calendar },
      { path: '/messages', label: 'Messages', icon: MessageSquare },
      { path: `/business/${activeBusinessId}`, label: 'Workspace', icon: Building2 },
      { path: `/business/${activeBusinessId}/staff`, label: 'Staff', icon: Users },
      { path: `/business/${activeBusinessId}/profile`, label: 'Biz Profile', icon: FileText },
      { path: '/settings', label: 'Settings', icon: Settings },
      { path: '/specifications', label: 'Specs', icon: FileText },
      { path: '/search', label: 'AI Search', icon: Search },
    ];
  }

  return (
    <div className="flex h-screen bg-stone-50">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col bg-slate-900 text-white shrink-0">
        <div className="px-6 py-7">
          <div className="flex items-center justify-between">
            <Link to="/dashboard" className="flex items-center gap-2.5">
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
            <button onClick={handleLogout} className="text-slate-400 hover:text-white transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
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