// Firestore rules — calendarEvents client-write lockdown.
// ───────────────────────────────────────────────────────────
// Asserts that authenticated clients CANNOT directly create, update, or
// delete calendarEvents documents (the canonical saveCalendarEvent Cloud
// Function is the sole authoritative writer), and that the
// calendarEventIdempotency collection is fully client-inaccessible.
// Existing authorised read rules are preserved.
//
// Requires the Firebase Emulator Suite (Java runtime):
//   firebase emulators:exec --only firestore "node tests/calendar-events-rules.test.cjs"

const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'interactive-test';
const RULES_PATH = path.join(__dirname, '..', 'firestore.rules');

let testEnv;
const results = [];

function record(name, passed, error) {
  results.push({ name, passed, error });
  const icon = passed ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${name}${error ? ' — ' + error : ''}`);
}

async function test(name, fn) {
  try { await fn(); record(name, true); }
  catch (err) { record(name, false, err.message); }
}

async function withAdmin(fn) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await fn(context.firestore());
  });
}

async function setupIdentity(db, authUid, identityId) {
  await db.collection('identityMappings').doc(authUid).set({
    identity_id: identityId,
    auth_provider: 'firebase',
  });
}

async function main() {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: fs.readFileSync(RULES_PATH, 'utf8') },
  });

  const authUid = 'uid-owner';
  const identityId = 'id-owner';
  const eventId = 'evt-1';

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setupIdentity(context.firestore(), authUid, identityId);
  });

  const authedDb = testEnv.authenticatedContext(authUid).firestore();

  await test('client cannot directly create a calendarEvents doc', async () => {
    await assertFails(authedDb.collection('calendarEvents').doc(eventId).set({
      owner_id: identityId,
      owner_type: 'identity',
      title: 'Manual',
      created_by_id: identityId,
    }));
  });

  await test('client cannot directly update a calendarEvents doc', async () => {
    // Seed as admin, then attempt a client update.
    await withAdmin(async (adb) => {
      await adb.collection('calendarEvents').doc(eventId).set({
        owner_id: identityId, owner_type: 'identity', title: 'Seeded',
        created_by_id: identityId,
      });
    });
    await assertFails(authedDb.collection('calendarEvents').doc(eventId).update({
      title: 'Tampered',
    }));
  });

  await test('client cannot directly delete a calendarEvents doc', async () => {
    await withAdmin(async (adb) => {
      await adb.collection('calendarEvents').doc(eventId).set({
        owner_id: identityId, owner_type: 'identity', title: 'Seeded',
        created_by_id: identityId,
      });
    });
    await assertFails(authedDb.collection('calendarEvents').doc(eventId).delete());
  });

  await test('owner can still read their own calendarEvents doc (read preserved)', async () => {
    await withAdmin(async (adb) => {
      await adb.collection('calendarEvents').doc(eventId).set({
        owner_id: identityId, owner_type: 'identity', title: 'Seeded',
        created_by_id: identityId,
      });
    });
    await assertSucceeds(authedDb.collection('calendarEvents').doc(eventId).get());
  });

  await test('client cannot read calendarEventIdempotency', async () => {
    await assertFails(authedDb.collection('calendarEventIdempotency').doc('k1').get());
  });

  await test('client cannot write calendarEventIdempotency', async () => {
    await assertFails(authedDb.collection('calendarEventIdempotency').doc('k1').set({
      event_id: 'evt-1',
    }));
  });

  await testEnv.cleanup();

  const failed = results.filter(r => !r.passed).length;
  console.log(`\n${results.length} tests, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});