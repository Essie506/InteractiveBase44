// Pure calendar event diff + version computation.
// ───────────────────────────────────────────────────────────
// Used by saveCalendarEvent to decide which semantic notification to emit
// for each recipient, and to compute a deterministic version so identical
// retries produce the same notification identity (idempotent) while a
// genuinely different edit produces a new version (a new notification).
//
// Precedence: reschedule > material update. If both time and other
// material fields change, the event is classified as a reschedule (the
// more important signal) — a reschedule notification is NOT also sent as
// an "updated" notification.
//
// Added/removed invitees are independent of reschedule/update: a newly
// added invitee gets 'invited' (not reschedule), and a removed invitee
// gets 'invitation_removed', regardless of whether the event was also
// rescheduled.

import { createHash } from 'crypto';

const MATERIAL_FIELDS = [
  'title',
  'description',
  'location_type',
  'meeting_url',
  'visibility',
  'capacity',
  'location_id',
];

export interface EventDiff {
  isReschedule: boolean;
  isMaterialUpdate: boolean;
  addedInvitees: string[];
  removedInvitees: string[];
  isCancellation: boolean;
  isNoOp: boolean;
}

export function diffEventChanges(
  existing: Record<string, any> | null,
  updatePayload: Record<string, any>,
): EventDiff {
  // Cancellation — manual events only (booking-owned cancellation is
  // rejected upstream by saveCalendarEvent).
  if (
    existing &&
    updatePayload.lifecycle_state === 'cancelled' &&
    existing.lifecycle_state !== 'cancelled'
  ) {
    return {
      isReschedule: false,
      isMaterialUpdate: false,
      addedInvitees: [],
      removedInvitees: [],
      isCancellation: true,
      isNoOp: false,
    };
  }

  const isReschedule = !!existing && (
    timeChanged(existing.start_time, updatePayload.start_time) ||
    timeChanged(existing.end_time, updatePayload.end_time)
  );

  let isMaterialUpdate = false;
  if (existing) {
    for (const f of MATERIAL_FIELDS) {
      if (f in updatePayload && !sameValue(existing[f], updatePayload[f])) {
        isMaterialUpdate = true;
        break;
      }
    }
  }

  const oldInvited = dedupe(existing?.invited_identity_ids || []);
  const newInvited = dedupe(
    'invited_identity_ids' in updatePayload
      ? updatePayload.invited_identity_ids
      : (existing?.invited_identity_ids || []),
  );
  const addedInvitees = newInvited.filter((id) => !oldInvited.includes(id));
  const removedInvitees = oldInvited.filter((id) => !newInvited.includes(id));

  const isNoOp =
    !isReschedule &&
    !isMaterialUpdate &&
    addedInvitees.length === 0 &&
    removedInvitees.length === 0 &&
    !isCancellation;

  return { isReschedule, isMaterialUpdate, addedInvitees, removedInvitees, isCancellation, isNoOp };
}

/**
 * Deterministic version for update-type events (update / reschedule).
 * Hash of the changed-field set + new values, so an identical retry yields
 * the same version (idempotent notification identity) while a genuinely
 * different edit yields a new version (a new notification).
 */
export function computeUpdateVersion(
  existing: Record<string, any>,
  updatePayload: Record<string, any>,
): string {
  const changed: string[] = [];
  const fields = ['start_time', 'end_time', ...MATERIAL_FIELDS];
  for (const f of fields) {
    if (f in updatePayload && !sameValue(existing[f], updatePayload[f])) {
      changed.push(`${f}=${String(updatePayload[f])}`);
    }
  }
  changed.sort();
  return stableHash(changed.join('|'));
}

/** Deterministic version for invitation-removal events. */
export function computeRemovalVersion(eventId: string, recipientId: string, updatedDate: string): string {
  return stableHash([eventId, recipientId, updatedDate].join('|'));
}

function timeChanged(a: any, b: any): boolean {
  if (b === undefined) return false;
  return new Date(a).getTime() !== new Date(b).getTime();
}

function sameValue(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return String(a) === String(b);
}

function dedupe(arr: any[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    if (v == null) continue;
    const s = String(v);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function stableHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 32);
}