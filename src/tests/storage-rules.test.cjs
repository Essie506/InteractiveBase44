/**
 * Storage Security Rules Tests — M4 Access-Limit Correction
 * ───────────────────────────────────────────────────────────
 * Tests dual authorization for protected Media with the
 * restructured rules that stay within Firebase's 2-Firestore-
 * document-access limit per evaluation.
 *
 * Key changes from previous version:
 *   - identityMappings/{uid}.role is denormalized (admin check
 *     uses 0 additional accesses)
 *   - mediaAssets/{mediaId}.authorized_identity_ids is denormalized
 *     for verification evidence (submitter check uses 0 additional
 *     accesses)
 *   - Message attachments are denied for non-owners at the rule
 *     level — participants use the getProtectedMediaUrl Cloud Function
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
  // Identity mappings with denormalized role
  await db.collection('identityMappings').doc('owner-uid').set({
    identity_id: 'owner-identity',
    auth_uid: 'owner-uid',
    email: 'owner@test.com',
    role: 'user',
  });
  await db.collection('identityMappings').doc('participant-uid').set({
    identity_id: 'participant-identity',
    auth_uid: 'participant-uid',
    email: 'participant@test.com',
    role: 'user',
  });
  await db.collection('identityMappings').doc('submitter-uid').set({
    identity_id: 'submitter-identity',
    auth_uid: 'submitter-uid',
    email: 'submitter@test.com',
    role: 'user',
  });
  await db.collection('identityMappings').doc('admin-uid').set({
    identity_id: 'admin-identity',
    auth_uid: 'admin-uid',
    email: 'admin@test.com',
    role: 'admin',  // denormalized admin role
  });
  await db.collection('identityMappings').doc('other-uid').set({
    identity_id: 'other-identity',
    auth_uid: 'other-uid',
    email: 'other@test.com',
    role: 'user',
  });

  // Users (authoritative role source — not read by Storage Rules)
  await db.collection('users').doc('owner-identity').set({ email: 'owner@test.com', role: 'user' });
  await db.collection('users').doc('participant-identity').set({ email: 'participant@test.com', role: 'user' });
  await db.collection('users').doc('submitter-identity').set({ email: 'submitter@test.com', role: 'user' });
  await db.collection('users').doc('admin-identity').set({ email: 'admin@test.com', role: 'admin' });
  await db.collection('users').doc('other-identity').set({ email: 'other@test.com', role: 'user' });

  // Media assets
  await db.collection('mediaAssets').doc('public-media-1').set({
    owner_id: 'owner-identity',
    visibility: 'public',
    lifecycle_state: 'active',
    source_domain: 'personal',
    source_ref_id: null,
    authorized_identity_ids: null,
  });
  await db.collection('mediaAssets').doc('private-media-1').set({
    owner_id: 'owner-identity',
    visibility: 'private',
    lifecycle_state: 'active',
    source_domain: 'personal',
    source_ref_id: null,
    authorized_identity_ids: null,
  });
  // Message attachment — denied for non-owners at rule level
  // (participants use getProtectedMediaUrl Cloud Function)
  await db.collection('mediaAssets').doc('msg-attachment-1').set({
    owner_id: 'owner-identity',
    visibility: 'private',
    lifecycle_state: 'active',
    source_domain: 'messaging',
    source_ref_id: 'conv-1',
    authorized_identity_ids: null,
  });
  // Verification evidence with denormalized authorized_identity_ids
  await db.collection('mediaAssets').doc('verif-evidence-1').set({
    owner_id: 'submitter-identity',
    visibility: 'private',
    lifecycle_state: 'active',
    source_domain: 'verification',
    source_ref_id: 'verif-1',
    authorized_identity_ids: ['submitter-identity'],
  });
  // Verification evidence owned by someone else, with authorized submitter
  await db.collection('mediaAssets').doc('verif-evidence-2').set({
    owner_id: 'owner-identity',
    visibility: 'private',
    lifecycle_state: 'active',
    source_domain: 'verification',
    source_ref_id: 'verif-2',
    authorized_identity_ids: ['submitter-identity'],
  });
  // Verification evidence without authorized_identity_ids — non-owner denied
  await db.collection('mediaAssets').doc('verif-evidence-no-auth').set({
    owner_id: 'owner-identity',
    visibility: 'private',
    lifecycle_state: 'active',
    source_domain: 'verification',
    source_ref_id: 'verif-3',
    authorized_identity_ids: null,
  });
  await db.collection('mediaAssets').doc('archived-media-1').set({
    owner_id: 'owner-identity',
    visibility: 'public',
    lifecycle_state: 'archived',
    source_domain: 'personal',
    source_ref_id: null,
    authorized_identity_ids: null,
  });
  await db.collection('mediaAssets').doc('scheduled-deletion-1').set({
    owner_id: 'owner-identity',
    visibility: 'public',
    lifecycle_state: 'scheduled_for_deletion',
    source_domain: 'personal',
    source_ref_id: null,
    authorized_identity_ids: null,
  });
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: FIRESTORE_RULES },
    storage: { rules: STORAGE_RULES },
  });

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setupFirestoreData(context.firestore());
  });

  // ════════════════════════════════════════════════════════
  // ADMIN READ (via denormalized role — 1 access)
  // ════════════════════════════════════════════════════════

  await test('Admin can read private media (denormalized role)', async () => {
    const admin = testEnv.authenticatedContext('admin-uid');
    const storage = admin.storage();
    await assertSucceeds(storage.ref('media/private-media-1/original').getDownloadURL());
  });

  await test('Admin can read message attachment', async () => {
    const admin = testEnv.authenticatedContext('admin-uid');
    const storage = admin.storage();
    await assertSucceeds(storage.ref('media/msg-attachment-1/original').getDownloadURL());
  });

  await test('Admin can read verification evidence', async () => {
    const admin = testEnv.authenticatedContext('admin-uid');
    const storage = admin.storage();
    await assertSucceeds(storage.ref('media/verif-evidence-1/original').getDownloadURL());
  });

  // ════════════════════════════════════════════════════════
  // OWNER READ (2 accesses: identityMappings + mediaAssets)
  // ════════════════════════════════════════════════════════

  await test('Owner can read their own private media', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    await assertSucceeds(storage.ref('media/private-media-1/original').getDownloadURL());
  });

  await test('Owner can read their own message attachment', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    await assertSucceeds(storage.ref('media/msg-attachment-1/original').getDownloadURL());
  });

  await test('Owner can read archived media', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    await assertSucceeds(storage.ref('media/archived-media-1/original').getDownloadURL());
  });

  // ════════════════════════════════════════════════════════
  // PUBLIC MEDIA READ (1 access: mediaAssets)
  // ════════════════════════════════════════════════════════

  await test('Authenticated user can read public active media', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertSucceeds(storage.ref('media/public-media-1/original').getDownloadURL());
  });

  await test('Non-owner cannot read archived public media', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(storage.ref('media/archived-media-1/original').getDownloadURL());
  });

  // ════════════════════════════════════════════════════════
  // MESSAGE ATTACHMENTS — denied for non-owners at rule level
  // (participants use getProtectedMediaUrl Cloud Function)
  // ════════════════════════════════════════════════════════

  await test('Conversation participant is denied by Storage Rules (uses CF)', async () => {
    const participant = testEnv.authenticatedContext('participant-uid');
    const storage = participant.storage();
    // Denied at rule level — participant uses getProtectedMediaUrl CF
    await assertFails(storage.ref('media/msg-attachment-1/original').getDownloadURL());
  });

  await test('Non-participant cannot read message attachment (known path)', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(storage.ref('media/msg-attachment-1/original').getDownloadURL());
  });

  // ════════════════════════════════════════════════════════
  // VERIFICATION EVIDENCE — denormalized authorized_identity_ids
  // ════════════════════════════════════════════════════════

  await test('Authorized identity can read verification evidence (is owner)', async () => {
    const submitter = testEnv.authenticatedContext('submitter-uid');
    const storage = submitter.storage();
    await assertSucceeds(storage.ref('media/verif-evidence-1/original').getDownloadURL());
  });

  await test('Authorized identity can read verification evidence (non-owner)', async () => {
    const submitter = testEnv.authenticatedContext('submitter-uid');
    const storage = submitter.storage();
    // verif-evidence-2 is owned by owner-identity but authorized_identity_ids
    // includes submitter-identity
    await assertSucceeds(storage.ref('media/verif-evidence-2/original').getDownloadURL());
  });

  await test('Owner can read their own verification evidence', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    // verif-evidence-2 is owned by owner-identity
    await assertSucceeds(storage.ref('media/verif-evidence-2/original').getDownloadURL());
  });

  await test('Unauthorized user cannot read verification evidence', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(storage.ref('media/verif-evidence-1/original').getDownloadURL());
  });

  await test('Verification evidence without authorized_identity_ids denies non-owner', async () => {
    const submitter = testEnv.authenticatedContext('submitter-uid');
    const storage = submitter.storage();
    // verif-evidence-no-auth is owned by owner-identity, no authorized_identity_ids
    await assertFails(storage.ref('media/verif-evidence-no-auth/original').getDownloadURL());
  });

  // ════════════════════════════════════════════════════════
  // UNAUTHENTICATED ACCESS
  // ════════════════════════════════════════════════════════

  await test('Unauthenticated cannot read message attachment', async () => {
    const unauthed = testEnv.unauthenticatedContext();
    const storage = unauthed.storage();
    await assertFails(storage.ref('media/msg-attachment-1/original').getDownloadURL());
  });

  await test('Unauthenticated cannot read verification evidence', async () => {
    const unauthed = testEnv.unauthenticatedContext();
    const storage = unauthed.storage();
    await assertFails(storage.ref('media/verif-evidence-1/original').getDownloadURL());
  });

  await test('Unauthenticated cannot read public media', async () => {
    const unauthed = testEnv.unauthenticatedContext();
    const storage = unauthed.storage();
    await assertFails(storage.ref('media/public-media-1/original').getDownloadURL());
  });

  // ════════════════════════════════════════════════════════
  // NON-PROTECTED PRIVATE MEDIA
  // ════════════════════════════════════════════════════════

  await test('Unrelated user cannot read private media', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(storage.ref('media/private-media-1/original').getDownloadURL());
  });

  // ════════════════════════════════════════════════════════
  // WRITE PROTECTION
  // ════════════════════════════════════════════════════════

  await test('Owner can upload to their own media path', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    await assertSucceeds(storage.ref('media/msg-attachment-1/original').putString('test'));
  });

  await test('Non-owner cannot upload to another user media path', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(storage.ref('media/msg-attachment-1/original').putString('malicious'));
  });

  await test('Non-owner cannot delete another user media', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(storage.ref('media/msg-attachment-1/original').delete());
  });

  // ════════════════════════════════════════════════════════
  // LIFECYCLE GUARDS
  // ════════════════════════════════════════════════════════

  await test('Owner cannot delete active media (lifecycle guard)', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    await assertFails(storage.ref('media/public-media-1/original').delete());
  });

  await test('Owner can delete scheduled-for-deletion media', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    await assertSucceeds(storage.ref('media/scheduled-deletion-1/original').delete());
  });

  await test('Admin can delete scheduled-for-deletion media', async () => {
    const admin = testEnv.authenticatedContext('admin-uid');
    const storage = admin.storage();
    await assertSucceeds(storage.ref('media/scheduled-deletion-1/original').delete());
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