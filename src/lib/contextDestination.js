// Context-aware destination preservation.
// ───────────────────────────────────────────────────────────
// When a user switches operating context (Personal ↔ Professional ↔
// Business), the current navigation destination is preserved whenever it
// exists in the target context. The context switch changes the operating
// identity/context, NOT the user's current task.
//
// Each route is classified into a semantic "destination key" (dashboard,
// calendar, messages, profile, settings, specs, search, directory,
// workspace, availability, staff, verification). The target context maps
// that key to its concrete route. If the key has no equivalent in the
// target context, the fallback is the context's Dashboard/Home.
//
// Substate that lives in React component state (e.g. Calendar Month/Week
// view mode) is preserved automatically when the route path is unchanged
// — React Router does not remount the same route, so internal state
// survives. URL substate (e.g. /messages/:conversationId) is preserved by
// appending the subpath to the resolved base route where it is
// context-independent.

// Per-context base routes for each semantic destination key.
// Business routes depend on the active business id.
function contextRoutes(targetContext, activeBusinessId) {
  if (targetContext === 'personal') {
    return {
      dashboard: '/dashboard',
      calendar: '/calendar',
      messages: '/messages',
      profile: '/profile',
      settings: '/settings',
      specs: '/specifications',
      search: '/search',
      directory: '/directory',
    };
  }
  if (targetContext === 'professional') {
    return {
      dashboard: '/dashboard',
      calendar: '/calendar',
      messages: '/messages',
      profile: '/professional-profile',
      settings: '/settings',
      specs: '/specifications',
      search: '/search',
      directory: '/directory',
      workspace: '/professional',
      availability: '/availability',
      verification: '/verify-professional',
    };
  }
  if (targetContext === 'business' && activeBusinessId) {
    const b = `/business/${activeBusinessId}`;
    return {
      dashboard: '/dashboard',
      calendar: '/calendar',
      messages: '/messages',
      profile: `${b}/profile`,
      settings: '/settings',
      specs: '/specifications',
      search: '/search',
      directory: '/directory',
      workspace: `${b}/workspace`,
      availability: `${b}/workspace`,
      staff: `${b}/staff`,
      verification: `${b}/verify`,
    };
  }
  return {
    dashboard: '/dashboard',
    calendar: '/calendar',
    messages: '/messages',
    settings: '/settings',
    specs: '/specifications',
    search: '/search',
    directory: '/directory',
  };
}

// Classify a pathname into a semantic destination key.
// Returns null when the path is not a recognised context-aware destination
// (e.g. /onboarding, /create-business, /book/:screenName, /e/:eventId,
// /p/:screenName) — callers fall back to the context home for these.
function classifyPath(pathname) {
  if (!pathname) return null;
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/' ) return null;
  if (p === '/dashboard') return 'dashboard';
  if (p === '/calendar' || p.startsWith('/calendar')) return 'calendar';
  if (p === '/messages' || p.startsWith('/messages/')) return 'messages';
  if (p === '/profile') return 'profile';
  if (p === '/professional-profile') return 'profile';
  if (/^\/business\/[^/]+\/profile$/.test(p)) return 'profile';
  if (p === '/professional' || p.startsWith('/professional/')) return 'workspace';
  if (/^\/business\/[^/]+\/workspace$/.test(p) || /^\/business\/[^/]+\/workspace\//.test(p)) return 'workspace';
  if (p === '/availability') return 'availability';
  if (/^\/business\/[^/]+\/availability$/.test(p)) return 'availability';
  if (/^\/business\/[^/]+\/staff$/.test(p)) return 'staff';
  if (p === '/verify-professional') return 'verification';
  if (/^\/business\/[^/]+\/verify$/.test(p)) return 'verification';
  if (p === '/settings') return 'settings';
  if (p === '/specifications' || p.startsWith('/specifications/')) return 'specs';
  if (p === '/search') return 'search';
  if (p === '/directory') return 'directory';
  return null;
}

// Routes whose subpath is context-independent and should be carried over.
// /messages/:conversationId and /specifications/:id remain valid across
// contexts, so preserve the subpath when resolving.
function contextIndependentSubpath(key, pathname) {
  if (key === 'messages' && pathname.startsWith('/messages/')) {
    return pathname.slice('/messages'.length); // includes leading '/'
  }
  if (key === 'specs' && pathname.startsWith('/specifications/')) {
    return pathname.slice('/specifications'.length);
  }
  return '';
}

/**
 * Resolve the destination route to navigate to after switching operating
 * context. Preserves the current destination when it exists in the target
 * context; otherwise falls back to the context's Dashboard.
 *
 * @param {string} currentPathname — window.location.pathname (or useLocation().pathname)
 * @param {string} targetContext — 'personal' | 'professional' | 'business'
 * @param {string|null} activeBusinessId — the business id for business context
 * @returns {string} — the route to navigate to
 */
export function resolveContextDestination(currentPathname, targetContext, activeBusinessId) {
  const key = classifyPath(currentPathname);
  const routes = contextRoutes(targetContext, activeBusinessId);
  const fallback = routes.dashboard || '/dashboard';
  if (!key) return fallback;
  const base = routes[key];
  if (!base) return fallback;
  const sub = contextIndependentSubpath(key, currentPathname || '');
  return base + sub;
}