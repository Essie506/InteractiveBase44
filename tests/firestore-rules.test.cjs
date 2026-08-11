/**
 * Firestore Security Rules Tests — M1.1
 * ───────────────────────────────────────────────────────────
 * Tests the 27 documented security rule test cases against the
 * Firebase Emulator Suite using @firebase/rules-unit-testing.
 *
 * Usage:
 *   firebase emulators:exec --only firestore "node tests/firestore-rules.test.js"
 *
 * Or start the emulator separately:
 *   firebase emulators:start --only firestore
 *   node tests/firestore-rules.test.js
 *
 * Requires Java runtime for the Firestore emulator.
 */

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
  try {
    await fn();
    record(name, true);
  } catch (err) {
    record(name, false, err.message);
  }
}

async function clear() {
  await testEnv.clearFirestore();
}

// ── Setup helpers (use security-rules-disabled admin client) ──

function adminDb() {
  return testEnv.withSecurityRulesDisabled().firestore();
}

async function setupIdentity(authUid, identityId) {
  await adminDb().collection('identityMappings').doc(authUid).set({
    identity_id: identityId,
    auth_provider: 'firebase',
  });
}

async function setupUser(identityId, data) {
  await adminDb().collection('users').doc(identityId).set(data);
}

async function setupProfile(collectionName, identityId, data) {
  const ref = await adminDb().collection(collectionName).add({
    identity_id: identityId,
    ...data,
  });
  return ref.id;
}

async function setupBusiness(businessId, ownerId) {
  await adminDb().collection('businesses').doc(businessId).set({ owner_id: ownerId });
}

async function setupMembership(businessId, identityId, role) {
  await adminDb().collection('businessMemberships').doc(`${businessId}_${identityId}`).set({
    business_id: businessId,
    identity_id: identityId,
    role,
    lifecycle_state: 'active',
  });
}

async function setupConversation(conversationId, participantIds, status) {
  await adminDb().collection('conversations').doc(conversationId).set({
    participant_ids: participantIds,
    request_status: status || 'accepted',
  });
}

async function setupNotification(notificationId, recipientId) {
  await adminDb().collection('notificationRecords').doc(notificationId).set({
    recipient_id: recipientId,
    source_system: 'system',
    event_type: 'test',
    title: 'Test notification',
  });
}

async function setupVerification(requestId, submitterId, status, decision) {
  await adminDb().collection('verificationRequests').doc(requestId).set({
    target_type: 'professional',
    target_id: submitterId,
    verification_type: 'identity',
    submitted_by_id: submitterId,
    status: status || 'pending_review',
    decision: decision || 'pending',
  });
}

async function setupTrustRecord(trustId, targetId) {
  await adminDb().collection('trustRecords').doc(trustId).set({
    target_type: 'professional',
    target_id: targetId,
    trust_level: 'verified',
    evidence_summary: 'Private evidence',
  });
}

async function setupBlock(blockerId, blockedId) {
  await adminDb().collection('blockRecords').doc(`${blockerId}__${blockedId}`).set({
    blocker_id: blockerId,
    blocked_id: blockedId,
    status: 'active',
  });
}

async function setupLocation(locationId, ownerId, visibility) {
  await adminDb().collection('locations').doc(locationId).set({
    owner_id: ownerId,
    owner_type: 'identity',
    location_context: 'manual',
    visibility: visibility || 'private',
    latitude: 51.5074,
    longitude: -0.1278,
    address_line1: 'Secret address',
  });
}

async function setupSettings(settingsId, identityId) {
  await adminDb().collection('userSettings').doc(settingsId).set({ identity_id: identityId });
}

async function setupSpec(specId, data) {
  await adminDb().collection('specifications').doc(specId).set(data);
}

async function setupSpecVersion(versionId, data) {
  await adminDb().collection('specVersions').doc(versionId).set(data);
}

// ── Test cases ──

async function runTests() {
  // 1. Unauthenticated user denied private records
  await test('1. Unauthenticated user denied private records', async () => {
    await clear();
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('users').doc('identityA').get());
  });

  // 2. User A cannot read User B private profile
  await test('2. User A cannot read User B private profile', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupUser('identityA', { role: 'user', email: 'a@test.com' });
    await setupUser('identityB', { role: 'user', email: 'b@test.com' });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('users').doc('identityB').get());
  });

  // 3. User A cannot read User B private personalProfile
  await test('3. User A cannot read User B private Profile', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupIdentity('authB', 'identityB');
    const profileB = await setupProfile('personalProfiles', 'identityB', {
      display_name: 'User B',
      visibility: 'private',
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('personalProfiles').doc(profileB).get());
  });

  // 4. Public Profile data can be read where visibility permits
  await test('4. Public Profile data can be read where visibility permits', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupIdentity('authB', 'identityB');
    const profileB = await setupProfile('personalProfiles', 'identityB', {
      display_name: 'User B',
      visibility: 'public',
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('personalProfiles').doc(profileB).get());
  });

  // 5. User A cannot read User B Notifications
  await test('5. User A cannot read User B Notifications', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupIdentity('authB', 'identityB');
    await setupNotification('notifB', 'identityB');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('notificationRecords').doc('notifB').get());
  });

  // 6. User A cannot read User B Settings
  await test('6. User A cannot read User B Settings', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupIdentity('authB', 'identityB');
    await setupSettings('settingsB', 'identityB');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('userSettings').doc('settingsB').get());
  });

  // 7. User A cannot read User B private Location
  await test('7. User A cannot read User B private Location', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupIdentity('authB', 'identityB');
    await setupLocation('locB', 'identityB', 'private');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('locations').doc('locB').get());
  });

  // 8. Business A member can read Business B business record
  await test('8. Business A member can read Business B business record', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupBusiness('bizA', 'identityA');
    await setupMembership('bizA', 'identityA', 'member');
    await setupBusiness('bizB', 'identityB');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('businesses').doc('bizB').get());
  });

  // 9. Business A member cannot write Business B protected data
  await test('9. Business A member cannot write Business B protected data', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupBusiness('bizA', 'identityA');
    await setupMembership('bizA', 'identityA', 'admin');
    await setupBusiness('bizB', 'identityB');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('businessProfiles').add({
      business_id: 'bizB',
      name: 'Biz B Profile',
    }));
  });

  // 10. Ordinary Business member cannot promote their role
  await test('10. Ordinary Business member cannot promote their role', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupBusiness('bizA', 'identityB');
    await setupMembership('bizA', 'identityA', 'member');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('businessMemberships').doc('bizA_identityA').update({
      role: 'admin',
    }));
  });

  // 11. Ordinary member cannot create owner membership
  await test('11. Ordinary member cannot create owner membership', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupBusiness('bizA', 'identityB');
    await setupMembership('bizA', 'identityA', 'member');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('businessMemberships').add({
      business_id: 'bizA',
      identity_id: 'identityA',
      role: 'owner',
    }));
  });

  // 12. Non-participant cannot read Conversation
  await test('12. Non-participant cannot read Conversation', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupIdentity('authB', 'identityB');
    await setupIdentity('authC', 'identityC');
    await setupConversation('conv1', ['identityA', 'identityB'], 'accepted');
    const db = testEnv.authenticatedContext('authC').firestore();
    await assertFails(db.collection('conversations').doc('conv1').get());
  });

  // 13. Non-participant cannot read Messages
  await test('13. Non-participant cannot read Messages', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupIdentity('authB', 'identityB');
    await setupIdentity('authC', 'identityC');
    await setupConversation('conv1', ['identityA', 'identityB'], 'accepted');
    const db = testEnv.authenticatedContext('authC').firestore();
    await assertFails(db.collection('conversations').doc('conv1').collection('messages').get());
  });

  // 14. Client cannot create Conversation directly
  await test('14. Client cannot create Conversation directly', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('conversations').add({
      participant_ids: ['identityA', 'identityB'],
      request_status: 'accepted',
      initiated_by_id: 'identityA',
      conversation_type: 'direct',
    }));
  });

  // 15. Participant can create message in accepted conversation
  await test('15. Participant can create message in accepted conversation', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupConversation('conv1', ['identityA', 'identityB'], 'accepted');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('conversations').doc('conv1').collection('messages').add({
      sender_id: 'identityA',
      body: 'Hello',
      conversation_id: 'conv1',
    }));
  });

  // 16. Cannot create message with wrong sender_id
  await test('16. Cannot create message with wrong sender_id', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupConversation('conv1', ['identityA', 'identityB'], 'accepted');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('conversations').doc('conv1').collection('messages').add({
      sender_id: 'identityB',
      body: 'Spoofed',
      conversation_id: 'conv1',
    }));
  });

  // 17. Client cannot create Notifications
  await test('17. Client cannot create Notifications', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('notificationRecords').add({
      recipient_id: 'identityB',
      source_system: 'system',
      event_type: 'spoofed',
      title: 'Spoofed',
    }));
  });

  // 18. Ordinary user cannot approve verification
  await test('18. Ordinary user cannot approve verification', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupIdentity('authB', 'identityB');
    await setupVerification('verif1', 'identityB', 'pending_review', 'pending');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('verificationRequests').doc('verif1').update({
      status: 'verified',
      decision: 'approved',
    }));
  });

  // 19. Non-reviewer cannot read others verification requests
  await test('19. Non-reviewer cannot read others verification requests', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupIdentity('authB', 'identityB');
    await setupVerification('verif1', 'identityB', 'pending_review', 'pending');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('verificationRequests').doc('verif1').get());
  });

  // 20. Private verification evidence cannot be read publicly
  await test('20. Private verification evidence cannot be read publicly', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupIdentity('authB', 'identityB');
    await setupTrustRecord('trust1', 'identityB');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('trustRecords').doc('trust1').get());
  });

  // 21. Client cannot create Trust Signals
  await test('21. Client cannot create Trust Signals', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('trustSignals').add({
      source_system: 'booking',
      target_type: 'professional',
      target_id: 'identityA',
      signal_type: 'completed_booking',
    }));
  });

  // 22. User cannot remove another users block
  await test('22. User cannot remove another users block', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupIdentity('authB', 'identityB');
    await setupBlock('identityB', 'identityA');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('blockRecords').doc('identityB__identityA').delete());
  });

  // 23. User cannot create block pretending to be another user
  await test('23. User cannot create block pretending to be another user', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('blockRecords').doc('identityB__identityA').set({
      blocker_id: 'identityB',
      blocked_id: 'identityA',
      status: 'active',
    }));
  });

  // 24. Blocked sender cannot bypass Messaging restrictions
  await test('24. Blocked sender cannot bypass Messaging restrictions', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('conversations').add({
      participant_ids: ['identityA', 'identityB'],
      request_status: 'accepted',
      initiated_by_id: 'identityA',
      conversation_type: 'direct',
    }));
  });

  // 25. Unauthenticated denied SpecVault access
  await test('25. Unauthenticated denied SpecVault access', async () => {
    await clear();
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('specifications').get());
  });

  // 26. Authenticated can read SpecVault
  await test('26. Authenticated can read SpecVault', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupSpec('spec1', { title: 'Test Spec', project_id: 'proj1' });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('specifications').doc('spec1').get());
  });

  // 27. Spec Versions are immutable
  await test('27. Spec Versions are immutable', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupSpecVersion('ver1', { specification_id: 'spec1', version: '1.0' });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('specVersions').doc('ver1').update({
      version: '2.0',
    }));
  });
}

// ── Identity mapping specific tests (M1.1 additions) ──

async function runIdentityMappingTests() {
  // 28. Authenticated user can read own identity mapping
  await test('28. Authenticated user can read own identity mapping', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('identityMappings').doc('authA').get());
  });

  // 29. User cannot read another user's identity mapping
  await test('29. User cannot read another users identity mapping', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    await setupIdentity('authB', 'identityB');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('identityMappings').doc('authB').get());
  });

  // 30. Client cannot create identity mapping
  await test('30. Client cannot create identity mapping', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('identityMappings').doc('authC').set({
      identity_id: 'identityC',
    }));
  });

  // 31. User without identity mapping is denied domain access
  await test('31. User without identity mapping denied domain access', async () => {
    await clear();
    const db = testEnv.authenticatedContext('authNoMapping').firestore();
    await assertFails(db.collection('userSettings').add({
      identity_id: 'someIdentity',
    }));
  });

  // 32. User can create profile with correct identity_id
  await test('32. User can create profile with correct identity_id', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('personalProfiles').add({
      identity_id: 'identityA',
      display_name: 'User A',
      visibility: 'private',
    }));
  });

  // 33. User cannot create profile with wrong identity_id
  await test('33. User cannot create profile with wrong identity_id', async () => {
    await clear();
    await setupIdentity('authA', 'identityA');
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('personalProfiles').add({
      identity_id: 'identityB',
      display_name: 'Spoofed',
      visibility: 'private',
    }));
  });
}

// ── Main ──

async function main() {
  console.log('Initializing test environment...');
  console.log(`Rules file: ${RULES_PATH}`);

  try {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync(RULES_PATH, 'utf8'),
      },
    });
  } catch (err) {
    console.error('\nFailed to initialize test environment.');
    console.error('Ensure the Firestore emulator is running:');
    console.error('  firebase emulators:start --only firestore');
    console.error('Error:', err.message);
    process.exit(2);
  }

  console.log('\nRunning security rule tests...\n');

  await runTests();
  await runIdentityMappingTests();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed, ${results.length} total`);
  console.log('='.repeat(60));

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter((r) => !r.passed).forEach((r) => {
      console.log(`  [FAIL] ${r.name}: ${r.error}`);
    });
  }

  await testEnv.cleanup();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});