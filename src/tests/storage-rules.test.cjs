/**
 * Storage Security Rules Tests — M4 Security Correction
 * ───────────────────────────────────────────────────────────
 * Tests dual authorization for protected Media:
 *   - Message attachments: conversation participant check at rule level
 *   - Verification evidence: submitter/admin check at rule level
 *
 * The storage rules use get() to read Firestore documents
 * (identityMappings, users, mediaAssets, conversations,
 * verificationRequests), so both Firestore and Storage emulators
 * must be running.
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
  await db.collection('identityMappings').doc('participant-uid').set({
    identity_id: 'participant-identity',
    auth_uid: 'participant-uid',
    email: 'participant@test.com',
  });
  await db.collection('identityMappings').doc('submitter-uid').set({
    identity_id: 'submitter-identity',
    auth_uid: 'submitter-uid',
    email: 'submitter@test.com',
  });
  await db.collection('identityMappings').doc('admin-uid').set({
    identity_id: 'admin-identity',
    auth_uid: 'admin-uid',
    email: 'admin@test.com',
  });
  await db.collection('identityMappings').doc('other-uid').set({
    identity_id: 'other-identity',
    auth_uid: 'other-uid',
    email: 'other@test.com',
  });

  // Users
  await db.collection('users').doc('owner-identity').set({ email: 'owner@test.com', role: 'user' });
  await db.collection('users').doc('participant-identity').set({ email: 'participant@test.com', role: 'user' });
  await db.collection('users').doc('submitter-identity').set({ email: 'submitter@test.com', role: 'user' });
  await db.collection('users').doc('admin-identity').set({ email: 'admin@test.com', role: 'admin' });
  await db.collection('users').doc('other-identity').set({ email: 'other@test.com', role: 'user' });

  // Conversations
  await db.collection('conversations').doc('conv-1').set({
    participant_ids: ['owner-identity', 'participant-identity'],
    status: 'active',
    conversation_type: 'direct',
    initiated_by_id: 'owner-identity',
  });
  await db.collection('conversations').doc('conv-archived').set({
    participant_ids: ['owner-identity', 'participant-identity'],
    status: 'archived',
    conversation_type: 'direct',
    initiated_by_id: 'owner-identity',
  });

  // Verification requests
  await db.collection('verificationRequests').doc('verif-1').set({
    target_type: 'professional',
    target_id: 'submitter-identity',
    verification_type: 'identity',
    status: 'pending_review',
    submitted_by_id: 'submitter-identity',
    evidence_media_ids: ['verif-evidence-1'],
  });

  // Media assets
  await db.collection('mediaAssets').doc('public-media-1').set({
    owner_id: 'owner-identity',
    visibility: 'public',
    lifecycle_state: 'active',
    source_domain: 'personal',
    source_ref_id: null,
  });
  await db.collection('mediaAssets').doc('private-media-1').set({
    owner_id: 'owner-identity',
    visibility: 'private',
    lifecycle_state: 'active',
    source_domain: 'personal',
    source_ref_id: null,
  });
  // Message attachment linked to conv-1
  await db.collection('mediaAssets').doc('msg-attachment-1').set({
    owner_id: 'owner-identity',
    visibility: 'private',
    lifecycle_state: 'active',
    source_domain: 'messaging',
    source_ref_id: 'conv-1',
  });
  // Message attachment linked to an archived conversation
  await db.collection('mediaAssets').doc('msg-attachment-archived').set({
    owner_id: 'owner-identity',
    visibility: 'private',
    lifecycle_state: 'active',
    source_domain: 'messaging',
    source_ref_id: 'conv-archived',
  });
  // Message attachment with no source_ref_id (unlinked — should deny non-owner)
  await db.collection('mediaAssets').doc('msg-no-ref-1').set({
    owner_id: 'owner-identity',
    visibility: 'private',
    lifecycle_state: 'active',
    source_domain: 'messaging',
    source_ref_id: null,
  });
  // Verification evidence linked to verif-1
  await db.collection('mediaAssets').doc('verif-evidence-1').set({
    owner_id: 'submitter-identity',
    visibility: 'private',
    lifecycle_state: 'active',
    source_domain: 'verification',
    source_ref_id: 'verif-1',
  });
  // Verification evidence with no source_ref_id (unlinked — should deny non-owner)
  await db.collection('mediaAssets').doc('verif-evidence-no-ref').set({
    owner_id: 'submitter-identity',
    visibility: 'private',
    lifecycle_state: 'active',
    source_domain: 'verification',
    source_ref_id: null,
  });
  await db.collection('mediaAssets').doc('archived-media-1').set({
    owner_id: 'owner-identity',
    visibility: 'public',
    lifecycle_state: 'archived',
    source_domain: 'personal',
    source_ref_id: null,
  });
  await db.collection('mediaAssets').doc('scheduled-deletion-1').set({
    owner_id: 'owner-identity',
    visibility: 'public',
    lifecycle_state: 'scheduled_for_deletion',
    source_domain: 'personal',
    source_ref_id: null,
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

  // ════════════════════════════════════════════════════════
  // MESSAGE ATTACHMENTS — conversation participant authorization
  // ════════════════════════════════════════════════════════

  // 1. Owner can read their own message attachment
  await test('Owner can read their own message attachment', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    await assertSucceeds(storage.ref('media/msg-attachment-1/original').getDownloadURL());
  });

  // 2. Conversation participant can read message attachment
  await test('Conversation participant can read message attachment', async () => {
    const participant = testEnv.authenticatedContext('participant-uid');
    const storage = participant.storage();
    await assertSucceeds(storage.ref('media/msg-attachment-1/original').getDownloadURL());
  });

  // 3. Non-participant cannot read message attachment even with known Media ID/path
  await test('Non-participant cannot read message attachment (known path)', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(storage.ref('media/msg-attachment-1/original').getDownloadURL());
  });

  // 4. Participant cannot read attachment from archived conversation
  await test('Participant cannot read attachment from archived conversation', async () => {
    const participant = testEnv.authenticatedContext('participant-uid');
    const storage = participant.storage();
    await assertFails(storage.ref('media/msg-attachment-archived/original').getDownloadURL());
  });

  // 5. Owner can still read attachment from archived conversation
  await test('Owner can read attachment from archived conversation', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    await assertSucceeds(storage.ref('media/msg-attachment-archived/original').getDownloadURL());
  });

  // 6. Message attachment without source_ref_id: non-owner denied
  await test('Message attachment without source_ref_id denies non-owner', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(storage.ref('media/msg-no-ref-1/original').getDownloadURL());
  });

  // 7. Message attachment without source_ref_id: owner still allowed
  await test('Message attachment without source_ref_id allows owner', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    await assertSucceeds(storage.ref('media/msg-no-ref-1/original').getDownloadURL());
  });

  // 8. Admin can read any message attachment
  await test('Admin can read message attachment', async () => {
    const admin = testEnv.authenticatedContext('admin-uid');
    const storage = admin.storage();
    await assertSucceeds(storage.ref('media/msg-attachment-1/original').getDownloadURL());
  });

  // ════════════════════════════════════════════════════════
  // VERIFICATION EVIDENCE — submitter/admin authorization
  // ════════════════════════════════════════════════════════

  // 9. Submitter can read their verification evidence
  await test('Submitter can read verification evidence', async () => {
    const submitter = testEnv.authenticatedContext('submitter-uid');
    const storage = submitter.storage();
    await assertSucceeds(storage.ref('media/verif-evidence-1/original').getDownloadURL());
  });

  // 10. Admin can read verification evidence
  await test('Admin can read verification evidence', async () => {
    const admin = testEnv.authenticatedContext('admin-uid');
    const storage = admin.storage();
    await assertSucceeds(storage.ref('media/verif-evidence-1/original').getDownloadURL());
  });

  // 11. Unrelated user cannot read verification evidence
  await test('Unrelated user cannot read verification evidence', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(storage.ref('media/verif-evidence-1/original').getDownloadURL());
  });

  // 12. Verification evidence without source_ref_id: non-owner denied
  await test('Verification evidence without source_ref_id denies non-owner', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(storage.ref('media/verif-evidence-no-ref/original').getDownloadURL());
  });

  // 13. Verification evidence without source_ref_id: owner (submitter) allowed
  await test('Verification evidence without source_ref_id allows owner', async () => {
    const submitter = testEnv.authenticatedContext('submitter-uid');
    const storage = submitter.storage();
    await assertSucceeds(storage.ref('media/verif-evidence-no-ref/original').getDownloadURL());
  });

  // ════════════════════════════════════════════════════════
  // UNAUTHENTICATED ACCESS
  // ════════════════════════════════════════════════════════

  // 14. Unauthenticated cannot read message attachment
  await test('Unauthenticated cannot read message attachment', async () => {
    const unauthed = testEnv.unauthenticatedContext();
    const storage = unauthed.storage();
    await assertFails(storage.ref('media/msg-attachment-1/original').getDownloadURL());
  });

  // 15. Unauthenticated cannot read verification evidence
  await test('Unauthenticated cannot read verification evidence', async () => {
    const unauthed = testEnv.unauthenticatedContext();
    const storage = unauthed.storage();
    await assertFails(storage.ref('media/verif-evidence-1/original').getDownloadURL());
  });

  // 16. Unauthenticated cannot read public media
  await test('Unauthenticated cannot read public media', async () => {
    const unauthed = testEnv.unauthenticatedContext();
    const storage = unauthed.storage();
    await assertFails(storage.ref('media/public-media-1/original').getDownloadURL());
  });

  // ════════════════════════════════════════════════════════
  // NON-PROTECTED MEDIA (personal, professional, business)
  // ════════════════════════════════════════════════════════

  // 17. Owner can read their own private media
  await test('Owner can read their own private media', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    await assertSucceeds(storage.ref('media/private-media-1/original').getDownloadURL());
  });

  // 18. Unrelated user cannot read private media
  await test('Unrelated user cannot read private media', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(storage.ref('media/private-media-1/original').getDownloadURL());
  });

  // 19. Authenticated user can read public active media
  await test('Authenticated user can read public active media', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertSucceeds(storage.ref('media/public-media-1/original').getDownloadURL());
  });

  // ════════════════════════════════════════════════════════
  // WRITE PROTECTION
  // ════════════════════════════════════════════════════════

  // 20. Owner can upload to their own media path
  await test('Owner can upload to their own media path', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    await assertSucceeds(storage.ref('media/msg-attachment-1/original').putString('test'));
  });

  // 21. Non-owner cannot upload to another user's media path
  await test('Non-owner cannot upload to another user media path', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(storage.ref('media/msg-attachment-1/original').putString('malicious'));
  });

  // 22. Non-owner cannot delete another user's media
  await test('Non-owner cannot delete another user media', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(storage.ref('media/msg-attachment-1/original').delete());
  });

  // ════════════════════════════════════════════════════════
  // LIFECYCLE GUARDS
  // ════════════════════════════════════════════════════════

  // 23. Owner can read archived media
  await test('Owner can read archived media', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    await assertSucceeds(storage.ref('media/archived-media-1/original').getDownloadURL());
  });

  // 24. Non-owner cannot read archived public media
  await test('Non-owner cannot read archived public media', async () => {
    const other = testEnv.authenticatedContext('other-uid');
    const storage = other.storage();
    await assertFails(storage.ref('media/archived-media-1/original').getDownloadURL());
  });

  // 25. Owner cannot delete active media (lifecycle guard)
  await test('Owner cannot delete active media (lifecycle guard)', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
    await assertFails(storage.ref('media/public-media-1/original').delete());
  });

  // 26. Owner can delete scheduled-for-deletion media
  await test('Owner can delete scheduled-for-deletion media', async () => {
    const owner = testEnv.authenticatedContext('owner-uid');
    const storage = owner.storage();
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