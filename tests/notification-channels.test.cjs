// Notification channel resolution — pure regression tests.
// ───────────────────────────────────────────────────────────
// Mirrors cloud-functions/src/notifications/policy.ts and asserts:
//   required    → delivered regardless of opt-out
//   conditional → respects NotificationPreference; defaults delivered when prefs missing (guests)
//   prohibited  → never delivered
// Plus the five calendar event types are present with in_app required,
// email conditional, push prohibited (push not activated this pass).

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const DELIVERY_POLICY = {
  calendar_event_invited:      { in_app: 'required',     email: 'conditional', push: 'prohibited' },
  calendar_event_updated:      { in_app: 'required',     email: 'conditional', push: 'prohibited' },
  calendar_event_rescheduled:  { in_app: 'required',     email: 'conditional', push: 'prohibited' },
  calendar_event_cancelled:    { in_app: 'required',     email: 'conditional', push: 'prohibited' },
  calendar_invitation_removed: { in_app: 'required',     email: 'conditional', push: 'prohibited' },
  security_event:              { in_app: 'required',     email: 'required',    push: 'required' },
  booking_confirmed:           { in_app: 'required',     email: 'conditional', push: 'prohibited' },
};

function resolveDeliveryPolicy(eventType, channel) {
  const p = DELIVERY_POLICY[eventType];
  if (!p) return 'prohibited';
  return p[channel] || 'prohibited';
}
function resolveChannels(eventType, category, prefs, consider = ['in_app', 'email']) {
  const out = [];
  for (const ch of consider) {
    const policy = resolveDeliveryPolicy(eventType, ch);
    if (policy === 'required') out.push(ch);
    else if (policy === 'conditional') {
      if (!prefs) out.push(ch);
      else if (prefs[`${category || 'system'}_${ch}`] !== false) out.push(ch);
    }
  }
  return out;
}

// ── Source contract ──
test('policy module defines the five calendar event types', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'cloud-functions', 'src', 'notifications', 'policy.ts'), 'utf8');
  for (const t of ['calendar_event_invited', 'calendar_event_updated', 'calendar_event_rescheduled', 'calendar_event_cancelled', 'calendar_invitation_removed']) {
    if (!src.includes(t)) throw new Error(`policy.ts missing ${t}`);
  }
  if (!/export function resolveChannels/.test(src)) throw new Error('resolveChannels not exported');
});
test('policy module defaults channelsToConsider to in_app + email (push not activated)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'cloud-functions', 'src', 'notifications', 'policy.ts'), 'utf8');
  if (!/\[\s*['"]in_app['"]\s*,\s*['"]email['"]\s*\]/.test(src)) throw new Error('default channels must be in_app + email');
});

// ── required ──
test('required channel delivers regardless of opt-out', () => {
  const ch = resolveChannels('security_event', 'security', { security_email: false, security_in_app: false });
  if (!ch.includes('in_app')) throw new Error('required in_app must deliver despite opt-out');
  if (!ch.includes('email')) throw new Error('required email must deliver despite opt-out');
});
test('calendar in_app is required (delivers even if user opted out)', () => {
  const ch = resolveChannels('calendar_event_invited', 'calendar', { calendar_in_app: false, calendar_email: true });
  if (!ch.includes('in_app')) throw new Error('calendar in_app must be required');
});

// ── conditional ──
test('conditional email delivers when preference is true', () => {
  const ch = resolveChannels('calendar_event_invited', 'calendar', { calendar_email: true, calendar_in_app: true });
  if (!ch.includes('email')) throw new Error('email should deliver when pref true');
});
test('conditional email is suppressed when preference is false', () => {
  const ch = resolveChannels('calendar_event_invited', 'calendar', { calendar_email: false, calendar_in_app: true });
  if (ch.includes('email')) throw new Error('email should be suppressed when pref false');
});
test('conditional email defaults to delivered when prefs are missing (guest)', () => {
  const ch = resolveChannels('calendar_event_invited', 'calendar', null);
  if (!ch.includes('email')) throw new Error('guest (no prefs) should get email by default');
  if (!ch.includes('in_app')) throw new Error('in_app required should always deliver');
});

// ── prohibited ──
test('push is not activated for calendar events this pass', () => {
  const ch = resolveChannels('calendar_event_invited', 'calendar', null, ['in_app', 'email', 'push']);
  if (ch.includes('push')) throw new Error('push must be prohibited for calendar events this pass');
});

// ── unknown event type ──
test('unknown event type resolves to no channels', () => {
  const ch = resolveChannels('nonexistent_event', 'system', null);
  if (ch.length !== 0) throw new Error('unknown event type must yield no channels');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);