import { UserPlus, Check, Clock, MessageSquare, Loader2 } from 'lucide-react';

// Shared Connect / Pending / Connected + Ask About actions.
// Used by the Professional Directory card and the restricted advert view.
//
// status (from resolveConnectionStatus): 'none' | 'pending_outgoing' |
//   'pending_incoming' | 'connected' | 'disconnected' | 'blocked' |
//   'self' | null (loading / signed-out)
//
// Connect → Relationship System (createConnectionRequest). NEVER creates
//   a conversation or an enquiry.
// Ask About → Professional enquiry (Messaging). Typed enquiry
//   infrastructure does not yet exist, so the button is rendered as a
//   disabled placeholder until the Messaging pass — it never creates
//   incorrect data.
//
// connecting: boolean — true while a connect request is in-flight
// (locally overrides status to show a spinner).
export default function ConnectionActions({
  status,
  onConnect,
  connecting = false,
  onAskAbout,
  className = '',
}) {
  if (status === 'self') {
    return null; // viewing your own profile — no connect/ask actions
  }

  let connectButton;
  if (connecting) {
    connectButton = (
      <button
        disabled
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 text-stone-500 rounded-lg text-sm font-medium disabled:opacity-60 ${className}`}
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting…
      </button>
    );
  } else if (status === 'connected') {
    connectButton = (
      <button
        disabled
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm font-medium cursor-default ${className}`}
      >
        <Check className="w-3.5 h-3.5" /> Connected
      </button>
    );
  } else if (status === 'pending_outgoing' || status === 'pending_incoming') {
    connectButton = (
      <button
        disabled
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-sm font-medium cursor-default ${className}`}
      >
        <Clock className="w-3.5 h-3.5" /> Pending
      </button>
    );
  } else if (status === 'blocked') {
    connectButton = (
      <button
        disabled
        title="Unavailable"
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 border border-stone-200 text-stone-400 rounded-lg text-sm font-medium cursor-not-allowed ${className}`}
      >
        <UserPlus className="w-3.5 h-3.5" /> Connect
      </button>
    );
  } else {
    // 'none', 'disconnected', or null (signed-out / loading) — clickable.
    connectButton = (
      <button
        onClick={onConnect}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 text-stone-800 rounded-lg text-sm font-medium hover:bg-stone-50 ${className}`}
      >
        <UserPlus className="w-3.5 h-3.5" /> Connect
      </button>
    );
  }

  // Ask About — disabled placeholder until the typed Professional enquiry
  // exists in the Messaging pass. Rendered so the UX is visible, but it
  // never creates incorrect data.
  const askAboutButton = (
    <button
      disabled
      title="Professional enquiry — coming soon"
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-50 border border-stone-200 text-stone-400 rounded-lg text-sm font-medium cursor-not-allowed ${className}`}
    >
      <MessageSquare className="w-3.5 h-3.5" /> Ask About
    </button>
  );

  return (
    <div className="flex items-center gap-2">
      {connectButton}
      {askAboutButton}
    </div>
  );
}