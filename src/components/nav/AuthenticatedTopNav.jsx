import { Link } from 'react-router-dom';

// Shared authenticated top navigation bar.
// ───────────────────────────────────────────────────────────
// White horizontal bar with a thin bottom border:
//   - Left:  Interactive branding (icon + "Interactive")
//   - Right: current page identity (icon + label)
// The right-hand identity changes per page — supplied by the shell
// (pageIcon/pageLabel, derived from the route via getPageIdentity).
// Rendered above the sidebar + main content on desktop only; mobile
// keeps each route's own header/trigger.
export default function AuthenticatedTopNav({ pageIcon: PageIcon, pageLabel }) {
  return (
    <header className="bg-white border-b border-stone-200">
      <div className="flex items-center justify-between px-6 md:px-10 py-4">
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">I</span>
          </div>
          <span className="text-lg font-semibold tracking-tight text-stone-800">Interactive</span>
        </Link>
        <div className="flex items-center gap-2">
          {PageIcon && <PageIcon className="w-6 h-6 text-indigo-600" strokeWidth={2} />}
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-stone-800">{pageLabel}</h1>
        </div>
      </div>
    </header>
  );
}