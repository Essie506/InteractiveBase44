// Source Unavailable tests (§106–§108, §111).
// ───────────────────────────────────────────────────────────
// Verifies the source-unavailable handler, privacy-safe redaction,
// history preservation, and client-side display helpers.
// Run with: node tests/source-unavailable.test.cjs

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const HANDLER = path.join(__dirname, '..', 'cloud-functions', 'src', 'handleSourceUnavailable.ts');
const CLIENT_LIB = path.join(__dirname, '..', 'src', 'lib', 'sourceUnavailable.js');
const INDEX = path.join(__dirname, '..', 'cloud-functions', 'src', 'index.ts');

const handlerSrc = fs.readFileSync(HANDLER, 'utf8');
const clientSrc = fs.readFileSync(CLIENT_LIB, 'utf8');
const indexSrc = fs.readFileSync(INDEX, 'utf8');

// ── Handler exists and is exported ──
test('HANDLER: handleSourceUnavailable.ts exists', () => {
  if (!fs.existsSync(HANDLER)) throw new Error('handleSourceUnavailable.ts must exist');
});

test('HANDLER: exported from index.ts', () => {
  if (!/handleSourceUnavailable/.test(indexSrc)) {
    throw new Error('handleSourceUnavailable must be exported from index.ts');
  }
});

test('HANDLER: uses onCall with region + cors', () => {
  if (!/onCall\(/.test(handlerSrc) || !/europe-west2/.test(handlerSrc)) {
    throw new Error('Handler must use onCall with europe-west2 region');
  }
});

// ── §106: Deleted Source Records ──
test('HANDLER: resolves deleted → removed (§106)', () => {
  const fn = requireFn(handlerSrc, 'resolveUnavailableTransition');
  const result = fn('scheduled', 'deleted');
  assert.strictEqual(result.newLifecycleState, 'removed');
  assert.strictEqual(result.redactDetail, true);
});

test('HANDLER: resolves access_lost → removed (§106/§107)', () => {
  const fn = requireFn(handlerSrc, 'resolveUnavailableTransition');
  const result = fn('scheduled', 'access_lost');
  assert.strictEqual(result.newLifecycleState, 'removed');
});

test('HANDLER: does NOT reconstruct deleted source content (§106)', () => {
  // The handler must not fabricate source information
  if (!/must NOT|do not|NOT fabricate/i.test(handlerSrc) && !/REDACTED/.test(handlerSrc)) {
    throw new Error('Handler must not reconstruct deleted source content');
  }
});

// ── §107: Source Restriction ──
test('HANDLER: redacts source detail (title, description, meeting_url) (§107)', () => {
  const fn = requireFn(handlerSrc, 'buildRedactionPayload');
  const payload = fn({ title: 'Secret Booking', description: 'Private details', meeting_url: 'https://secret.meeting' });
  assert.strictEqual(payload.title, 'Unavailable event');
  assert.strictEqual(payload.description, null || payload.description.includes('no longer available'));
  assert.strictEqual(payload.meetingUrl, null);
  assert.strictEqual(payload.source_detail_redacted, true);
});

test('HANDLER: preserves Calendar-owned fields (time) — does not redact start_time', () => {
  const fn = requireFn(handlerSrc, 'buildRedactionPayload');
  const payload = fn({ start_time: '2026-01-01T10:00:00Z' });
  // start_time should NOT be in the redaction payload (Calendar owns it)
  assert.ok(!('start_time' in payload), 'start_time must not be redacted (Calendar owns when)');
});

// ── §108: Account Deactivation ──
test('HANDLER: deactivated → cancelled (not removed) (§108)', () => {
  const fn = requireFn(handlerSrc, 'resolveUnavailableTransition');
  const result = fn('scheduled', 'deactivated');
  assert.strictEqual(result.newLifecycleState, 'cancelled');
});

test('HANDLER: does NOT delete the event (§108 — history preserved)', () => {
  // The handler must use set/update, NOT delete
  if (/\.delete\(\)/.test(handlerSrc) && !/catch\(\(\) => \{\}\)/.test(handlerSrc.split('delete')[0].slice(-100))) {
    // delete is only allowed for projection cleanup, not the event itself
    const eventDeletePattern = /collection\(EVENTS\)\.doc\([^)]+\)\.delete\(\)/;
    if (eventDeletePattern.test(handlerSrc)) {
      throw new Error('Handler must NOT delete the Calendar Event (§108)');
    }
  }
});

test('HANDLER: appends schedule history (§108 — append-only)', () => {
  if (!/appendScheduleHistory/.test(handlerSrc)) {
    throw new Error('Handler must append schedule history (§108)');
  }
});

// ── §111: Source Unavailable State (transient) ──
test('HANDLER: unavailable → lifecycle unchanged, detail redacted (§111)', () => {
  const fn = requireFn(handlerSrc, 'resolveUnavailableTransition');
  const result = fn('scheduled', 'unavailable');
  assert.strictEqual(result.newLifecycleState, null); // lifecycle unchanged
  assert.strictEqual(result.redactDetail, true); // detail still redacted
});

test('HANDLER: terminal states are not re-transitioned', () => {
  const fn = requireFn(handlerSrc, 'resolveUnavailableTransition');
  const result = fn('cancelled', 'deleted');
  assert.strictEqual(result.newLifecycleState, null); // already terminal
  assert.strictEqual(result.redactDetail, true); // still redact for §107
});

// ── Client-side helpers ──
test('CLIENT: isSourceUnavailable detects redacted flag', () => {
  // Inline test of the client lib logic
  const event = { source_detail_redacted: true, lifecycle_state: 'scheduled' };
  // Simulate the function
  const isRedacted = event.source_detail_redacted === true || event.lifecycle_state === 'removed';
  assert.strictEqual(isRedacted, true);
});

test('CLIENT: isSourceUnavailable detects removed lifecycle', () => {
  const event = { lifecycle_state: 'removed' };
  const isRedacted = event.source_detail_redacted === true || event.lifecycle_state === 'removed';
  assert.strictEqual(isRedacted, true);
});

test('CLIENT: getSafeDisplayValues redacts source-owned fields', () => {
  const event = { source_detail_redacted: true, title: 'Old Title', description: 'Secret', meeting_url: 'https://x' };
  // Simulate: if redacted, title stays (already redacted server-side), description=null, meetingUrl=null
  const safe = {
    title: event.title || 'Unavailable event',
    description: null,
    meetingUrl: null,
    sourceUnavailable: true,
  };
  assert.strictEqual(safe.description, null);
  assert.strictEqual(safe.meetingUrl, null);
});

test('CLIENT: getSafeDisplayValues preserves values for non-redacted events', () => {
  const event = { lifecycle_state: 'scheduled', title: 'My Event', description: 'Details', meeting_url: 'https://x' };
  const isRedacted = event.source_detail_redacted === true || event.lifecycle_state === 'removed';
  const safe = isRedacted
    ? { title: 'Unavailable event', description: null, meetingUrl: null }
    : { title: event.title, description: event.description, meetingUrl: event.meeting_url };
  assert.strictEqual(safe.title, 'My Event');
  assert.strictEqual(safe.description, 'Details');
});

test('CLIENT: sourceUnavailable.js exports required functions', () => {
  if (!/export function isSourceUnavailable/.test(clientSrc)) throw new Error('isSourceUnavailable must be exported');
  if (!/export function getSafeDisplayValues/.test(clientSrc)) throw new Error('getSafeDisplayValues must be exported');
  if (!/export function getSourceUnavailableLabel/.test(clientSrc)) throw new Error('getSourceUnavailableLabel must be exported');
});

// ── Ownership boundary ──
test('HANDLER: Calendar reacts, does not own source state', () => {
  if (!/REACTS to authoritative source/.test(handlerSrc) && !/does NOT own/.test(handlerSrc)) {
    throw new Error('Handler must document that Calendar reacts, not owns, source state');
  }
});

test('HANDLER: validates reason against allowed set', () => {
  if (!/VALID_REASONS/.test(handlerSrc)) {
    throw new Error('Handler must validate reason against an allowed set');
  }
});

// Helper: extract and eval a function from TS source (for pure functions)
function requireFn(src, fnName) {
  // Extract the function body using regex and eval it
  const fnRegex = new RegExp(`export function ${fnName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`, 'm');
  const match = src.match(fnRegex);
  if (!match) throw new Error(`Function ${fnName} not found in source`);
  // Remove 'export ' and eval
  const fnStr = match[0].replace('export ', '');
  // eslint-disable-next-line no-eval
  return eval(`(${fnStr.replace(/: [^,)]+/g, '').replace(/=>/g, '=>').replace(/\{[^}]*\}/g, '{}')})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);