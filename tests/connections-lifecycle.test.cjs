/**
 * Connections Lifecycle Tests — Relationship System
 * ───────────────────────────────────────────────────────────
 * Pure-node regression tests replicating the authoritative logic from:
 *   - cloud-functions/src/connections.ts  (request/respond/disconnect)
 *   - cloud-functions/src/shared.ts       (connectionPairId, hasAcceptedConnection)
 *
 * Covers:
 *   - create pending request
 *   - cannot connect to self
 *   - duplicate pending request prevented/idempotent
 *   - accept creates canonical active Connection
 *   - decline creates no Connection
 *   - disconnect changes relationship state
 *   - reconnect behaviour is deterministic
 *   - block prevents Connection-based access
 *   - only the target can respond (requester cannot self-accept)
 *   - unrelated identity cannot respond
 *
 * Usage:
 *   node tests/connections-lifecycle.test.cjs
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

function httpErr(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// ═══════════════════════════════════════════════════════════
// REPLICATED LOGIC
// ═══════════════════════════════════════════════════════════

function connectionPairId(a, b) {
  return [a, b].sort().join('__');
}

function createStore() {
  return { connectionRequests: {}, connections: {}, blockRecords: {} };
}

function isBlocked(store, a, b) {
  const ab = store.blockRecords[`${a}__${b}`];
  const ba = store.blockRecords[`${b}__${a}`];
  return (ab && ab.status === 'active') || (ba && ba.status === 'active');
}

function hasAcceptedConnection(store, a, b) {
  if (!a || !b || a === b) return false;
  if (isBlocked(store, a, b)) return false;
  const c = store.connections[connectionPairId(a, b)];
  return !!c && c.status === 'active';
}

// createConnectionRequest — replicated from connections.ts
function createRequest(store, requesterId, targetId, opts = {}) {
  if (!targetId) throw httpErr('invalid-argument', 'target_id is required');
  if (targetId === requesterId) throw httpErr('invalid-argument', 'Cannot connect to yourself');
  if (isBlocked(store, requesterId, targetId)) {
    throw httpErr('permission-denied', 'Cannot request connection — blocking relationship exists');
  }
  const pairId = connectionPairId(requesterId, targetId);
  const existingConn = store.connections[pairId];
  if (existingConn && existingConn.status === 'active') {
    return { status: 'already_connected', connection_id: pairId };
  }
  // idempotent pending (same direction)
  const existingPending = Object.entries(store.connectionRequests)
    .find(([, r]) => r.requester_id === requesterId && r.target_id === targetId && r.status === 'pending');
  if (existingPending) {
    return { status: 'pending', request_id: existingPending[0], already_pending: true };
  }
  const id = `req_${Math.random().toString(36).slice(2)}`;
  store.connectionRequests[id] = {
    requester_id: requesterId,
    target_id: targetId,
    status: 'pending',
    requester_context: opts.requester_context || 'personal',
    requested_at: 'now',
    responded_at: null,
    request_message: opts.request_message || null,
  };
  return { status: 'pending', request_id: id };
}

// respondConnectionRequest — replicated from connections.ts
function respondRequest(store, callerId, requestId, action) {
  const r = store.connectionRequests[requestId];
  if (!r) throw httpErr('not-found', 'Connection request not found');
  if (r.status !== 'pending') throw httpErr('failed-precondition', 'Connection request is not pending');
  if (r.target_id !== callerId) {
    throw httpErr('permission-denied', 'Only the recipient can respond to a connection request');
  }
  if (action === 'accept') {
    r.status = 'accepted';
    r.responded_at = 'now';
    const pairId = connectionPairId(r.requester_id, r.target_id);
    const [a, b] = [r.requester_id, r.target_id].sort();
    const existing = store.connections[pairId];
    store.connections[pairId] = {
      identity_a_id: a,
      identity_b_id: b,
      status: 'active',
      established_at: 'now',
      disconnected_at: null,
      source_request_id: requestId,
      _created_date: existing ? existing._created_date : 'now',
      _updated_date: 'now',
    };
    return { request_id: requestId, status: 'accepted', connection_id: pairId };
  }
  r.status = 'declined';
  r.responded_at = 'now';
  return { request_id: requestId, status: 'declined' };
}

// disconnectConnection — replicated from connections.ts
function disconnect(store, callerId, targetId) {
  const pairId = connectionPairId(callerId, targetId);
  const c = store.connections[pairId];
  if (!c) throw httpErr('not-found', 'Connection not found');
  if (c.identity_a_id !== callerId && c.identity_b_id !== callerId) {
    throw httpErr('permission-denied', 'Only a participant can disconnect a connection');
  }
  if (c.status === 'disconnected') {
    return { connection_id: pairId, status: 'disconnected' };
  }
  c.status = 'disconnected';
  c.disconnected_at = 'now';
  return { connection_id: pairId, status: 'disconnected' };
}

// ═══════════════════════════════════════════════════════════
// 1. CREATE PENDING REQUEST
// ═══════════════════════════════════════════════════════════

test('create pending request: returns status pending with a request_id', () => {
  const store = createStore();
  const res = createRequest(store, 'alice', 'bob');
  assert.strictEqual(res.status, 'pending');
  assert.ok(res.request_id);
  assert.strictEqual(store.connectionRequests[res.request_id].status, 'pending');
  assert.strictEqual(store.connectionRequests[res.request_id].requester_id, 'alice');
  assert.strictEqual(store.connectionRequests[res.request_id].target_id, 'bob');
});

test('create pending request: does NOT create a conversation or connection', () => {
  const store = createStore();
  createRequest(store, 'alice', 'bob');
  assert.strictEqual(Object.keys(store.connections).length, 0);
});

// ═══════════════════════════════════════════════════════════
// 2. CANNOT CONNECT TO SELF
// ═══════════════════════════════════════════════════════════

test('cannot connect to self: throws invalid-argument', () => {
  const store = createStore();
  assert.throws(
    () => createRequest(store, 'alice', 'alice'),
    (err) => err.code === 'invalid-argument' && /Cannot connect to yourself/.test(err.message),
  );
});

// ═══════════════════════════════════════════════════════════
// 3. DUPLICATE PENDING REQUEST PREVENTED / IDEMPOTENT
// ═══════════════════════════════════════════════════════════

test('duplicate pending request is idempotent: returns the existing pending request', () => {
  const store = createStore();
  const first = createRequest(store, 'alice', 'bob');
  const second = createRequest(store, 'alice', 'bob');
  assert.strictEqual(second.status, 'pending');
  assert.strictEqual(second.request_id, first.request_id);
  assert.ok(second.already_pending);
  assert.strictEqual(Object.keys(store.connectionRequests).length, 1);
});

test('already-connected: connect returns already_connected and creates no new request', () => {
  const store = createStore();
  const req = createRequest(store, 'alice', 'bob');
  respondRequest(store, 'bob', req.request_id, 'accept');
  const res = createRequest(store, 'alice', 'bob');
  assert.strictEqual(res.status, 'already_connected');
  assert.ok(res.connection_id);
});

// ═══════════════════════════════════════════════════════════
// 4. ACCEPT CREATES CANONICAL ACTIVE CONNECTION
// ═══════════════════════════════════════════════════════════

test('accept: creates a canonical active connection with deterministic pair ID', () => {
  const store = createStore();
  const req = createRequest(store, 'alice', 'bob');
  const res = respondRequest(store, 'bob', req.request_id, 'accept');
  assert.strictEqual(res.status, 'accepted');
  assert.strictEqual(res.connection_id, connectionPairId('alice', 'bob'));
  const conn = store.connections[res.connection_id];
  assert.strictEqual(conn.status, 'active');
  assert.strictEqual(conn.identity_a_id, 'alice'); // sorted
  assert.strictEqual(conn.identity_b_id, 'bob');
  assert.strictEqual(conn.source_request_id, req.request_id);
});

test('accept: request status becomes accepted', () => {
  const store = createStore();
  const req = createRequest(store, 'alice', 'bob');
  respondRequest(store, 'bob', req.request_id, 'accept');
  assert.strictEqual(store.connectionRequests[req.request_id].status, 'accepted');
});

test('accept: hasAcceptedConnection returns true for both directions', () => {
  const store = createStore();
  const req = createRequest(store, 'alice', 'bob');
  respondRequest(store, 'bob', req.request_id, 'accept');
  assert.strictEqual(hasAcceptedConnection(store, 'alice', 'bob'), true);
  assert.strictEqual(hasAcceptedConnection(store, 'bob', 'alice'), true);
});

test('accept: a reverse Connect while already connected returns already_connected (no duplicate)', () => {
  const store = createStore();
  const req = createRequest(store, 'alice', 'bob');
  respondRequest(store, 'bob', req.request_id, 'accept');
  // Bob presses Connect while already connected — no new request or connection.
  const res = createRequest(store, 'bob', 'alice');
  assert.strictEqual(res.status, 'already_connected');
  assert.strictEqual(Object.keys(store.connections).length, 1);
  assert.ok(store.connections[connectionPairId('alice', 'bob')]);
  // No new pending request was created.
  const pending = Object.values(store.connectionRequests).filter((r) => r.status === 'pending');
  assert.strictEqual(pending.length, 0);
});

// ═══════════════════════════════════════════════════════════
// 5. DECLINE CREATES NO CONNECTION
// ═══════════════════════════════════════════════════════════

test('decline: creates no connection', () => {
  const store = createStore();
  const req = createRequest(store, 'alice', 'bob');
  const res = respondRequest(store, 'bob', req.request_id, 'decline');
  assert.strictEqual(res.status, 'declined');
  assert.strictEqual(Object.keys(store.connections).length, 0);
  assert.strictEqual(store.connectionRequests[req.request_id].status, 'declined');
});

test('decline: hasAcceptedConnection is false', () => {
  const store = createStore();
  const req = createRequest(store, 'alice', 'bob');
  respondRequest(store, 'bob', req.request_id, 'decline');
  assert.strictEqual(hasAcceptedConnection(store, 'alice', 'bob'), false);
});

// ═══════════════════════════════════════════════════════════
// 6. DISCONNECT CHANGES RELATIONSHIP STATE
// ═══════════════════════════════════════════════════════════

test('disconnect: connection status becomes disconnected', () => {
  const store = createStore();
  const req = createRequest(store, 'alice', 'bob');
  respondRequest(store, 'bob', req.request_id, 'accept');
  const res = disconnect(store, 'alice', 'bob');
  assert.strictEqual(res.status, 'disconnected');
  assert.strictEqual(store.connections[connectionPairId('alice', 'bob')].status, 'disconnected');
});

test('disconnect: hasAcceptedConnection becomes false after disconnect', () => {
  const store = createStore();
  const req = createRequest(store, 'alice', 'bob');
  respondRequest(store, 'bob', req.request_id, 'accept');
  disconnect(store, 'bob', 'alice');
  assert.strictEqual(hasAcceptedConnection(store, 'alice', 'bob'), false);
});

test('disconnect: either participant may disconnect', () => {
  const store = createStore();
  const req = createRequest(store, 'alice', 'bob');
  respondRequest(store, 'bob', req.request_id, 'accept');
  const res = disconnect(store, 'bob', 'alice');
  assert.strictEqual(res.status, 'disconnected');
});

test('disconnect: unrelated identity cannot disconnect another pair\'s connection', () => {
  const store = createStore();
  const req = createRequest(store, 'alice', 'bob');
  respondRequest(store, 'bob', req.request_id, 'accept');
  // Carol can only produce a pairId that includes herself (carol__bob),
  // which is not the alice__bob connection — so the attempt is denied
  // (not-found: no such connection for carol's pair).
  assert.throws(
    () => disconnect(store, 'carol', 'bob'),
    (err) => err.code === 'not-found' || err.code === 'permission-denied',
  );
  // The alice-bob connection is unaffected.
  assert.strictEqual(store.connections[connectionPairId('alice', 'bob')].status, 'active');
});

test('disconnect: is idempotent', () => {
  const store = createStore();
  const req = createRequest(store, 'alice', 'bob');
  respondRequest(store, 'bob', req.request_id, 'accept');
  disconnect(store, 'alice', 'bob');
  const res = disconnect(store, 'alice', 'bob');
  assert.strictEqual(res.status, 'disconnected');
});

// ═══════════════════════════════════════════════════════════
// 7. RECONNECT BEHAVIOUR IS DETERMINISTIC
// ═══════════════════════════════════════════════════════════

test('reconnect: after disconnect, a new accepted request reactivates the canonical connection', () => {
  const store = createStore();
  const req1 = createRequest(store, 'alice', 'bob');
  respondRequest(store, 'bob', req1.request_id, 'accept');
  disconnect(store, 'alice', 'bob');
  assert.strictEqual(hasAcceptedConnection(store, 'alice', 'bob'), false);
  const req2 = createRequest(store, 'bob', 'alice');
  respondRequest(store, 'alice', req2.request_id, 'accept');
  assert.strictEqual(hasAcceptedConnection(store, 'alice', 'bob'), true);
  // still only one canonical connection doc
  assert.strictEqual(Object.keys(store.connections).length, 1);
  assert.strictEqual(store.connections[connectionPairId('alice', 'bob')].status, 'active');
});

// ═══════════════════════════════════════════════════════════
// 8. BLOCK PREVENTS CONNECTION-BASED ACCESS
// ═══════════════════════════════════════════════════════════

test('block: a block prevents creating a connection request', () => {
  const store = createStore();
  store.blockRecords['alice__bob'] = { status: 'active' };
  assert.throws(
    () => createRequest(store, 'alice', 'bob'),
    (err) => err.code === 'permission-denied',
  );
});

test('block: an active block overrides an existing connection for access', () => {
  const store = createStore();
  const req = createRequest(store, 'alice', 'bob');
  respondRequest(store, 'bob', req.request_id, 'accept');
  assert.strictEqual(hasAcceptedConnection(store, 'alice', 'bob'), true);
  store.blockRecords['bob__alice'] = { status: 'active' };
  assert.strictEqual(hasAcceptedConnection(store, 'alice', 'bob'), false);
});

test('block: block in either direction overrides connection access', () => {
  const store = createStore();
  const req = createRequest(store, 'alice', 'bob');
  respondRequest(store, 'bob', req.request_id, 'accept');
  store.blockRecords['alice__bob'] = { status: 'active' };
  assert.strictEqual(hasAcceptedConnection(store, 'bob', 'alice'), false);
});

// ═══════════════════════════════════════════════════════════
// 9. ONLY THE TARGET CAN RESPOND (SECURITY)
// ═══════════════════════════════════════════════════════════

test('security: requester cannot self-accept their own request', () => {
  const store = createStore();
  const req = createRequest(store, 'alice', 'bob');
  assert.throws(
    () => respondRequest(store, 'alice', req.request_id, 'accept'),
    (err) => err.code === 'permission-denied',
  );
  assert.strictEqual(Object.keys(store.connections).length, 0);
});

test('security: unrelated identity cannot accept/decline a request', () => {
  const store = createStore();
  const req = createRequest(store, 'alice', 'bob');
  assert.throws(
    () => respondRequest(store, 'carol', req.request_id, 'accept'),
    (err) => err.code === 'permission-denied',
  );
  assert.throws(
    () => respondRequest(store, 'carol', req.request_id, 'decline'),
    (err) => err.code === 'permission-denied',
  );
});

test('security: cannot respond to a non-pending request', () => {
  const store = createStore();
  const req = createRequest(store, 'alice', 'bob');
  respondRequest(store, 'bob', req.request_id, 'decline');
  assert.throws(
    () => respondRequest(store, 'bob', req.request_id, 'accept'),
    (err) => err.code === 'failed-precondition',
  );
});

// ═══════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);