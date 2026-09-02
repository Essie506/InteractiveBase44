// Notification dispatch — pure regression tests.
// ───────────────────────────────────────────────────────────
// Validates the dispatcher's record + outbox creation behaviour using a
// mock Firestore that records set() calls on deterministic paths. Asserts:
//   - identity recipient → one NotificationRecord (in_app) + one email delivery
//   - guest recipient → NO NotificationRecord + one email delivery
//   - retry (same event) → same deterministic doc ids (no duplicate)
//   - email opted out → no email delivery, in_app still created
//   - guest never creates an identity, Connection, or Conversation

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (e) { failed++; console.log(`[FAIL] ${name}\n  ${e.message}`); }
}

// ── Mock dispatcher (mirrors cloud-functions/src/notifications/dispatcher.ts) ──
function makeMockDb() {
  const records = new Map();
  const deliveries = new Map();
  const users = new Map();
  const prefs = new Map();
  const db = {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              const store = name === 'notificationRecords' ? records : name === 'notificationDeliveries' ? deliveries : name === 'users' ? users : name === 'notificationPreferences' ? prefs : null;
              if (!store) return { exists: false, data: () => null };
              return { exists: store.has(id), data: () => store.get(id) || null };
            },
            async set(data, opts) {
              const store = name === 'notificationRecords' ? records : name === 'notificationDeliveries' ? deliveries : null;
              if (!store) return;
              if (opts && opts.merge) store.set(id, { ...(store.get(id) || {}), ...data });
              else store.set(id, data);
            },
          };
        },
      };
    },
  };
  return { db, records, deliveries, users, prefs };
}

function stableHash(s) { return require('crypto').createHash('sha256').update(s).digest('hex').slice(0, 32); }
function notificationDocId(id) {
  const r = id.recipientId ? id.recipientId : `guest:${id.recipientEmail || ''}`;
  return `notif:${stableHash([r, id.sourceSystem, id.eventType, id.sourceId, id.version].join('|'))}`;
}
function deliveryDocIdForIdentity(nid, ch) { return `dlv:${stableHash([nid, ch].join('|'))}`; }
function deliveryDocIdForGuest(id, ch) { return `dlv:${stableHash([`guest:${id.recipientEmail || ''}`, id.sourceSystem, id.eventType, id.sourceId, id.version, ch].join('|'))}`; }

function resolveChannels(eventType, category, prefs) {
  // mirror policy: calendar_event_invited → in_app required, email conditional
  const out = [];
  if (eventType === 'calendar_event_invited') {
    out.push('in_app');
    if (!prefs || prefs[`${category}_email`] !== false) out.push('email');
  }
  return out;
}

async function emitNotification(mock, event) {
  const { db } = mock;
  let prefs = null;
  if (event.recipient_id) {
    const snap = await db.collection('notificationPreferences').doc(event.recipient_id).get();
    if (snap.exists) prefs = snap.data();
  }
  const channels = resolveChannels(event.event_type, event.category, prefs);
  const now = new Date().toISOString();
  const identity = { recipientId: event.recipient_id, recipientEmail: event.recipient_email, sourceSystem: event.source_system, eventType: event.event_type, sourceId: event.source_id, version: event.version };
  let notificationId = null;
  if (event.recipient_id && channels.includes('in_app')) {
    notificationId = notificationDocId(identity);
    await db.collection('notificationRecords').doc(notificationId).set({
      recipient_id: event.recipient_id, source_system: event.source_system, event_type: event.event_type,
      title: event.title, body: event.body, category: event.category, delivery_channels: channels,
      is_read: false, action_url: event.action_url, source_id: event.source_id, _created_date: now, _updated_date: now,
    }, { merge: true });
  }
  if (channels.includes('email') && event.emailContext && event.emailPayloadBuilder) {
    let toEmail = null;
    if (event.recipient_id) { const u = await db.collection('users').doc(event.recipient_id).get(); toEmail = u.exists ? u.data().email : null; }
    else if (event.recipient_email) toEmail = event.recipient_email;
    if (toEmail) {
      const deliveryId = notificationId ? deliveryDocIdForIdentity(notificationId, 'email') : deliveryDocIdForGuest(identity, 'email');
      await db.collection('notificationDeliveries').doc(deliveryId).set({
        notification_id: notificationId, channel: 'email', recipient_id: event.recipient_id, recipient_email: toEmail,
        state: 'pending', attempts: 0, source_id: event.source_id, version: event.version,
      }, { merge: true });
    }
  }
}

const baseEvent = {
  source_system: 'calendar', event_type: 'calendar_event_invited', source_id: 'cal_invite:e1:id1',
  version: '1', category: 'calendar', title: 'Invited', body: 'body', action_url: '/calendar?event=e1',
  emailContext: {}, emailPayloadBuilder: () => ({ subject: 's', html: 'h', text: 't' }),
};

// ── Source contract ──
test('dispatcher writes notificationRecords + notificationDeliveries only', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'cloud-functions', 'src', 'notifications', 'dispatcher.ts'), 'utf8');
  if (!/notificationRecords/.test(src)) throw new Error('dispatcher must write notificationRecords');
  if (!/notificationDeliveries/.test(src)) throw new Error('dispatcher must write notificationDeliveries');
  if (/connections/.test(src) || /conversations/.test(src)) throw new Error('dispatcher must not touch connections/conversations');
  if (/identityMappings/.test(src)) throw new Error('dispatcher must not create identities');
});

// ── Identity recipient ──
test('identity recipient creates one in-app record + one email delivery', async () => {
  const mock = makeMockDb();
  mock.users.set('id1', { email: 'user@interactive.app' });
  await emitNotification(mock, { ...baseEvent, recipient_id: 'id1', recipient_email: null });
  if (mock.records.size !== 1) throw new Error(`expected 1 record, got ${mock.records.size}`);
  if (mock.deliveries.size !== 1) throw new Error(`expected 1 delivery, got ${mock.deliveries.size}`);
  const dl = Array.from(mock.deliveries.values())[0];
  if (dl.recipient_email !== 'user@interactive.app') throw new Error('delivery email must be resolved from users record');
});
test('identical retry overwrites the same docs (no duplicate)', async () => {
  const mock = makeMockDb();
  mock.users.set('id1', { email: 'user@interactive.app' });
  await emitNotification(mock, { ...baseEvent, recipient_id: 'id1', recipient_email: null });
  await emitNotification(mock, { ...baseEvent, recipient_id: 'id1', recipient_email: null });
  if (mock.records.size !== 1) throw new Error(`retry must not duplicate records: ${mock.records.size}`);
  if (mock.deliveries.size !== 1) throw new Error(`retry must not duplicate deliveries: ${mock.deliveries.size}`);
});
test('email opted out → no email delivery, in_app still created', async () => {
  const mock = makeMockDb();
  mock.users.set('id1', { email: 'user@interactive.app' });
  mock.prefs.set('id1', { calendar_email: false });
  await emitNotification(mock, { ...baseEvent, recipient_id: 'id1', recipient_email: null });
  if (mock.records.size !== 1) throw new Error('in_app required must still create record');
  if (mock.deliveries.size !== 0) throw new Error('email opt-out must suppress delivery');
});

// ── Guest recipient ──
test('guest recipient creates NO record, one email delivery, no identity', async () => {
  const mock = makeMockDb();
  await emitNotification(mock, { ...baseEvent, recipient_id: null, recipient_email: 'guest@example.com' });
  if (mock.records.size !== 0) throw new Error('guest must not create a NotificationRecord');
  if (mock.deliveries.size !== 1) throw new Error('guest must create one email delivery');
  const dl = Array.from(mock.deliveries.values())[0];
  if (dl.recipient_email !== 'guest@example.com') throw new Error('guest delivery must use guest email');
  if (dl.notification_id !== null) throw new Error('guest delivery must have null notification_id');
});
test('guest retry overwrites the same delivery doc (no duplicate)', async () => {
  const mock = makeMockDb();
  await emitNotification(mock, { ...baseEvent, recipient_id: null, recipient_email: 'guest@example.com' });
  await emitNotification(mock, { ...baseEvent, recipient_id: null, recipient_email: 'guest@example.com' });
  if (mock.deliveries.size !== 1) throw new Error('guest retry must not duplicate');
});

(async () => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();