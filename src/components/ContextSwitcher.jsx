import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import * as userService from '@/services/userService';
import { getUserBusinesses } from '@/services/businessService';
import { User, Briefcase, Building2, ChevronDown, Check, Loader2, Plus } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { resolveContextDestination } from '@/lib/contextDestination';

export default function ContextSwitcher() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [businesses, setBusinesses] = useState([]);

  useEffect(() => {
    if (!user) return;
    getUserBusinesses(user.id).then(setBusinesses);
  }, [user]);

  const activeContext = user?.active_context || 'personal';
  const activeBusinessId = user?.active_business_id;
  const isProfessionalActive = user?.professional_activated || user?.professional_onboarding_status === 'active';

  // Determine current label
  let currentLabel = 'Personal';
  let CurrentIcon = User;
  if (activeContext === 'professional') {
    currentLabel = 'Professional';
    CurrentIcon = Briefcase;
  } else if (activeContext === 'business') {
    const activeBiz = businesses.find(b => b.id === activeBusinessId);
    currentLabel = activeBiz?.name || 'Business';
    CurrentIcon = Building2;
  }

  const switchTo = async (context, businessId = null) => {
    if (switching) return;
    setSwitching(true);
    try {
      const updates = { active_context: context };
      if (context === 'business' && businessId) updates.active_business_id = businessId;
      await userService.updateUserState(updates);
      await refreshUser();
      setOpen(false);
      // Preserve the current destination when it exists in the target
      // context (Calendar→Calendar, Dashboard→Dashboard, Profile→Profile);
      // fall back to the context's Dashboard when it does not.
      navigate(resolveContextDestination(location.pathname, context, businessId));
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={switching}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors text-left disabled:opacity-60"
      >
        <div className="w-7 h-7 rounded-md bg-indigo-500/20 flex items-center justify-center shrink-0">
          <CurrentIcon className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-500">Operating as</div>
          <div className="text-sm font-medium text-white truncate">{currentLabel}</div>
        </div>
        {switching ? <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 right-0 z-20 bg-slate-800 rounded-lg border border-slate-700 py-1 shadow-xl max-h-96 overflow-auto">
            {/* Personal */}
            <button
              onClick={() => switchTo('personal')}
              disabled={switching}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-700 ${activeContext === 'personal' ? 'opacity-100' : ''}`}
            >
              <User className="w-4 h-4 text-slate-400" />
              <span className="flex-1 text-sm text-slate-200">Personal</span>
              {activeContext === 'personal' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
            </button>

            {/* Professional */}
            <button
              onClick={() => {
                if (isProfessionalActive) {
                  switchTo('professional');
                } else {
                  setOpen(false);
                  navigate('/activate-professional');
                }
              }}
              disabled={switching}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-700"
            >
              <Briefcase className="w-4 h-4 text-slate-400" />
              <span className="flex-1 text-sm text-slate-200">Professional</span>
              {activeContext === 'professional' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
              {!isProfessionalActive && <span className="text-[10px] text-slate-600">Activate</span>}
            </button>

            {/* Divider */}
            {businesses.length > 0 && <div className="border-t border-slate-700 my-1" />}

            {/* Businesses */}
            {businesses.map(biz => (
              <button
                key={biz.id}
                onClick={() => switchTo('business', biz.id)}
                disabled={switching}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-700"
              >
                <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="flex-1 text-sm text-slate-200 truncate">{biz.name}</span>
                {activeContext === 'business' && activeBusinessId === biz.id && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
              </button>
            ))}

            {/* Create business */}
            <div className="border-t border-slate-700 mt-1 pt-1">
              <button
                onClick={() => { setOpen(false); navigate('/create-business'); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-700"
              >
                <Plus className="w-4 h-4 text-indigo-400" />
                <span className="text-sm text-indigo-400">Create Business</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}