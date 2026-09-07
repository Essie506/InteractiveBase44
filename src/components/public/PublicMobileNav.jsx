// PublicMobileNav — bottom navigation for unauthenticated/public mobile
// visitors (Issue 7). Exactly four primary items:
//   Directory / Articles / Workouts / Sign in
// This does NOT replace the authenticated navigation — it only renders
// for unauthenticated visitors on mobile.
import { Link, useLocation } from 'react-router-dom';
import { Compass, FileText, Dumbbell, LogIn } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/directory', label: 'Directory', icon: Compass },
  { to: '/articles', label: 'Articles', icon: FileText },
  { to: '/workouts', label: 'Workouts', icon: Dumbbell },
  { to: '/login', label: 'Sign in', icon: LogIn, isAuth: true },
];

export default function PublicMobileNav() {
  const location = useLocation();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-stone-200 flex items-stretch h-14">
      {NAV_ITEMS.map(item => {
        const Icon = item.icon;
        const active = location.pathname.startsWith(item.to) && !item.isAuth;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              active ? 'text-indigo-600' : 'text-stone-500'
            } ${item.isAuth ? 'bg-indigo-50' : ''}`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}