import { useState, useEffect } from 'react';
import { getVerificationState } from '@/services/verificationEngineService';
import { ShieldCheck, ShieldAlert, Clock } from 'lucide-react';

// Safe public verification detail. Reads the authoritative derived
// verificationState doc — which contains only a safe summary,
// indicators and last-reviewed date. Never exposes certificate
// images, private membership IDs, addresses, DOB, or reviewer notes.

const STYLES = {
  verified: { wrap: 'bg-emerald-50 border-emerald-200', icon: 'text-emerald-600', title: 'text-emerald-800', body: 'text-emerald-700', sub: 'text-emerald-600' },
  expired: { wrap: 'bg-amber-50 border-amber-200', icon: 'text-amber-600', title: 'text-amber-800', body: 'text-amber-700', sub: 'text-amber-600' },
  pending_review: { wrap: 'bg-indigo-50 border-indigo-200', icon: 'text-indigo-600', title: 'text-indigo-800', body: 'text-indigo-700', sub: 'text-indigo-600' },
};

/**
 * @param {{ subjectType: string, subjectId: string }} props
 */
export default function PublicVerificationDetail({ subjectType, subjectId }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getVerificationState(subjectType, subjectId)
      .then((s) => { if (!cancelled) setState(s); })
      .catch(() => { if (!cancelled) setState(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [subjectType, subjectId]);

  if (loading || !state || state.public_state === 'not_verified') return null;

  const style = STYLES[state.public_state] || STYLES.pending_review;
  const Icon = state.public_state === 'verified' ? ShieldCheck : state.public_state === 'expired' ? ShieldAlert : Clock;

  return (
    <div className={`${style.wrap} border rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${style.icon}`} />
        <span className={`font-medium ${style.title}`}>{state.summary}</span>
      </div>
      {state.indicators && state.indicators.length > 0 && (
        <ul className={`${style.body} ml-6 list-disc text-sm`}>
          {state.indicators.map((ind, i) => <li key={i}>{ind}</li>)}
        </ul>
      )}
      {state.last_reviewed && (
        <p className={`${style.sub} text-xs mt-1`}>Last reviewed {new Date(state.last_reviewed).toLocaleDateString('en-GB')}</p>
      )}
    </div>
  );
}