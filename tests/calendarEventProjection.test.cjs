// Static source-contract tests for the calendarEventsPublic projection.
// ───────────────────────────────────────────────────────────────────
// The public projection is produced server-side by
// `buildEventPublicProjection` in cloud-functions/src/calendarEventProjection.ts
// and written to calendarEventsPublic. Firestore rules deny ALL client
// writes to that collection (CE10), so the projection builder is the
// ONLY thing that shapes what the public sees. These tests parse the
// real source file and assert the returned object literal:
//
//   9.  does NOT project `meeting_url` (revealed only via booking flow).
//   10. does NOT project any internal/private CalendarEvent fields
//       (recurrence_rule, source_system, source_id, external_calendar_id,
//        external_event_id, created_by_id).
//
// They also assert the expected public-safe fields ARE present, so a
// future refactor that accidentally drops a public field is caught.
//
// These are static assertions against the authoritative source — they
// prove what the real builder emits without needing a TS toolchain.

const fs = require('fs');
const path = require('path');

const SOURCE = path.resolve(__dirname, '..', 'cloud-functions', 'src', 'calendarEventProjection.ts');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

// Extract the top-level keys of the object literal returned by
// buildEventPublicProjection. Tracks brace depth so nested object
// literals (e.g. `host: { type, id, ... }`) do not pollute the set.
function extractTopLevelReturnKeys(src) {
  const fnIdx = src.indexOf('buildEventPublicProjection');
  if (fnIdx === -1) throw new Error('buildEventPublicProjection not found in source');
  const afterFn = src.slice(fnIdx);
  const retIdx = afterFn.indexOf('return {');
  if (retIdx === -1) throw new Error('return { ... } not found in buildEventPublicProjection');
  const block = afterFn.slice(retIdx + 'return '.length);

  // Walk the block char by char, tracking brace depth. A newline always
  // re-arms key-scanning at the start of the next line; the depth===1
  // guard then ensures only TOP-LEVEL keys of the returned object are
  // captured (keys inside nested literals like `host: { ... }` are at
  // depth 2 and ignored). The source has no string literals containing
  // braces, so brace counting is safe here.
  const keys = [];
  let depth = 0;
  let scanningKey = false;
  let pendingKey = '';
  for (let i = 0; i < block.length; i++) {
    const ch = block[i];
    if (ch === '{') { depth++; scanningKey = false; pendingKey = ''; continue; }
    if (ch === '}') { depth--; if (depth === 0) break; scanningKey = false; pendingKey = ''; continue; }
    if (ch === '\n') { pendingKey = ''; scanningKey = true; continue; }
    if (depth === 1 && scanningKey) {
      if (ch === ':') {
        const k = pendingKey.trim();
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)) keys.push(k);
        scanningKey = false; pendingKey = ''; continue;
      }
      if (ch === ',') { scanningKey = false; pendingKey = ''; continue; }
      pendingKey += ch;
    }
  }
  return keys;
}

const PRIVATE_INTERNAL_FIELDS = [
  'meeting_url',
  'recurrence_rule',
  'source_system',
  'source_id',
  'external_calendar_id',
  'external_event_id',
  'created_by_id',
];

const EXPECTED_PUBLIC_FIELDS = [
  'event_id', 'title', 'description', 'start_time', 'end_time',
  'timezone', 'all_day', 'location_type', 'location_label', 'location_geo',
  'services', 'cover_media_id', 'cover_url', 'price_pence', 'currency',
  'is_free', 'capacity', 'spaces_remaining', 'availability_state',
  'host', 'visibility', 'lifecycle_state', 'owner_type', 'owner_id',
  'business_id', '_updated_date',
];

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Source not found: ${SOURCE}`);
    process.exit(1);
  }
  const src = fs.readFileSync(SOURCE, 'utf8');
  const keys = extractTopLevelReturnKeys(src);

  test('Projection source parses top-level keys', () => {
    if (keys.length < 10) throw new Error(`Expected >=10 top-level keys, got ${keys.length}: ${keys.join(', ')}`);
  });

  test('9. meeting_url is NOT projected to calendarEventsPublic', () => {
    if (keys.includes('meeting_url')) throw new Error('meeting_url IS projected — privacy leak');
  });

  test('10. No internal/private CalendarEvent fields are projected', () => {
    const leaked = PRIVATE_INTERNAL_FIELDS.filter(f => keys.includes(f));
    if (leaked.length) throw new Error(`Private fields leaked: ${leaked.join(', ')}`);
  });

  test('All expected public-safe fields are present', () => {
    const missing = EXPECTED_PUBLIC_FIELDS.filter(f => !keys.includes(f));
    if (missing.length) throw new Error(`Missing public fields: ${missing.join(', ')}`);
  });

  test('Source comment explicitly documents meeting_url omission', () => {
    if (!/meeting_url is (intentionally )?NOT projected/.test(src)) {
      throw new Error('Missing explicit meeting_url non-projection comment');
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();