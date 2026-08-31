// Shared authenticated top navigation bar.
// ───────────────────────────────────────────────────────────
// White horizontal bar with a thin bottom border, rendered at the top
// of the content area (to the RIGHT of the global nav drawer) on
// desktop — never stacked above the drawer, so the drawer keeps full
// viewport height.
//   - Left:  Interactive branding — the global nav trigger. Shown only
//            when the drawer is CLOSED (the open drawer already shows
//            the Interactive branding, so it is not duplicated). When
//            the drawer is OPEN this side is empty; the drawer's edge
//            collapse control (NavCollapseControl) handles closing.
//   - Right: current page identity (icon + label, from getPageIdentity).
export default function AuthenticatedTopNav({ pageIcon: PageIcon, pageLabel, navOpen, onToggleNav }) {
  return (
    <header className="bg-white border-b border-stone-200">
      <div className="flex items-center justify-between px-6 md:px-10 py-4">
        {navOpen ? (
          <div aria-hidden className="flex items-center gap-2.5" />
        ) : (
          <button
            type="button"
            onClick={onToggleNav}
            aria-label="Open navigation"
            className="flex items-center gap-2.5"
          >
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">I</span>
            </div>
            <span className="text-lg font-semibold tracking-tight text-stone-800">Interactive</span>
          </button>
        )}
        <div className="flex items-center gap-2">
          {PageIcon && <PageIcon className="w-6 h-6 text-indigo-600" strokeWidth={2} />}
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-stone-800">{pageLabel}</h1>
        </div>
      </div>
    </header>
  );
}