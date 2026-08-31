import { createContext, useContext, useState, useCallback, useEffect } from 'react';

// Single source of truth for the authenticated navigation panel's
// open/closed state. Lives at the app root (above <Routes>) so the
// panel never unmounts on route changes and one boolean controls the
// same panel on every viewport.
//
// Default: open on desktop (>=768px), closed on mobile — evaluated once
// at provider mount. After that the single boolean is the only state.
//
// Mobile must never inherit a desktop "open" state: whenever the
// viewport crosses into mobile (<768px) the drawer is forced closed so
// loading/refreshing/entering an authenticated page on mobile always
// starts with the left nav closed. Desktop keeps its persistent
// open/closed state across navigation unchanged.
const NavContext = createContext(null);

export function NavProvider({ children }) {
  const [navOpen, setNavOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const onChange = (e) => {
      if (!e.matches) setNavOpen(false);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const toggleNav = useCallback(() => setNavOpen(v => !v), []);

  return (
    <NavContext.Provider value={{ navOpen, setNavOpen, toggleNav }}>
      {children}
    </NavContext.Provider>
  );
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within a NavProvider');
  return ctx;
}