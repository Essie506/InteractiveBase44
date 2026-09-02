// Phase 2 (§36) — Hold expiry sweep.
// ───────────────────────────────────────────────────────────
// Asserts a scheduled Cloud Function releases expired active holds so
// abandoned holds free time deterministically (not only on lazy access).

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

const SW = path.join(__dirname, '..', 'cloud-functions', 'src', 'holdSweep.ts');
const IDX = path.join(__dirname, '..', 'cloud-functions', 'src', 'index.ts');
const FIDX = path.join(__dirname, '..', 'firestore.indexes.json');
const swSrc = fs.readFileSync(SW, 'utf8');
const idxSrc = fs.readFileSync(IDX, 'utf8');
const fidxSrc = fs.readFileSync(FIDX, 'utf8');

test('holdSweep uses onSchedule', () => {
  if (!/from 'firebase-functions\/v2\/scheduler'/.test(swSrc)) throw new Error('must import onSchedule');
  if (!/onSchedule\(/.test(swSrc)) throw new Error('must use onSchedule');
});

test('holdSweep releases expired active holds', () => {
  if (!/where\('status', '==', 'active'\)/.test(swSrc)) throw new Error('must query active holds');
  if (!/expires_at', '<=', now\)/.test(swSrc)) throw new Error('must query expired holds');
  if (!/status: 'expired'/.test(swSrc)) throw new Error('must mark holds expired');
});

test('holdSweep is exported from index.ts', () => {
  if (!/sweepExpiredHolds/.test(idxSrc)) throw new Error('index.ts must export sweepExpiredHolds');
});

test('firestore.indexes.json has slotHolds (status, expires_at) composite index', () => {
  const chunks = fidxSrc.split('"collectionGroup":');
  const slotHoldsChunks = chunks.filter((c) => /^\s*"slotHolds"/.test(c));
  const hasStatusExpires = slotHoldsChunks.some((c) => /"fieldPath":\s*"status"/.test(c) && /"fieldPath":\s*"expires_at"/.test(c));
  if (!hasStatusExpires) throw new Error('missing (status, expires_at) composite index for hold sweep');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);