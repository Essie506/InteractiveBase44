// Source Unavailable — client-side helpers (§106–§111).
// ───────────────────────────────────────────────────────────
// Determines whether a Calendar Event has a privacy-safe unavailable
// representation, and provides the redacted display values for the UI.
//
// Calendar owns the transition (server-side handleSourceUnavailable).
// The client only READS the redacted state and presents it safely.
//
// §107: protected source information must not be exposed through an
//   old Calendar Event after access is lost.
// §111: where source detail cannot be retrieved, present a privacy-safe
//   unavailable state. Do NOT fabricate source information.

// Lifecycle states that indicate the source is unavailable.
const UNAVAILABLE_LIFECYCLE_STATES = new Set(['removed']);

/**
 * Whether a Calendar Event's source detail has been redacted (§107/§111).
 * Checks the server-set `source_detail_redacted` flag OR a lifecycle state
 * that implies unavailability.
 */
export function isSourceDetailRedacted(event) {
  if (!event) return false;
  if (event.source_detail_redacted === true) return true;
  if (UNAVAILABLE_LIFECYCLE_STATES.has(event.lifecycle_state)) return true;
  return false;
}

/**
 * Whether a Calendar Event is in a privacy-safe unavailable state (§111).
 * The event exists (schedule evidence preserved) but its source detail
 * cannot be presented.
 */
export function isSourceUnavailable(event) {
  if (!event) return false;
  return isSourceDetailRedacted(event);
}

/**
 * Return the privacy-safe display values for an event whose source is
 * unavailable. Calendar-owned fields (time, timezone, all_day) are
 * preserved; source-owned fields (title, description, meeting_url) are
 * replaced with privacy-safe values.
 *
 * This does NOT fabricate source information (§111). It presents only
 * what Calendar authoritatively owns: when the event was scheduled.
 */
export function getSafeDisplayValues(event) {
  if (!isSourceUnavailable(event)) {
    return {
      title: event?.title || '',
      description: event?.description || '',
      meetingUrl: event?.meeting_url || null,
      sourceUnavailable: false,
    };
  }
  return {
    title: event?.title || 'Unavailable event',
    description: null, // redacted — do not expose stale source description
    meetingUrl: null,  // redacted — do not expose stale meeting URL
    sourceUnavailable: true,
  };
}

/**
 * Human-readable label for the source-unavailable state.
 */
export function getSourceUnavailableLabel(event) {
  if (!isSourceUnavailable(event)) return null;
  const reason = event?.source_unavailable_reason;
  if (reason === 'deleted') return 'Source deleted';
  if (reason === 'access_lost') return 'Access revoked';
  if (reason === 'deactivated') return 'Source deactivated';
  if (reason === 'unavailable') return 'Source unavailable';
  return 'Source unavailable';
}