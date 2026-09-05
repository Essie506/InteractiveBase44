// Calendar Real-Time Updates — secure signal-channel subscription (§99).
// ───────────────────────────────────────────────────────────
// Real-time presentation of Calendar state changes WITHOUT weakening
// security. See cloud-functions/src/calendarSignal.ts for the full
// rationale.
//
// WHY NOT direct onSnapshot on calendarEvents/calendarParticipation:
// Firestore rules resolve the caller's identity via get(identityMappings)
// and check resource.data against it. The query validator CANNOT
// evaluate get()/exists()-derived values for LIST (collection query)
// operations, so any where()-filtered onSnapshot on those collections
// fails with "Missing or insufficient permissions" — a permission
// denial, not a missing index. Weakening the rules to allow those
// queries would compromise the security boundary.
//
// ARCHITECTURE: the client subscribes via onSnapshot to its OWN single
// `calendarSignals/{identityId}` document. A single-document realtime
// listen evaluates the document read rule, where get()-derived identity
// checks ARE allowed (unlike list queries). Cloud Functions bump a
// version counter on that doc whenever a calendar event / participation
// / invitation changes for the identity. On any signal change the
// client re-fetches the authoritative view via getCalendarView.
//
// This is true realtime (event-driven, not polled) and the authoritative
// read remains server-side, so conflict/availability validation is never
// bypassed (§99). The signal carries NO event data — only a version
// counter + timestamp — so it cannot leak data to an unauthorised reader.

import { db } from '@/firebase/firebaseClient';
import { doc, onSnapshot } from 'firebase/firestore';

/**
 * Subscribe to realtime Calendar change signals for the current identity.
 *
 * On every signal change (another user or the server mutated an event
 * affecting this identity), `onChange` is called with the new signal
 * version. The caller should re-fetch the authoritative view (e.g.
 * loadEvents()) in response. Returns an unsubscribe function.
 *
 * @param {string} identityId — the caller's stable Interactive identity ID
 * @param {(version: number|null) => void} onChange
 * @param {(error: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeToCalendarSignal(identityId, onChange, onError) {
  if (!identityId) {
    return () => {};
  }
  const ref = doc(db, 'calendarSignals', identityId);
  return onSnapshot(
    ref,
    (snap) => {
      const version = snap.exists() ? (snap.data().version ?? null) : null;
      onChange(version);
    },
    (error) => {
      if (onError) onError(error);
      else console.error('[calendarRealtime] signal subscription error:', error);
    },
  );
}

/**
 * Merge multiple event lists and deduplicate by authoritative Event ID.
 * Retained for combined-calendar aggregation callers.
 */
export function mergeAndDedupeEvents(...eventLists) {
  const byId = new Map();
  for (const list of eventLists) {
    if (!Array.isArray(list)) continue;
    for (const e of list) {
      if (!e) continue;
      if (!byId.has(e.id)) byId.set(e.id, e);
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.start_time) - new Date(b.start_time),
  );
}