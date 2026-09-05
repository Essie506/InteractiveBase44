// Calendar Authority — client-side edit capability gating (V2).
// ───────────────────────────────────────────────────────────
// V2 requires a strict separation between:
//   - event visibility (can see the event)
//   - participation state (pending/accepted/declined/revoked)
//   - mutation authority (can edit/cancel/reschedule/delete)
//
// Invitation (invited_identity_ids) and assignment (assigned_identity_ids)
// grant VIEW/PARTICIPATION only — NEVER edit/cancel/reschedule authority.
// Mutation authority comes from being the creator OR the identity owner
// OR having Business Calendar management permission (manage_calendar).
//
// This helper is a UI gate — it determines whether the UI PRESENTS edit
// capabilities. The server-side saveCalendarEvent Cloud Function is the
// authoritative security boundary (it re-checks creator/owner/business
// manager server-side). UI hiding is NOT a security boundary; this helper
// exists so the UI does not present edit capabilities to non-authorised
// viewers, matching the server-side authority model.
//
// Business manager check: the client uses the active operating context as
// a proxy. If the user is in business context with active_business_id
// matching the event's business_id, they are treated as a business
// manager. The server-side hasBusinessCalendarPermission is authoritative
// — if the client incorrectly grants UI edit, the server rejects the
// save. This proxy avoids an async membership lookup on every event click.

/**
 * Determine whether the current user can edit/cancel/reschedule a calendar
 * event. Returns true ONLY for the creator, the identity owner, or a
 * business manager in the event's business context. Returns false for
 * invitees, assignees, and any other viewer.
 *
 * @param {object} event — the CalendarEvent (or occurrence's .event)
 * @param {object} user — the current authenticated user (from AuthContext)
 * @returns {boolean}
 */
export function canEditEvent(event, user) {
  if (!event || !user) return false;

  // 1. Creator — immutable authority. The creator retains edit/cancel/
  //    reschedule permission (subject to domain lifecycle restrictions
  //    such as Booking-owned events).
  if (event.created_by_id === user.id) return true;

  // 2. Identity owner — the identity that owns the event (Personal and
  //    Professional are operating contexts of ONE identity, not separate
  //    owners). Only the identity owner can edit identity-owned events.
  if (event.owner_type === 'identity' && event.owner_id === user.id) return true;

  // 3. Business calendar manager — the user is operating in the event's
  //    business context. The server-side hasBusinessCalendarPermission
  //    is the authoritative check; this proxy avoids an async lookup.
  if (
    event.owner_type === 'business' &&
    event.business_id &&
    user.active_context === 'business' &&
    user.active_business_id === event.business_id
  ) {
    return true;
  }

  // Invitees, assignees, and non-managers CANNOT edit.
  return false;
}

/**
 * Determine whether the current user can cancel a calendar event.
 * Cancel is a mutation — same authority as edit. Booking-owned events
 * cannot be cancelled through the Calendar (they must go through the
 * Booking cancellation flow for refund policy).
 *
 * @param {object} event — the CalendarEvent
 * @param {object} user — the current authenticated user
 * @returns {boolean}
 */
export function canCancelEvent(event, user) {
  if (!canEditEvent(event, user)) return false;
  // Booking-owned events must be cancelled through the Booking flow.
  if (event.source_system === 'booking') return false;
  if (event.lifecycle_state === 'cancelled' || event.lifecycle_state === 'removed') return false;
  return true;
}

// ── Personal Event Lifecycle (§16) ──────────────────────────
// Calendar can support user-controlled Completed/Skipped/Rescheduled/
// Archived for personal events. These states are meaningful only for
// identity-owned personal-context events (manual source). Source-owned
// events (booking, workout, business_scheduling) derive their lifecycle
// from their owning system and must not be marked completed/skipped here.
// Mutation authority is the same as edit (creator or identity owner).
export const PERSONAL_LIFECYCLE_STATES = ['completed', 'skipped', 'archived'];

export function canSetPersonalLifecycle(event, user) {
  if (!canEditEvent(event, user)) return false;
  if (!event) return false;
  if (event.source_system && event.source_system !== 'manual') return false;
  if (event.owner_type !== 'identity') return false;
  if (event.operating_context && event.operating_context !== 'personal') return false;
  return true;
}

// ── Delete vs Cancel (§52) ───────────────────────────────────
// Delete is a destructive removal of a Calendar-owned object, distinct
// from Cancel (which preserves the historical relationship). Permitted
// only for personal manual events owned by the caller, and only when the
// event is not booking-owned. Server-side enforcement lives in the
// deleteCalendarEvent Cloud Function; this helper gates the UI.
export function canDeleteEvent(event, user) {
  if (!canEditEvent(event, user)) return false;
  if (!event) return false;
  if (event.source_system && event.source_system !== 'manual') return false;
  if (event.owner_type !== 'identity') return false;
  return true;
}

// ── Participant (non-owner) authority ──────────────────────────
// V2: actions are derived from the user's RELATIONSHIP to the event, not
// just whether they created it. A participant (invited or assigned) is NOT
// the owner/creator and therefore cannot edit/cancel/reschedule/delete the
// canonical event — but they CAN manage their own personal timeline state
// (Mark Completed, Mark Skipped, Archive / Remove from my timeline).
//
// isParticipant returns true ONLY for non-owner invited/assigned identities.
// Owners/creators/business-managers are NOT participants (they have
// canonical authority, not personal-state authority).
export function isParticipant(event, user) {
  if (!event || !user) return false;
  if (canEditEvent(event, user)) return false;
  const invited = event.invited_identity_ids || [];
  const assigned = event.assigned_identity_ids || [];
  return invited.includes(user.id) || assigned.includes(user.id);
}

// Personal timeline state authority: a participant can set their own
// personal_lifecycle_state / hidden_from_timeline. This is independent of
// the event's source system — imported/read-only/source-controlled events
// keep canonical fields read-only, but personal timeline actions remain
// available to participants wherever technically appropriate.
export function canSetPersonalTimelineState(event, user) {
  return isParticipant(event, user);
}