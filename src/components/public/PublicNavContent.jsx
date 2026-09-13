import { Link, useLocation } from 'react-router-dom';
import { useNav } from '@/lib/NavContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Compass, Newspaper, Dumbbell, FileText, LogIn } from 'lucide-react';

// Inner content of the public (signed-out) left navigation drawer.
// ───────────────────────────────────────────────────────────
// Rendered by both the desktop reflowing <aside> (PublicShell) and the
// mobile overlay Sheet, so the public menu never drifts between surfaces.
//
// Public main menu (spec): Directory, Feed, Workouts, Articles, Sign In.
// Mirrors the authenticated sidebar's dark-navy styling so the two shells
// share a consistent visual language.
//
// Nav links close the drawer on MOBILE after navigating (so the user lands
// on the destination with the drawer closed). On DESKTOP the drawer stays
// open across navigation (persistent nav) — matching AuthenticatedShell.

const NAV_ITEMS = [
  { to: '/directory', label: 'Directory', icon: Compass },
  { to: '/feed', label: 'Feed', icon: Newspaper },
  { to: '/workouts', label: 'Workouts', icon: Dumbbell },
  { to: '/articles', label: 'Articles', icon: FileText },
];

export default function PublicNavContent() {
  const { setNavOpen } = useNav();
  const isMobile = useIsMobile();
  const location = useLocation();

  const closeOnMobileNavigate = () => {
    if (isMobile) setNavOpen(false);
  };

  return (
    <>
      <div className="px-6 py-7">
        <button
          type="button"
          onClick={() => setNavOpen(false)}
          aria-label="Close navigation"
          className="flex items-center gap-2.5"
        >
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">I</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">Interactive</span>
        </button>
      </div>

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
          return (
            <Link
              key={item.to}
              to={item.to}
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
        <Link
          to="/login"
          onClick={closeOnMobileNavigate}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogIn className="w-4 h-4" strokeWidth={2} />
          Sign In
        </Link>
      </div>
    </>
  );
}