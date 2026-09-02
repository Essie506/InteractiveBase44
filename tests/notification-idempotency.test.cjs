// Notification idempotency — pure regression tests.
// ───────────────────────────────────────────────────────────
// Mirrors cloud-functions/src/notifications/idempotency.ts and asserts
// the deterministic identity properties that make retries idempotent:
// same inputs → same doc id (overwrite, not duplicate); differing inputs
// → distinct ids. Also static-analysis confirms the source uses set() on
// deterministic paths (not randomUUID) for dispatcher-created notifications.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

function stableHash(input) {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 32);
}

function notificationDocId(id) {
  const recipient = id.recipientId ? id.recipientId : `guest:${id.recipientEmail || ''}`;
  const key = [recipient, id.sourceSystem, id.eventType, id.sourceId, id.version].join('|');
  return `notif:${stableHash(key)}`;
}
function deliveryDocIdForIdentity(notificationId, channel) {
  return `dlv:${stableHash([notificationId, channel].join('|'))}`;
}
function deliveryDocIdForGuest(identity, channel) {
  const guestKey = [
    `guest:${identity.recipientEmail || ''}`, identity.sourceSystem, identity.eventType,
    identity.sourceId, identity.version, channel,
  ].join('|');
  return `dlv:${stableHash(guestKey)}`;
}

// ── Source contract ──
test('idempotency module uses deterministic set() (no randomUUID for new notifications)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'cloud-functions', 'src', 'notifications', 'idempotency.ts'), 'utf8');
  if (!/export function notificationDocId/.test(src)) throw new Error('notificationDocId not exported');
  if (!/export function deliveryDocIdForIdentity/.test(src)) throw new Error('deliveryDocIdForIdentity not exported');
  if (!/export function deliveryDocIdForGuest/.test(src)) throw new Error('deliveryDocIdForGuest not exported');
  if (/randomUUID/.test(src)) throw new Error('idempotency must not use randomUUID');
});
test('dispatcher uses set() with merge on deterministic paths', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'cloud-functions', 'src', 'notifications', 'dispatcher.ts'), 'utf8');
  if (!/notificationDocId/.test(src)) throw new Error('dispatcher must use notificationDocId');
  if (!/deliveryDocIdForIdentity/.test(src)) throw new Error('dispatcher must use deliveryDocIdForIdentity');
  if (!/deliveryDocIdForGuest/.test(src)) throw new Error('dispatcher must use deliveryDocIdForGuest');
  if (!/\.set\([^)]+,\s*\{\s*merge:\s*true\s*\}\)/.test(src)) throw new Error('dispatcher must set() with merge:true');
});

// ── Identity contract ──
test('same logical notification produces the same id across retries', () => {
  const a = notificationDocId({ recipientId: 'id1', recipientEmail: null, sourceSystem: 'calendar', eventType: 'calendar_event_invited', sourceId: 'cal_invite:e1:id1', version: '1' });
  const b = notificationDocId({ recipientId: 'id1', recipientEmail: null, sourceSystem: 'calendar', eventType: 'calendar_event_invited', sourceId: 'cal_invite:e1:id1', version: '1' });
  if (a !== b) throw new Error(`ids differ: ${a} vs ${b}`);
});
test('different recipient produces a different notification id', () => {
  const a = notificationDocId({ recipientId: 'id1', recipientEmail: null, sourceSystem: 'calendar', eventType: 'calendar_event_invited', sourceId: 'cal_invite:e1:id1', version: '1' });
  const b = notificationDocId({ recipientId: 'id2', recipientEmail: null, sourceSystem: 'calendar', eventType: 'calendar_event_invited', sourceId: 'cal_invite:e1:id2', version: '1' });
  if (a === b) throw new Error('different recipients must not collide');
});
test('different event_type produces a different notification id', () => {
  const a = notificationDocId({ recipientId: 'id1', recipientEmail: null, sourceSystem: 'calendar', eventType: 'calendar_event_invited', sourceId: 'cal_invite:e1:id1', version: '1' });
  const b = notificationDocId({ recipientId: 'id1', recipientEmail: null, sourceSystem: 'calendar', eventType: 'calendar_event_cancelled', sourceId: 'cal_cancel:e1:id1', version: '1' });
  if (a === b) throw new Error('different event types must not collide');
});
test('different version (genuinely different edit) produces a different notification id', () => {
  const a = notificationDocId({ recipientId: 'id1', recipientEmail: null, sourceSystem: 'calendar', eventType: 'calendar_event_updated', sourceId: 'cal_update:e1:id1', version: 'v1' });
  const b = notificationDocId({ recipientId: 'id1', recipientEmail: null, sourceSystem: 'calendar', eventType: 'calendar_event_updated', sourceId: 'cal_update:e1:id1', version: 'v2' });
  if (a === b) throw new Error('different versions must not collide');
});

// ── Delivery contract ──
test('identity delivery id = notification id + channel', () => {
  const nid = 'notif:abc';
  const email = deliveryDocIdForIdentity(nid, 'email');
  const push = deliveryDocIdForIdentity(nid, 'push');
  if (email === push) throw new Error('different channels must produce different delivery ids');
});
test('identity vs guest delivery ids do not collide', () => {
  const nid = 'notif:abc';
  const identityEmail = deliveryDocIdForIdentity(nid, 'email');
  const guestEmail = deliveryDocIdForGuest({ recipientId: null, recipientEmail: 'g@x.com', sourceSystem: 'calendar', eventType: 'calendar_event_invited', sourceId: 'cal_invite:e1:guest:g@x.com', version: '1' }, 'email');
  if (identityEmail === guestEmail) throw new Error('identity and guest deliveries must not collide');
});
test('same guest retry produces the same delivery id', () => {
  const id = { recipientId: null, recipientEmail: 'g@x.com', sourceSystem: 'calendar', eventType: 'calendar_event_invited', sourceId: 'cal_invite:e1:guest:g@x.com', version: '1' };
  if (deliveryDocIdForGuest(id, 'email') !== deliveryDocIdForGuest(id, 'email')) throw new Error('guest delivery id must be stable');
});
test('doc ids are valid Firestore ids (no slashes)', () => {
  const nid = notificationDocId({ recipientId: 'id/1', recipientEmail: null, sourceSystem: 'calendar', eventType: 'calendar_event_invited', sourceId: 'cal_invite:e/v:id', version: '1' });
  if (nid.includes('/')) throw new Error('notification id must not contain slashes');
  const did = deliveryDocIdForIdentity(nid, 'email');
  if (did.includes('/')) throw new Error('delivery id must not contain slashes');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);