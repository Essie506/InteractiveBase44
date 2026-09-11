import { useLocation, useNavigate } from 'react-router-dom';
import { useNav } from '@/lib/NavContext';
import { getPageIdentity } from '@/lib/pageIdentity';
import NotificationBell from '@/components/NotificationBell';
import { ArrowLeft } from 'lucide-react';

// Shared authenticated MOBILE header — dark navy full-width banner.
// ───────────────────────────────────────────────────────────
// §15 Mobile Top Navigation: Interactive logo (nav trigger), back
// action, current page title, and Notifications. Rendered by
// AuthenticatedShell for every authenticated route on mobile only.
//
// The Interactive icon + "Interactive" on the LEFT is the tap target
// that opens the shared global navigation drawer (NavContext). The
// back arrow sits before it. The page title is centered. The
// NotificationBell is on the right.
export default function AuthenticatedMobileHeader() {
  const { toggleNav, navOpen } = useNav();
  const location = useLocation();
  const navigate = useNavigate();
  const identity = getPageIdentity(location.pathname);

  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <header className="md:hidden shrink-0 flex items-center gap-2 px-3 py-3 bg-slate-900 text-white">
      <button
        type="button"
        onClick={handleBack}
        aria-label="Go back"
        className="p-1.5 -ml-1 rounded-lg hover:bg-slate-800 shrink-0"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      {navOpen ? (
        <div aria-hidden="true" className="w-7 h-7 shrink-0" />
      ) : (
        <button
          type="button"
          onClick={toggleNav}
          aria-label="Open navigation"
          className="flex items-center gap-2 shrink-0"
        >
          <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">I</span>
          </div>
          <span className="font-semibold hidden xs:inline">Interactive</span>
        </button>
      )}
      <div className="flex-1 min-w-0 text-center">
        <span className="text-sm text-slate-300 truncate">{identity.label}</span>
      </div>
      <NotificationBell />
    </header>
  );
}