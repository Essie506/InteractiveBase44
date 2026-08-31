import { Link } from 'react-router-dom';
import { ShieldCheck, Clock, AlertCircle } from 'lucide-react';

// Compact verification status indicator.
// ───────────────────────────────────────────────────────────
// One consistent visual family for the Trust & Reputation
// verification system. Used both beside the Dashboard "Welcome"
// heading (current operating context) and on individual Business
// cards (each business has its own independent verification state).
//
// States map to the authoritative verification_state values used by
// ProfessionalProfile and Business — no invented statuses.

const STATE_CONFIG = {
  verified: { label: 'Verified', Icon: ShieldCheck, classes: 'bg-emerald-50 text-emerald-700' },
  pending_review: { label: 'Pending', Icon: Clock, classes: 'bg-amber-50 text-amber-700' },
  additional_info_required: { label: 'Action Required', Icon: AlertCircle, classes: 'bg-red-50 text-red-700' },
  failed: { label: 'Failed', Icon: AlertCircle, classes: 'bg-red-50 text-red-700' },
  expired: { label: 'Expired', Icon: AlertCircle, classes: 'bg-red-50 text-red-700' },
};

const DEFAULT = { label: 'Verify', Icon: ShieldCheck, classes: 'bg-stone-100 text-stone-600' };

export function getVerificationConfig(state) {
  return STATE_CONFIG[state] || DEFAULT;
}

// `to` — optional route. When provided the badge is a Link (navigates
// to the verification flow/status page without changing operating
// context). When absent it is a plain non-interactive pill.
// `size` — 'sm' (business cards) | 'md' (beside the Welcome heading).
export default function VerificationBadge({ state, to, size = 'sm' }) {
  const { label, Icon, classes } = getVerificationConfig(state);
  const sizing = size === 'md' ? 'px-2.5 py-1 text-xs gap-1.5' : 'px-1.5 py-0.5 text-xs gap-1';
  const iconSize = size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3';

  const content = (
    <span className={`inline-flex items-center rounded-full font-medium ${classes} ${sizing}`}>
      <Icon className={iconSize} />
      {label}
    </span>
  );

  if (to) {
    return (
      <Link to={to} className="inline-flex relative z-10 hover:opacity-80 transition-opacity">
        {content}
      </Link>
    );
  }
  return content;
}