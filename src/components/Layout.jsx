import { Link, Outlet, useLocation } from 'react-router-dom';
import { FileText, LayoutDashboard, Upload, Search } from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/specifications', label: 'Specifications', icon: FileText },
  { path: '/upload', label: 'Upload', icon: Upload },
  { path: '/search', label: 'AI Search', icon: Search },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="flex h-screen bg-stone-50">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col bg-slate-900 text-white shrink-0">
        <div className="px-6 py-7">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <FileText className="w-4.5 h-4.5" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-semibold tracking-tight">SpecHub</span>
          </Link>
        </div>
        <nav className="flex-1 px-3 space-y-0.5">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={2} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-6 py-4 text-xs text-slate-500 border-t border-slate-800">
          Central Spec Repository
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 flex items-center justify-around px-2 py-2 z-50">
        {navItems.map(item => {
          const Icon = item.icon;
          const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${
                active ? 'text-indigo-600' : 'text-stone-400'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={2} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}