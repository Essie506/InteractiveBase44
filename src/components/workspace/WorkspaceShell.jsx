import { Outlet } from 'react-router-dom';
import WorkspaceSidebar from './WorkspaceSidebar';

/**
 * Layout shell for workspace pages: renders a secondary sidebar
 * (inside the primary AppLayout) and the active section via <Outlet />.
 */
export default function WorkspaceShell({ title, navItems, basePath }) {
  return (
    <div className="flex flex-col md:flex-row">
      <WorkspaceSidebar title={title} navItems={navItems} basePath={basePath} />
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}