import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { getUserBusinesses } from '@/lib/businessPermissions';
import { User as UserIcon, Settings, FileText, Search, Check, Briefcase, Building2, Plus, ArrowRight, Mail, ShieldCheck } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [pendingInvites, setPendingInvites] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      base44.entities.PersonalProfile.filter({ identity_id: user.id }),
      base44.entities.UserSetting.filter({ identity_id: user.id }),
      getUserBusinesses(user.id),
      base44.entities.BusinessInvitation.filter({ email: user.email }),
    ]).then(([profiles, userSettings, userBusinesses, invites]) => {
      if (profiles.length > 0) setProfile(profiles[0]);
      if (userSettings.length > 0) setSettings(userSettings[0]);
      setBusinesses(userBusinesses);
      setPendingInvites(invites.filter(i => i.status === 'sent' || i.status === 'delivered').length);
    }).finally(() => setLoading(false));
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const activeContext = user?.active_context || 'personal';
  const contextLabel = activeContext.charAt(0).toUpperCase() + activeContext.slice(1);
  const isProfessionalActive = user?.professional_activated || user?.professional_onboarding_status === 'active';

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          {contextLabel} Context
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1">
          Welcome, {user?.display_name || 'there'}
        </h1>
        <p className="text-stone-500">Your Interactive platform</p>
      </div>

      {/* Pending invitations */}
      {pendingInvites > 0 && (
        <Link to="/invitations" className="block bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6 hover:bg-indigo-100 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-indigo-800">You have {pendingInvites} pending invitation{pendingInvites > 1 ? 's' : ''}</div>
              <div className="text-sm text-indigo-600">Review and accept business workspace invitations</div>
            </div>
            <ArrowRight className="w-4 h-4 text-indigo-600" />
          </div>
        </Link>
      )}

      {/* Activation cards */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {/* Professional activation */}
        {!isProfessionalActive ? (
          <Link to="/activate-professional" className="group bg-white rounded-xl border border-stone-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-indigo-50 group-hover:bg-indigo-100 rounded-xl flex items-center justify-center transition-colors">
                <Briefcase className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-stone-800 mb-1">Activate Professional</h3>
                <p className="text-sm text-stone-500 mb-2">Offer services and build your professional brand</p>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600">Get started <ArrowRight className="w-3 h-3" /></span>
              </div>
            </div>
          </Link>
        ) : (
          <Link to="/professional-profile" className="group bg-white rounded-xl border border-stone-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-stone-800">Professional</h3>
                  <span className="text-xs px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded font-medium">Active</span>
                </div>
                <p className="text-sm text-stone-500">View and edit your professional profile</p>
              </div>
            </div>
          </Link>
        )}

        {/* Business creation */}
        {businesses.length === 0 ? (
          <Link to="/create-business" className="group bg-white rounded-xl border border-stone-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-indigo-50 group-hover:bg-indigo-100 rounded-xl flex items-center justify-center transition-colors">
                <Building2 className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-stone-800 mb-1">Create a Business</h3>
                <p className="text-sm text-stone-500 mb-2">Set up a business workspace</p>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600">Get started <ArrowRight className="w-3 h-3" /></span>
              </div>
            </div>
          </Link>
        ) : (
          <Link to="/create-business" className="group bg-white rounded-xl border border-stone-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-indigo-50 group-hover:bg-indigo-100 rounded-xl flex items-center justify-center transition-colors">
                <Plus className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-stone-800 mb-1">Create Another Business</h3>
                <p className="text-sm text-stone-500">Add another business workspace to your identity</p>
              </div>
            </div>
          </Link>
        )}
      </div>

      {/* Business cards */}
      {businesses.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold text-stone-800 mb-3">Your Businesses</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {businesses.map(biz => (
              <Link key={biz.id} to={`/business/${biz.id}`} className="group bg-white rounded-xl border border-stone-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-indigo-50 group-hover:bg-indigo-100 rounded-xl flex items-center justify-center transition-colors">
                    <Building2 className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-stone-800 truncate">{biz.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded capitalize">{biz.type}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${biz.lifecycle_state === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {biz.lifecycle_state === 'pending_verification' ? 'Pending' : biz.lifecycle_state}
                      </span>
                      <span className="text-xs text-stone-500">· {biz._membership?.role}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Link to="/profile" className="group bg-white rounded-xl border border-stone-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all">
          <div className="w-10 h-10 bg-indigo-50 group-hover:bg-indigo-100 rounded-xl flex items-center justify-center mb-3 transition-colors">
            <UserIcon className="w-5 h-5 text-indigo-600" />
          </div>
          <h3 className="font-semibold text-stone-800 mb-1">Personal Profile</h3>
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

      {/* Identity architecture */}
      <div className="bg-slate-900 rounded-xl p-6 text-white">
        <h2 className="font-semibold mb-1">Your Interactive Identity</h2>
        <p className="text-sm text-slate-400 mb-4">One authenticated identity, multiple experiences.</p>
        <div className="space-y-2">
          <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${activeContext === 'personal' ? 'bg-indigo-600' : 'bg-slate-800'}`}>
            <div className="flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-indigo-400" />
              <span className="text-sm">Personal</span>
            </div>
            <span className="text-xs text-slate-400">{activeContext === 'personal' ? 'Active' : 'Available'}</span>
          </div>
          <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${activeContext === 'professional' ? 'bg-indigo-600' : isProfessionalActive ? 'bg-slate-800' : 'bg-slate-800/50 opacity-60'}`}>
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-indigo-400" />
              <span className="text-sm">Professional</span>
            </div>
            <span className="text-xs text-slate-400">
              {isProfessionalActive ? (activeContext === 'professional' ? 'Active' : 'Available') : 'Not activated'}
            </span>
          </div>
          {businesses.length > 0 ? (
            businesses.map(biz => (
              <div key={biz.id} className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${activeContext === 'business' && user?.active_business_id === biz.id ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="text-sm truncate">{biz.name}</span>
                </div>
                <span className="text-xs text-slate-400 shrink-0 ml-2">
                  {activeContext === 'business' && user?.active_business_id === biz.id ? 'Active' : 'Available'}
                </span>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-800/50 opacity-60">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-400" />
                <span className="text-sm">Business</span>
              </div>
              <span className="text-xs text-slate-500">Not created</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}