// Content moderation — first-line gate for user-generated calendar content.
// ───────────────────────────────────────────────────────────
// Validates event titles and descriptions against basic length and
// profanity rules. This is a lightweight server-side gate invoked by
// saveCalendarEvent and splitRecurrenceSeries before persisting
// user-supplied text.
//
// This is NOT a full moderation system. Production may require LLM-based
// classification or a dedicated moderation service; this gate catches
// obvious violations (excessive length, clear profanity) so unmoderated
// content is not published to the public projection unchecked.

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;

// Minimal profanity list — intentionally conservative. Production should
// replace with a comprehensive list or external service.
const PROFANITY_LIST = [
  'fuck', 'shit', 'cunt', 'bastard', 'wanker', 'bollocks',
];

export interface ModerationResult {
  passed: boolean;
  reason?: string;
}

/**
 * Moderate user-generated event title and description.
 * Returns { passed: true } when acceptable, { passed: false, reason } otherwise.
 * Null/undefined fields are treated as empty (pass) — only supplied content is checked.
 */
export function moderateEventContent(
  title: string | null | undefined,
  description: string | null | undefined,
): ModerationResult {
  const t = title || '';
  const d = description || '';

  if (t.length > MAX_TITLE_LENGTH) {
    return { passed: false, reason: 'Title exceeds maximum length' };
  }
  if (d.length > MAX_DESCRIPTION_LENGTH) {
    return { passed: false, reason: 'Description exceeds maximum length' };
  }

  const lowerTitle = t.toLowerCase();
  const lowerDesc = d.toLowerCase();
  for (const word of PROFANITY_LIST) {
    if (lowerTitle.includes(word) || lowerDesc.includes(word)) {
      return { passed: false, reason: 'Content contains prohibited language' };
    }
  }

  return { passed: true };
}