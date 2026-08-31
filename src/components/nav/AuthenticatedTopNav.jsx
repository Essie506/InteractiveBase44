// Shared authenticated top navigation bar.
// ───────────────────────────────────────────────────────────
// White horizontal bar with a thin bottom border, rendered at the top
// of the content area (to the RIGHT of the global nav drawer) on
// desktop — never stacked above the drawer, so the drawer keeps full
// viewport height.
//   - Left:  Interactive branding — the global nav trigger
//            (onToggleNav opens/closes the persistent global drawer).
//            The drawer's own edge collapse control (NavCollapseControl)
//            is the dedicated close button on the drawer's right edge.
//   - Right: current page identity (icon + label, from getPageIdentity).
export default function AuthenticatedTopNav({ pageIcon: PageIcon, pageLabel, onToggleNav }) {
  return (
    <header className="bg-white border-b border-stone-200">
      <div className="flex items-center justify-between px-6 md:px-10 py-4">
        <button
          type="button"
          onClick={onToggleNav}
          aria-label="Toggle navigation"
          className="flex items-center gap-2.5"
        >
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">I</span>
          </div>
          <span className="text-lg font-semibold tracking-tight text-stone-800">Interactive</span>
        </button>
        <div className="flex items-center gap-2">
          {PageIcon && <PageIcon className="w-6 h-6 text-indigo-600" strokeWidth={2} />}
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-stone-800">{pageLabel}</h1>
        </div>
      </div>
    </header>
  );
}