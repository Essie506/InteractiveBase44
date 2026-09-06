// QuickActionsModule — context-aware quick action links.
import { Link } from 'react-router-dom';
import { Settings, FileText, Search, Compass, Crown } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

export default function QuickActionsModule() {
  const { user } = useAuth();
  const ctx = user?.active_context || 'personal';

  const actions = [
    { to: '/settings', label: 'Settings', icon: Settings },
    { to: '/plans', label: 'Plans', icon: Crown },
    { to: '/search', label: 'AI Search', icon: Search },
    { to: '/directory', label: 'Directory', icon: Compass },
    { to: '/specifications', label: 'Specs', icon: FileText },
  ];

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <h3 className="font-semibold text-stone-800 text-sm mb-3">Quick Actions</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {actions.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-stone-50 hover:bg-indigo-50 text-sm text-stone-600 hover:text-indigo-600 transition-colors"
          >
            <a.icon className="w-4 h-4" />
            <span className="truncate">{a.label}</span>
          </Link>
        ))}
      </div>
      {(ctx === 'professional' || ctx === 'business') && (
        <div className="mt-3 flex gap-4">
          <Link to="/growth-hub" className="text-sm font-medium text-indigo-600 hover:underline">
            Growth Hub →
          </Link>
          <Link to="/promotions" className="text-sm font-medium text-indigo-600 hover:underline">
            Promotions →
          </Link>
        </div>
      )}
    </div>
  );
}