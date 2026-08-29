import { Link, useLocation } from 'react-router-dom';

/**
 * Responsive workspace sidebar.
 * - Desktop: vertical sidebar (w-60) on the left
 * - Mobile: horizontal scrollable bar on top
 *
 * Deferred items render as non-clickable labels with a "Soon" badge.
 */
export default function WorkspaceSidebar({ title, navItems, basePath }) {
  const location = useLocation();

  return (
    <aside className="md:w-60 md:border-r md:border-b-0 border-b border-stone-200 bg-white shrink-0">
      <div className="hidden md:block px-4 py-4 border-b border-stone-100">
        <h2 className="font-semibold text-stone-800 truncate text-sm">{title}</h2>
      </div>
      <nav className="flex md:flex-col overflow-x-auto md:overflow-visible p-2 gap-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const fullPath = `${basePath}/${item.path}`;
          const active = location.pathname === fullPath;

          if (item.deferred) {
            return (
              <div
                key={item.path}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-stone-400 whitespace-nowrap shrink-0"
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
                <span className="text-[10px] text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">Soon</span>
              </div>
            );
          }

          return (
            <Link
              key={item.path}
              to={fullPath}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap shrink-0 transition-colors ${
                active
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}