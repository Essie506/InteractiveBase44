// Calendar Realtime Signal Channel (§99) — secure realtime propagation.
// ───────────────────────────────────────────────────────────
// PROBLEM: Firestore security rules resolve the caller's identity via
// get(identityMappings/{uid}) and check resource.data against it. The
// Firestore query validator CANNOT evaluate get()/exists()-derived
// values for LIST (collection query) operations, so direct client
// onSnapshot queries on calendarEvents / calendarParticipation fail
// with "Missing or insufficient permissions" — a permission denial, not
// a missing index. Weakening the rules to allow those queries would
// compromise the security boundary.
//
// SOLUTION: a per-identity signal document. Cloud Functions (Admin SDK,
// bypass rules) bump a version counter on `calendarSignals/{identityId}`
// whenever a calendar event / participation / invitation changes for
// that identity. The client subscribes via onSnapshot to its OWN single
// signal doc — a single-document realtime listen evaluates the document
// read rule, where get()-derived identity checks ARE allowed (unlike
// list queries). On any signal change the client re-fetches the
// authoritative view via the getCalendarView callable. This is true
// realtime (event-driven, not polled) and preserves the existing
// security model without weakening it.
//
// The signal carries NO event data — only a version counter + timestamp.
// It is a pure "something changed, re-fetch" notification. The
// authoritative read remains the server-side getCalendarView callable,
// so conflict/availability validation is never bypassed (§99).

import { db } from './shared';
import { FieldValue } from 'firebase-admin/firestore';

const SIGNALS = 'calendarSignals';

/**
 * Collect every identity whose Calendar view is affected by a change to
 * `event`. This is the set of identities for which getCalendarView would
 * return the event: the identity owner, the creator, assigned staff, and
 * invited identities. For business-owned events, all active business
 * members are included (they see business + combined staff calendar).
 */
export async function collectAffectedIdentities(event: any): Promise<string[]> {
  if (!event) return [];
  const ids = new Set<string>();

  if (event.owner_type === 'identity' && event.owner_id) {
    ids.add(event.owner_id);
  }
  if (event.created_by_id) ids.add(event.created_by_id);
  for (const id of event.assigned_identity_ids || []) {
    if (id) ids.add(id);
  }
  for (const id of event.invited_identity_ids || []) {
    if (id) ids.add(id);
  }

  // Business-owned events are visible to every active business member.
  if (event.owner_type === 'business' && event.business_id) {
    try {
      const snap = await db.collection('businessMemberships')
        .where('business_id', '==', event.business_id)
        .get();
      for (const doc of snap.docs) {
        const identityId = (doc.data() as any)?.identity_id;
        if (identityId) ids.add(identityId);
      }
    } catch {
      // Best-effort — a failed membership lookup must not block the write.
    }
  }
  return Array.from(ids);
}

/**
 * Bump the realtime signal for each affected identity. Idempotent and
 * best-effort — a failed bump must not fail the parent operation.
 */
export async function emitCalendarSignal(identityIds: string[]): Promise<void> {
  const unique = Array.from(new Set((identityIds || []).filter(Boolean)));
  if (unique.length === 0) return;
  const nowIso = new Date().toISOString();
  await Promise.all(unique.map((identityId) =>
    db.collection(SIGNALS).doc(identityId).set(
      {
        identity_id: identityId,
        version: FieldValue.increment(1),
        updated_at: nowIso,
        _updated_date: nowIso,
      },
      { merge: true },
    ).catch(() => {}),
  ));
}

/** Convenience: collect affected identities from an event then bump. */
export async function emitCalendarSignalForEvent(event: any): Promise<void> {
  const ids = await collectAffectedIdentities(event);
  await emitCalendarSignal(ids);
}