/**
 * Connection Status Resolver Tests — Relationship System
 * ───────────────────────────────────────────────────────────
 * Pure-node regression tests replicating the authoritative logic from:
 *   - cloud-functions/src/connections.ts (resolveConnectionStatus,
 *     resolveConnectionStatuses, computeStatusMap)
 *
 * Covers the semantic relationship states used by Connect/Pending/
 * Connected UI:
 *   self | blocked | connected | pending_outgoing | pending_incoming
 *   | disconnected | none
 *
 * An active block in either direction overrides every other state and
 * returns 'blocked'.
 *
 * Usage: node tests/connection-status.test.cjs
 */

const assert = require('assert');

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, passed: true });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    results.push({ name, passed: false, error: err.message });
    console.log(`[FAIL] ${name} — ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════
// REPLICATED LOGIC — computeStatusMap
// ═══════════════════════════════════════════════════════════

function connectionPairId(a, b) {
  return [a, b].sort().join('__');
}

function createStore() {
  return {
    connectionRequests: {},
    connections: {},
    blockRecords: {},
  };
}

// Simulates the batched Firestore queries + in-memory resolution from
// connections.ts computeStatusMap. Single-field queries are simulated by
// scanning the in-memory store; status filtering is done in memory (no
// composite indexes required).
function computeStatusMap(store, callerId, targetIds) {
  const outgoingPending = new Set(
    Object.values(store.connectionRequests)
      .filter((r) => r.requester_id === callerId && r.status === 'pending')
      .map((r) => r.target_id)
  );
  const incomingPending = new Set(
    Object.values(store.connectionRequests)
      .filter((r) => r.target_id === callerId && r.status === 'pending')
      .map((r) => r.requester_id)
  );
  const connStatus = new Map();
  for (const c of Object.values(store.connections)) {
    if (c.identity_a_id === callerId) connStatus.set(c.identity_b_id, c.status);
    if (c.identity_b_id === callerId) connStatus.set(c.identity_a_id, c.status);
  }
  const blockedByCaller = new Set(
    Object.values(store.blockRecords)
      .filter((b) => b.blocker_id === callerId && b.status === 'active')
      .map((b) => b.blocked_id)
  );
  const blockedCaller = new Set(
    Object.values(store.blockRecords)
      .filter((b) => b.blocked_id === callerId && b.status === 'active')
      .map((b) => b.blocker_id)
  );

  const out = {};
  for (const tid of targetIds) {
    if (tid === callerId) { out[tid] = 'self'; continue; }
    if (blockedByCaller.has(tid) || blockedCaller.has(tid)) { out[tid] = 'blocked'; continue; }
    const cs = connStatus.get(tid);
    if (cs === 'active') { out[tid] = 'connected'; continue; }
    if (outgoingPending.has(tid)) { out[tid] = 'pending_outgoing'; continue; }
    if (incomingPending.has(tid)) { out[tid] = 'pending_incoming'; continue; }
    if (cs === 'disconnected') { out[tid] = 'disconnected'; continue; }
    out[tid] = 'none';
  }
  return out;
}

function resolveStatus(store, callerId, targetId) {
  return computeStatusMap(store, callerId, [targetId])[targetId];
}

// ── helpers to seed state ──

function addRequest(store, requesterId, targetId, status = 'pending') {
  const id = `req_${requesterId}_${targetId}`;
  store.connectionRequests[id] = { requester_id: requesterId, target_id: targetId, status };
  return id;
}

function addConnection(store, a, b, status = 'active') {
  store.connections[connectionPairId(a, b)] = {
    identity_a_id: [a, b].sort()[0],
    identity_b_id: [a, b].sort()[1],
    status,
  };
}

function addBlock(store, blockerId, blockedId) {
  store.blockRecords[`${blockerId}__${blockedId}`] = { blocker_id: blockerId, blocked_id: blockedId, status: 'active' };
}

// ═══════════════════════════════════════════════════════════
// NONE
// ═══════════════════════════════════════════════════════════

test('none: no relationship returns none', () => {
  const store = createStore();
  assert.strictEqual(resolveStatus(store, 'alice', 'bob'), 'none');
});

// ═══════════════════════════════════════════════════════════
// SELF
// ═══════════════════════════════════════════════════════════

test('self: viewing own identity returns self', () => {
  const store = createStore();
  assert.strictEqual(resolveStatus(store, 'alice', 'alice'), 'self');
});

// ═══════════════════════════════════════════════════════════
// PENDING OUTGOING / INCOMING
// ═══════════════════════════════════════════════════════════

test('pending_outgoing: caller sent a pending request to target', () => {
  const store = createStore();
  addRequest(store, 'alice', 'bob');
  assert.strictEqual(resolveStatus(store, 'alice', 'bob'), 'pending_outgoing');
});

test('pending_incoming: target sent a pending request to caller', () => {
  const store = createStore();
  addRequest(store, 'bob', 'alice');
  assert.strictEqual(resolveStatus(store, 'alice', 'bob'), 'pending_incoming');
});

test('pending: a declined request is not pending', () => {
  const store = createStore();
  addRequest(store, 'alice', 'bob', 'declined');
  assert.strictEqual(resolveStatus(store, 'alice', 'bob'), 'none');
});

// ═══════════════════════════════════════════════════════════
// CONNECTED
// ═══════════════════════════════════════════════════════════

test('connected: an active connection returns connected (both directions)', () => {
  const store = createStore();
  addConnection(store, 'alice', 'bob');
  assert.strictEqual(resolveStatus(store, 'alice', 'bob'), 'connected');
  assert.strictEqual(resolveStatus(store, 'bob', 'alice'), 'connected');
});

// ═══════════════════════════════════════════════════════════
// DISCONNECTED
// ═══════════════════════════════════════════════════════════

test('disconnected: a disconnected connection returns disconnected (no pending)', () => {
  const store = createStore();
  addConnection(store, 'alice', 'bob', 'disconnected');
  assert.strictEqual(resolveStatus(store, 'alice', 'bob'), 'disconnected');
});

test('disconnected with a new pending outgoing request returns pending_outgoing', () => {
  const store = createStore();
  addConnection(store, 'alice', 'bob', 'disconnected');
  addRequest(store, 'alice', 'bob');
  assert.strictEqual(resolveStatus(store, 'alice', 'bob'), 'pending_outgoing');
});

// ═══════════════════════════════════════════════════════════
// BLOCKED (overrides everything)
// ═══════════════════════════════════════════════════════════

test('blocked: caller blocked target → blocked', () => {
  const store = createStore();
  addBlock(store, 'alice', 'bob');
  assert.strictEqual(resolveStatus(store, 'alice', 'bob'), 'blocked');
});

test('blocked: target blocked caller → blocked', () => {
  const store = createStore();
  addBlock(store, 'bob', 'alice');
  assert.strictEqual(resolveStatus(store, 'alice', 'bob'), 'blocked');
});

test('blocked: block overrides an active connection', () => {
  const store = createStore();
  addConnection(store, 'alice', 'bob');
  addBlock(store, 'alice', 'bob');
  assert.strictEqual(resolveStatus(store, 'alice', 'bob'), 'blocked');
});

test('blocked: block overrides a pending request', () => {
  const store = createStore();
  addRequest(store, 'alice', 'bob');
  addBlock(store, 'bob', 'alice');
  assert.strictEqual(resolveStatus(store, 'alice', 'bob'), 'blocked');
});

// ═══════════════════════════════════════════════════════════
// BATCH
// ═══════════════════════════════════════════════════════════

test('batch: resolves multiple targets in one call', () => {
  const store = createStore();
  addConnection(store, 'alice', 'bob');
  addRequest(store, 'alice', 'carol');
  addRequest(store, 'dave', 'alice');
  addBlock(store, 'alice', 'eve');
  const map = computeStatusMap(store, 'alice', ['bob', 'carol', 'dave', 'eve', 'frank', 'alice']);
  assert.strictEqual(map.bob, 'connected');
  assert.strictEqual(map.carol, 'pending_outgoing');
  assert.strictEqual(map.dave, 'pending_incoming');
  assert.strictEqual(map.eve, 'blocked');
  assert.strictEqual(map.frank, 'none');
  assert.strictEqual(map.alice, 'self');
});

test('batch: empty target_ids returns empty map', () => {
  const store = createStore();
  assert.deepStrictEqual(computeStatusMap(store, 'alice', []), {});
});

// ═══════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);