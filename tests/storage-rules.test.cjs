/**
 * Storage Security Rules Tests — M4
 * ───────────────────────────────────────────────────────────
 * Tests the 9 required Storage Security Rule cases against the
 * Firebase Emulator Suite using @firebase/rules-unit-testing v3.
 *
 * The storage rules use get() to read Firestore documents
 * (identityMappings, users, mediaAssets), so both Firestore and
 * Storage emulators must be running.
 *
 * Usage:
 *   firebase emulators:exec --only firestore,storage "node tests/storage-rules.test.cjs"
 */

const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'interactive-test';
const STORAGE_RULES = fs.readFileSync(path.join(__dirname, '..', 'storage.rules'), 'utf8');
const FIRESTORE_RULES = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

let testEnv;
const results = [];

function record(name, passed, error) {
  results.push({ name, passed, error });
  const icon = passed ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${name}${error ? ' — ' + error : ''}`);
}

async function test(name, fn) {
  try {
    await fn();
    record(name, true);
  } catch (err) {
    record(name, false, err.message);
  }
}

// ── Firestore data setup ────────────────────────────────────

async function setupFirestoreData(db) {
  // Identity mappings: Firebase Auth UID → Interactive Identity ID
  await db.collection('identityMappings').doc('owner-uid').set({
    identity_id: 'owner-identity',
    auth_uid: 'owner-uid',
    email: 'owner@test.com',
  });
  await db.collection('identityMappings').doc('other-uid').set({
    identity_id: 'other-identity',
    auth_uid: 'other-uid',
    email: 'other@test.com',
  });
  await db.collection('identityMappings').doc('admin-uid').set({
    identity_id: 'admin-identity',
    auth_uid: 'admin-uid',
    email: 'admin@test.com',
  });

  // Users
  await db.collection('users').doc('owner-identity').set({
    email: 'owner@test.com',
    role: 'user',
  });
  await db.collection('users').doc('other-identity').set({
    email: 'other@test.com',
    role: 'user',
  });
  await db.collection('users').doc('admin-identity').set({
    email: 'admin@test.com',
    role: 'admin',
  });

  // Media assets
  await db.collection('mediaAssets').doc('public-media-1').set({
    owner_id: 'owner-identity',
    visibility: 'public',
    lifecycle_state: 'active',
    source_domain: 'personal',
  });
  await db.collection('mediaAssets').doc('private-media-1').set({
    owner_id: 'owner-identity',
    visibility: 'private',
    lifecycle_state: 'active',
    source_domain: 'personal',
  });
  await db.collection('mediaAssets').doc('verification-evidence-1').set({
    owner_id: 'owner-identity',
    visibility: 'private',
    lifecycle_state: 'active',
    source_domain: 'verification',
  });
  await db.collection('mediaAssets').doc('message-attachment-1').set({
    owner_id: 'owner-identity',
    visibility: 'private',
    lifecycle_state: 'active',
    source_domain: 'messaging',
  });
  await db.collection('mediaAssets').doc('archived-media-1').set({
    owner_id: 'owner-identity',
    visibility: 'public',
    lifecycle_state: 'archived',
    source_domain: 'personal',
  });
  await db.collection('mediaAssets').doc('scheduled-deletion-1').set({
    owner_id: 'owner-identity',
    visibility: 'public',
    lifecycle_state: 'scheduled_for_deletion',
    source_domain: 'personal',
  });
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: FIRESTORE_RULES },
    storage: { rules: STORAGE_RULES },
  });

  // Set up Firestore data with security rules disabled
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setupFirestoreData(context.firestore());
  });

  // ── 1. Unauthenticated protected media access denied ──
  await test('Unauthenticated cannot read protected media', async () => {
    const unauthed = testEnv.unauthenticatedContext();
    const storage = unauthed.storage();
    await assertFails(
      storage.ref('media/private-media-1/original').getDownloadURL()
    );
  });

  // ── 2. Owner access allowed ──
  await test('Owner can read their own protected media', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    await assertSucceeds(
      storage.ref('media/private-media-1/original').getDownloadURL()
    );
  });

  await test('Owner can upload to their own media path', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    await assertSucceeds(
      storage.ref('media/private-media-1/original').putString('test')
    );
  });

  // ── 3. Unrelated authenticated user denied protected media ──
  await test('Unrelated authenticated user cannot read protected media', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(
      storage.ref('media/private-media-1/original').getDownloadURL()
    );
  });

  // ── 4. Public media readable where intended ──
  await test('Authenticated user can read public active media', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertSucceeds(
      storage.ref('media/public-media-1/original').getDownloadURL()
    );
  });

  // ── 5. Message attachment inaccessible to non-participant (non-owner) ──
  await test('Non-participant cannot read message attachment', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(
      storage.ref('media/message-attachment-1/original').getDownloadURL()
    );
  });

  // ── 6. Verification evidence inaccessible to normal unrelated users ──
  await test('Unrelated user cannot read verification evidence', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(
      storage.ref('media/verification-evidence-1/original').getDownloadURL()
    );
  });

  // ── 7. Reviewer/admin access works where authorised ──
  await test('Admin can read verification evidence', async () => {
    const admin = testEnv.authenticatedContext('admin-uid');
    const storage = admin.storage();
    await assertSucceeds(
      storage.ref('media/verification-evidence-1/original').getDownloadURL()
    );
  });

  await test('Admin can read any protected media', async () => {
    const admin = testEnv.authenticatedContext('admin-uid');
    const storage = admin.storage();
    await assertSucceeds(
      storage.ref('media/private-media-1/original').getDownloadURL()
    );
  });

  // ── 8. Client cannot overwrite another user's media object ──
  await test('Unrelated user cannot upload to another user media path', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(
      storage.ref('media/private-media-1/original').putString('malicious')
    );
  });

  await test('Unrelated user cannot delete another user media', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(
      storage.ref('media/private-media-1/original').delete()
    );
  });

  // ── 9. Archived/deleted media access follows lifecycle policy ──
  await test('Owner can read archived media', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    await assertSucceeds(
      storage.ref('media/archived-media-1/original').getDownloadURL()
    );
  });

  await test('Unrelated user cannot read archived public media', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(
      storage.ref('media/archived-media-1/original').getDownloadURL()
    );
  });

  await test('Owner cannot delete active media (lifecycle guard)', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    await assertFails(
      storage.ref('media/public-media-1/original').delete()
    );
  });

  await test('Owner can delete scheduled-for-deletion media', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    await assertSucceeds(
      storage.ref('media/scheduled-deletion-1/original').delete()
    );
  });

  // ── Summary ──
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Storage Rules Tests: ${passed} passed, ${failed} failed (${results.length} total)`);
  console.log(`${'='.repeat(60)}`);

  if (failed > 0) {
    process.exit(1);
  }

  await testEnv.cleanup();
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});