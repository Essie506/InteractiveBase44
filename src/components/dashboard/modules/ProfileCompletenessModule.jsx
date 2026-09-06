// ProfileCompletenessModule — shows profile completeness for the active context.
import { useAuth } from '@/lib/AuthContext';
import { getPersonalProfile, getProfessionalProfile } from '@/services/profileService';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { User, Briefcase, Building2, CheckCircle2, Circle } from 'lucide-react';

export default function ProfileCompletenessModule() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const ctx = user.active_context || 'personal';
    const fetcher = ctx === 'business' ? Promise.resolve(null) : getPersonalProfile(user.id);
    Promise.all([fetcher, getProfessionalProfile(user.id)])
      .then(([personal, pro]) => {
        setProfile(ctx === 'professional' ? pro : personal || pro);
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <ModuleShell title="Profile"><div className="h-20 animate-pulse bg-stone-100 rounded" /></ModuleShell>;
  if (!profile) {
    return (
      <ModuleShell title="Profile" icon={User}>
        <p className="text-sm text-stone-500 mb-3">Create your profile to get started.</p>
        <Link to="/onboarding" className="text-sm font-medium text-indigo-600 hover:underline">Get started →</Link>
      </ModuleShell>
    );
  }

  const fields = [
    { key: 'display_name', label: 'Display Name', filled: !!profile.display_name },
    { key: 'headline', label: 'Headline', filled: !!profile.headline },
    { key: 'bio', label: 'Bio', filled: !!profile.bio },
    { key: 'avatar', label: 'Avatar', filled: !!profile.avatar_url },
    { key: 'services', label: 'Services', filled: (profile.services?.length || 0) > 0 },
  ];
  const completed = fields.filter((f) => f.filled).length;
  const pct = Math.round((completed / fields.length) * 100);
  const editUrl = user?.active_context === 'professional' ? '/professional-profile' : '/profile';

  return (
    <ModuleShell title="Profile Completeness" icon={user?.active_context === 'professional' ? Briefcase : user?.active_context === 'business' ? Building2 : User}>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm font-medium text-stone-600">{pct}%</span>
      </div>
      <ul className="space-y-1.5 mb-3">
        {fields.map((f) => (
          <li key={f.key} className="flex items-center gap-2 text-sm">
            {f.filled ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-stone-300" />}
            <span className={f.filled ? 'text-stone-600' : 'text-stone-400'}>{f.label}</span>
          </li>
        ))}
      </ul>
      <Link to={editUrl} className="text-sm font-medium text-indigo-600 hover:underline">Edit profile →</Link>
    </ModuleShell>
  );
}

/** @param {{ title: string, icon?: any, children: any }} props */
function ModuleShell({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="w-4 h-4 text-stone-500" />}
        <h3 className="font-semibold text-stone-800 text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}