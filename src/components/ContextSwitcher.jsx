import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { User, Briefcase, Building2, ChevronDown, Check, Loader2 } from 'lucide-react';

const contexts = [
  { key: 'personal', label: 'Personal', icon: User },
  { key: 'professional', label: 'Professional', icon: Briefcase },
  { key: 'business', label: 'Business', icon: Building2 },
];

export default function ContextSwitcher() {
  const { user, checkUserAuth } = useAuth();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const activeContext = user?.active_context || 'personal';
  const current = contexts.find(c => c.key === activeContext) || contexts[0];
  const CurrentIcon = current.icon;

  const isAvailable = (key) => {
    if (key === 'personal') return true;
    if (key === 'professional') return user?.professional_activated === true;
    if (key === 'business') return !!user?.active_business_id;
    return false;
  };

  const handleSwitch = async (key) => {
    if (!isAvailable(key) || switching) return;
    setSwitching(true);
    try {
      await base44.auth.updateMe({ active_context: key });
      await checkUserAuth();
    } finally {
      setSwitching(false);
      setOpen(false);
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
          <div className="text-sm font-medium text-white truncate">{current.label}</div>
        </div>
        {switching ? <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 right-0 z-20 bg-slate-800 rounded-lg border border-slate-700 py-1 shadow-xl">
            {contexts.map(ctx => {
              const CtxIcon = ctx.icon;
              const active = ctx.key === activeContext;
              const available = isAvailable(ctx.key);
              return (
                <button
                  key={ctx.key}
                  onClick={() => handleSwitch(ctx.key)}
                  disabled={!available || switching}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left ${available ? 'hover:bg-slate-700' : 'opacity-40 cursor-not-allowed'}`}
                >
                  <CtxIcon className="w-4 h-4 text-slate-400" />
                  <span className="flex-1 text-sm text-slate-200">{ctx.label}</span>
                  {active && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                  {!available && <span className="text-[10px] text-slate-600">Not activated</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}