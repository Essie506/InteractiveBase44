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

// Helper: extract a function body from TS source
function extractFn(src, fnName) {
  const re = new RegExp(`export function ${fnName}[\\s\\S]*?\\n\\}`);
  const m = src.match(re);
  return m ? m[0] : null;
}

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

// ── §106: Deleted Source Records — transition rules ──
test('HANDLER: resolveUnavailableTransition exists', () => {
  const fn = extractFn(handlerSrc, 'resolveUnavailableTransition');
  if (!fn) throw new Error('resolveUnavailableTransition must exist');
});

test('HANDLER: deleted → removed (§106)', () => {
  const fn = extractFn(handlerSrc, 'resolveUnavailableTransition');
  if (!fn) throw new Error('resolveUnavailableTransition must exist');
  if (!/case 'deleted'/.test(fn)) throw new Error('Must handle deleted case');
  if (!/'removed'/.test(fn)) throw new Error('deleted must map to removed');
});

test('HANDLER: access_lost → removed (§106/§107)', () => {
  const fn = extractFn(handlerSrc, 'resolveUnavailableTransition');
  if (!fn) throw new Error('resolveUnavailableTransition must exist');
  if (!/case 'access_lost'/.test(fn)) throw new Error('Must handle access_lost case');
  if (!/'removed'/.test(fn)) throw new Error('access_lost must map to removed');
});

test('HANDLER: does NOT reconstruct deleted source content (§106)', () => {
  if (!/must NOT.*reconstruct|do not.*reconstruct|NOT fabricate/i.test(handlerSrc)) {
    throw new Error('Handler must document it does not reconstruct deleted source content');
  }
});

// ── §107: Source Restriction — redaction ──
test('HANDLER: buildRedactionPayload exists', () => {
  const fn = extractFn(handlerSrc, 'buildRedactionPayload');
  if (!fn) throw new Error('buildRedactionPayload must exist');
});

test('HANDLER: redacts source detail — title (§107)', () => {
  const fn = extractFn(handlerSrc, 'buildRedactionPayload');
  if (!fn) throw new Error('buildRedactionPayload must exist');
  if (!/title/.test(fn)) throw new Error('Must redact title');
});

test('HANDLER: redacts source detail — description (§107)', () => {
  const fn = extractFn(handlerSrc, 'buildRedactionPayload');
  if (!fn) throw new Error('buildRedactionPayload must exist');
  if (!/description/.test(fn)) throw new Error('Must redact description');
});

test('HANDLER: redacts source detail — meeting_url (§107)', () => {
  const fn = extractFn(handlerSrc, 'buildRedactionPayload');
  if (!fn) throw new Error('buildRedactionPayload must exist');
  if (!/meeting_url/.test(fn)) throw new Error('Must redact meeting_url');
});

test('HANDLER: redaction sets source_detail_redacted flag', () => {
  const fn = extractFn(handlerSrc, 'buildRedactionPayload');
  if (!fn) throw new Error('buildRedactionPayload must exist');
  if (!/source_detail_redacted.*true/.test(fn)) {
    throw new Error('Redaction must set source_detail_redacted = true');
  }
});

test('HANDLER: preserves Calendar-owned fields (time) — does not redact start_time', () => {
  const fn = extractFn(handlerSrc, 'buildRedactionPayload');
  if (!fn) throw new Error('buildRedactionPayload must exist');
  if (/start_time/.test(fn)) {
    throw new Error('start_time must not be in redaction payload (Calendar owns when)');
  }
});

// ── §108: Account Deactivation ──
test('HANDLER: deactivated → cancelled (not removed) (§108)', () => {
  const fn = extractFn(handlerSrc, 'resolveUnavailableTransition');
  if (!fn) throw new Error('resolveUnavailableTransition must exist');
  if (!/case 'deactivated'/.test(fn)) throw new Error('Must handle deactivated case');
  // deactivated should map to cancelled, not removed
  const deactivatedMatch = fn.match(/case 'deactivated'[\s\S]*?(?:case|return|\})/);
  if (!deactivatedMatch) throw new Error('deactivated case must exist');
  if (!/'cancelled'/.test(deactivatedMatch[0])) {
    throw new Error('deactivated must map to cancelled (§108)');
  }
});

test('HANDLER: does NOT delete the Calendar Event (§108 — history preserved)', () => {
  const eventDeletePattern = /collection\(EVENTS\)\.doc\([^)]+\)\.delete\(\)/;
  if (eventDeletePattern.test(handlerSrc)) {
    throw new Error('Handler must NOT delete the Calendar Event (§108)');
  }
});

test('HANDLER: appends schedule history (§108 — append-only)', () => {
  if (!/appendScheduleHistory/.test(handlerSrc)) {
    throw new Error('Handler must append schedule history (§108)');
  }
});

test('HANDLER: history change_type includes source_unavailable', () => {
  if (!/source_unavailable/.test(handlerSrc)) {
    throw new Error('Handler must record source_unavailable change type in history');
  }
});

// ── §111: Source Unavailable State (transient) ──
test('HANDLER: unavailable → lifecycle unchanged, detail redacted (§111)', () => {
  const fn = extractFn(handlerSrc, 'resolveUnavailableTransition');
  if (!fn) throw new Error('resolveUnavailableTransition must exist');
  if (!/case 'unavailable'/.test(fn)) throw new Error('Must handle unavailable case');
  const unavailableMatch = fn.match(/case 'unavailable'[\s\S]*?(?:case|return|\})/);
  if (!unavailableMatch) throw new Error('unavailable case must exist');
  if (!/newLifecycleState.*null/.test(unavailableMatch[0])) {
    throw new Error('unavailable must leave lifecycle unchanged (§111)');
  }
  if (!/redactDetail.*true/.test(unavailableMatch[0])) {
    throw new Error('unavailable must still redact detail (§111)');
  }
});

test('HANDLER: terminal states are not re-transitioned', () => {
  const fn = extractFn(handlerSrc, 'resolveUnavailableTransition');
  if (!fn) throw new Error('resolveUnavailableTransition must exist');
  if (!/TERMINAL_STATES/.test(fn)) {
    throw new Error('Handler must check terminal states');
  }
  if (!/newLifecycleState.*null/.test(fn)) {
    throw new Error('Terminal states must not be re-transitioned');
  }
});

// ── Client-side helpers ──
test('CLIENT: sourceUnavailable.js exports required functions', () => {
  if (!/export function isSourceUnavailable/.test(clientSrc)) throw new Error('isSourceUnavailable must be exported');
  if (!/export function getSafeDisplayValues/.test(clientSrc)) throw new Error('getSafeDisplayValues must be exported');
  if (!/export function getSourceUnavailableLabel/.test(clientSrc)) throw new Error('getSourceUnavailableLabel must be exported');
});

test('CLIENT: isSourceUnavailable checks source_detail_redacted flag', () => {
  if (!/source_detail_redacted/.test(clientSrc)) {
    throw new Error('isSourceUnavailable must check source_detail_redacted flag');
  }
});

test('CLIENT: isSourceUnavailable detects removed lifecycle', () => {
  if (!/'removed'/.test(clientSrc)) {
    throw new Error('isSourceUnavailable must detect removed lifecycle');
  }
});

test('CLIENT: getSafeDisplayValues redacts description to null', () => {
  if (!/description.*null/.test(clientSrc)) {
    throw new Error('getSafeDisplayValues must redact description to null');
  }
});

test('CLIENT: getSafeDisplayValues redacts meetingUrl to null', () => {
  if (!/meetingUrl.*null/.test(clientSrc)) {
    throw new Error('getSafeDisplayValues must redact meetingUrl to null');
  }
});

test('CLIENT: getSourceUnavailableLabel returns human-readable reasons', () => {
  if (!/Source deleted/.test(clientSrc)) throw new Error('Must return "Source deleted" for deleted');
  if (!/Access revoked/.test(clientSrc)) throw new Error('Must return "Access revoked" for access_lost');
  if (!/Source deactivated/.test(clientSrc)) throw new Error('Must return "Source deactivated" for deactivated');
});

// ── Ownership boundary ──
test('HANDLER: Calendar reacts, does not own source state', () => {
  if (!/REACTS to authoritative source|does NOT own/.test(handlerSrc)) {
    throw new Error('Handler must document that Calendar reacts, not owns, source state');
  }
});

test('HANDLER: validates reason against allowed set', () => {
  if (!/VALID_REASONS/.test(handlerSrc)) {
    throw new Error('Handler must validate reason against an allowed set');
  }
});

test('HANDLER: finds events by source_system + source_id', () => {
  if (!/source_system.*source_id|where\('source_system'/.test(handlerSrc)) {
    throw new Error('Handler must find events by source_system + source_id');
  }
});

test('HANDLER: refreshes public projection after transition', () => {
  if (!/refreshEventProjection/.test(handlerSrc)) {
    throw new Error('Handler must refresh public projection after transition');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);