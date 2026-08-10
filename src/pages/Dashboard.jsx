import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { User as UserIcon, Settings, FileText, Search, Check, X, Briefcase, Building2 } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      base44.entities.PersonalProfile.filter({ identity_id: user.id }),
      base44.entities.UserSetting.filter({ identity_id: user.id }),
    ]).then(([profiles, userSettings]) => {
      if (profiles.length > 0) setProfile(profiles[0]);
      if (userSettings.length > 0) setSettings(userSettings[0]);
    }).finally(() => setLoading(false));
  }, [user]);

  const activeContext = user?.active_context || 'personal';
  const contextLabel = activeContext.charAt(0).toUpperCase() + activeContext.slice(1);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const statuses = [
    { label: 'Personal Profile', done: !!profile },
    { label: 'Privacy Settings', done: !!settings },
    { label: 'Professional Identity', done: user?.professional_activated, notDoneLabel: 'Not activated' },
    { label: 'Business Workspace', done: !!user?.active_business_id, notDoneLabel: 'Not created' },
  ];

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          {contextLabel} Context
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1">
          Welcome, {user?.display_name || 'there'}
        </h1>
        <p className="text-stone-500">Your Interactive platform foundation is ready.</p>
      </div>

      {/* Quick actions */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Link to="/profile" className="group bg-white rounded-xl border border-stone-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all">
          <div className="w-10 h-10 bg-indigo-50 group-hover:bg-indigo-100 rounded-xl flex items-center justify-center mb-3 transition-colors">
            <UserIcon className="w-5 h-5 text-indigo-600" />
          </div>
          <h3 className="font-semibold text-stone-800 mb-1">Your Profile</h3>
          <p className="text-sm text-stone-500">View and edit your personal profile</p>
        </Link>
        <Link to="/settings" className="group bg-white rounded-xl border border-stone-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all">
          <div className="w-10 h-10 bg-indigo-50 group-hover:bg-indigo-100 rounded-xl flex items-center justify-center mb-3 transition-colors">
            <Settings className="w-5 h-5 text-indigo-600" />
          </div>
          <h3 className="font-semibold text-stone-800 mb-1">Privacy & Settings</h3>
          <p className="text-sm text-stone-500">Manage your privacy and preferences</p>
        </Link>
        <Link to="/specifications" className="group bg-white rounded-xl border border-stone-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all">
          <div className="w-10 h-10 bg-indigo-50 group-hover:bg-indigo-100 rounded-xl flex items-center justify-center mb-3 transition-colors">
            <FileText className="w-5 h-5 text-indigo-600" />
          </div>
          <h3 className="font-semibold text-stone-800 mb-1">Specifications</h3>
          <p className="text-sm text-stone-500">Browse the Interactive spec repository</p>
        </Link>
      </div>

      {/* Profile status */}
      <div className="bg-white rounded-xl border border-stone-200 p-6 mb-6">
        <h2 className="font-semibold text-stone-800 mb-4">Foundation Status</h2>
        <div className="space-y-3">
          {statuses.map(s => (
            <div key={s.label} className="flex items-center justify-between">
              <span className="text-sm text-stone-600">{s.label}</span>
              {s.done ? (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                  <Check className="w-4 h-4" /> Active
                </span>
              ) : (
                <span className="text-sm text-stone-400">{s.notDoneLabel || 'Pending'}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Identity architecture */}
      <div className="bg-slate-900 rounded-xl p-6 text-white">
        <h2 className="font-semibold mb-1">Your Interactive Identity</h2>
        <p className="text-sm text-slate-400 mb-4">One authenticated identity, multiple experiences.</p>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg">
            <UserIcon className="w-4 h-4 text-indigo-400" />
            <span className="text-sm">Personal</span>
            {activeContext === 'personal' && <span className="text-xs text-indigo-400">· Active</span>}
          </div>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${user?.professional_activated ? 'bg-slate-800' : 'bg-slate-800/50 opacity-60'}`}>
            <Briefcase className="w-4 h-4 text-indigo-400" />
            <span className="text-sm">Professional</span>
            {user?.professional_activated ? (activeContext === 'professional' && <span className="text-xs text-indigo-400">· Active</span>) : <span className="text-xs text-slate-500">· Not activated</span>}
          </div>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${user?.active_business_id ? 'bg-slate-800' : 'bg-slate-800/50 opacity-60'}`}>
            <Building2 className="w-4 h-4 text-indigo-400" />
            <span className="text-sm">Business</span>
            {user?.active_business_id ? (activeContext === 'business' && <span className="text-xs text-indigo-400">· Active</span>) : <span className="text-xs text-slate-500">· Not created</span>}
          </div>
        </div>
      </div>
    </div>
  );
}