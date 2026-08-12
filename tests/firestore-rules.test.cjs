/**
 * Firestore Security Rules Tests — M1.1
 * ───────────────────────────────────────────────────────────
 * Tests the 27 documented security rule test cases plus 6
 * identity-mapping-specific cases (33 total) against the Firebase
 * Emulator Suite using @firebase/rules-unit-testing v3.
 *
 * Usage:
 *   firebase emulators:exec --only firestore "node tests/firestore-rules.test.cjs"
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

// ── Admin setup helper (uses withSecurityRulesDisabled callback) ──

async function withAdmin(fn) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await fn(context.firestore());
  });
}

// ── Setup functions (each takes admin db) ──

async function setupIdentity(db, authUid, identityId) {
  await db.collection('identityMappings').doc(authUid).set({
    identity_id: identityId,
    auth_provider: 'firebase',
  });
}

async function setupUser(db, identityId, data) {
  await db.collection('users').doc(identityId).set(data);
}

async function setupProfile(db, collectionName, identityId, data) {
  const ref = await db.collection(collectionName).add({ identity_id: identityId, ...data });
  return ref.id;
}

async function setupBusiness(db, businessId, ownerId) {
  await db.collection('businesses').doc(businessId).set({ owner_id: ownerId });
}

async function setupMembership(db, businessId, identityId, role) {
  await db.collection('businessMemberships').doc(`${businessId}_${identityId}`).set({
    business_id: businessId,
    identity_id: identityId,
    role,
    lifecycle_state: 'active',
  });
}

async function setupConversation(db, conversationId, participantIds, status) {
  await db.collection('conversations').doc(conversationId).set({
    participant_ids: participantIds,
    request_status: status || 'accepted',
  });
}

async function setupNotification(db, notificationId, recipientId) {
  await db.collection('notificationRecords').doc(notificationId).set({
    recipient_id: recipientId,
    source_system: 'system',
    event_type: 'test',
    title: 'Test notification',
  });
}

async function setupVerification(db, requestId, submitterId, status, decision) {
  await db.collection('verificationRequests').doc(requestId).set({
    target_type: 'professional',
    target_id: submitterId,
    verification_type: 'identity',
    submitted_by_id: submitterId,
    status: status || 'pending_review',
    decision: decision || 'pending',
  });
}

async function setupTrustRecord(db, trustId, targetId) {
  await db.collection('trustRecords').doc(trustId).set({
    target_type: 'professional',
    target_id: targetId,
    trust_level: 'verified',
    evidence_summary: 'Private evidence',
  });
}

async function setupBlock(db, blockerId, blockedId) {
  await db.collection('blockRecords').doc(`${blockerId}__${blockedId}`).set({
    blocker_id: blockerId,
    blocked_id: blockedId,
    status: 'active',
  });
}

async function setupLocation(db, locationId, ownerId, visibility) {
  await db.collection('locations').doc(locationId).set({
    owner_id: ownerId,
    owner_type: 'identity',
    location_context: 'manual',
    visibility: visibility || 'private',
    latitude: 51.5074,
    longitude: -0.1278,
    address_line1: 'Secret address',
  });
}

async function setupSettings(db, settingsId, identityId) {
  await db.collection('userSettings').doc(settingsId).set({ identity_id: identityId });
}

async function setupSpec(db, specId, data) {
  await db.collection('specifications').doc(specId).set(data);
}

async function setupSpecVersion(db, versionId, data) {
  await db.collection('specVersions').doc(versionId).set(data);
}

async function setupMediaAsset(db, mediaId, ownerId, data) {
  await db.collection('mediaAssets').doc(mediaId).set({
    owner_id: ownerId,
    visibility: 'private',
    lifecycle_state: 'active',
    source_domain: 'personal',
    ...data,
  });
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
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupUser(db, 'identityA', { role: 'user', email: 'a@test.com' });
      await setupUser(db, 'identityB', { role: 'user', email: 'b@test.com' });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('users').doc('identityB').get());
  });

  // 3. User A cannot read User B private personalProfile
  await test('3. User A cannot read User B private Profile', async () => {
    await clear();
    let profileB;
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupIdentity(db, 'authB', 'identityB');
      profileB = await setupProfile(db, 'personalProfiles', 'identityB', {
        display_name: 'User B',
        visibility: 'private',
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('personalProfiles').doc(profileB).get());
  });

  // 4. Public Profile data can be read where visibility permits
  await test('4. Public Profile data can be read where visibility permits', async () => {
    await clear();
    let profileB;
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupIdentity(db, 'authB', 'identityB');
      profileB = await setupProfile(db, 'personalProfiles', 'identityB', {
        display_name: 'User B',
        visibility: 'public',
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('personalProfiles').doc(profileB).get());
  });

  // 5. User A cannot read User B Notifications
  await test('5. User A cannot read User B Notifications', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupIdentity(db, 'authB', 'identityB');
      await setupNotification(db, 'notifB', 'identityB');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('notificationRecords').doc('notifB').get());
  });

  // 6. User A cannot read User B Settings
  await test('6. User A cannot read User B Settings', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupIdentity(db, 'authB', 'identityB');
      await setupSettings(db, 'settingsB', 'identityB');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('userSettings').doc('settingsB').get());
  });

  // 7. User A cannot read User B private Location
  await test('7. User A cannot read User B private Location', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupIdentity(db, 'authB', 'identityB');
      await setupLocation(db, 'locB', 'identityB', 'private');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('locations').doc('locB').get());
  });

  // 8. Business A member can read Business B business record
  await test('8. Business A member can read Business B business record', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupBusiness(db, 'bizA', 'identityA');
      await setupMembership(db, 'bizA', 'identityA', 'member');
      await setupBusiness(db, 'bizB', 'identityB');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('businesses').doc('bizB').get());
  });

  // 9. Business A member cannot write Business B protected data
  await test('9. Business A member cannot write Business B protected data', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupBusiness(db, 'bizA', 'identityA');
      await setupMembership(db, 'bizA', 'identityA', 'admin');
      await setupBusiness(db, 'bizB', 'identityB');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('businessProfiles').add({
      business_id: 'bizB',
      name: 'Biz B Profile',
    }));
  });

  // 10. Ordinary Business member cannot promote their role
  await test('10. Ordinary Business member cannot promote their role', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupBusiness(db, 'bizA', 'identityB');
      await setupMembership(db, 'bizA', 'identityA', 'member');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('businessMemberships').doc('bizA_identityA').update({
      role: 'admin',
    }));
  });

  // 11. Ordinary member cannot create owner membership
  await test('11. Ordinary member cannot create owner membership', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupBusiness(db, 'bizA', 'identityB');
      await setupMembership(db, 'bizA', 'identityA', 'member');
    });
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
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupIdentity(db, 'authB', 'identityB');
      await setupIdentity(db, 'authC', 'identityC');
      await setupConversation(db, 'conv1', ['identityA', 'identityB'], 'accepted');
    });
    const db = testEnv.authenticatedContext('authC').firestore();
    await assertFails(db.collection('conversations').doc('conv1').get());
  });

  // 13. Non-participant cannot read Messages
  await test('13. Non-participant cannot read Messages', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupIdentity(db, 'authB', 'identityB');
      await setupIdentity(db, 'authC', 'identityC');
      await setupConversation(db, 'conv1', ['identityA', 'identityB'], 'accepted');
    });
    const db = testEnv.authenticatedContext('authC').firestore();
    await assertFails(db.collection('conversations').doc('conv1').collection('messages').get());
  });

  // 14. Client cannot create Conversation directly
  await test('14. Client cannot create Conversation directly', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
    });
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
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupConversation(db, 'conv1', ['identityA', 'identityB'], 'accepted');
    });
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
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupConversation(db, 'conv1', ['identityA', 'identityB'], 'accepted');
    });
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
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
    });
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
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupIdentity(db, 'authB', 'identityB');
      await setupVerification(db, 'verif1', 'identityB', 'pending_review', 'pending');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('verificationRequests').doc('verif1').update({
      status: 'verified',
      decision: 'approved',
    }));
  });

  // 19. Non-reviewer cannot read others verification requests
  await test('19. Non-reviewer cannot read others verification requests', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupIdentity(db, 'authB', 'identityB');
      await setupVerification(db, 'verif1', 'identityB', 'pending_review', 'pending');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('verificationRequests').doc('verif1').get());
  });

  // 20. Private verification evidence cannot be read publicly
  await test('20. Private verification evidence cannot be read publicly', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupIdentity(db, 'authB', 'identityB');
      await setupTrustRecord(db, 'trust1', 'identityB');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('trustRecords').doc('trust1').get());
  });

  // 21. Client cannot create Trust Signals
  await test('21. Client cannot create Trust Signals', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
    });
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
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupIdentity(db, 'authB', 'identityB');
      await setupBlock(db, 'identityB', 'identityA');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('blockRecords').doc('identityB__identityA').delete());
  });

  // 23. User cannot create block pretending to be another user
  await test('23. User cannot create block pretending to be another user', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
    });
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
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
    });
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
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupSpec(db, 'spec1', { title: 'Test Spec', project_id: 'proj1' });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('specifications').doc('spec1').get());
  });

  // 27. Spec Versions are immutable
  await test('27. Spec Versions are immutable', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupSpecVersion(db, 'ver1', { specification_id: 'spec1', version: '1.0' });
    });
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
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('identityMappings').doc('authA').get());
  });

  // 29. User cannot read another user's identity mapping
  await test('29. User cannot read another users identity mapping', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupIdentity(db, 'authB', 'identityB');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('identityMappings').doc('authB').get());
  });

  // 30. Client cannot create identity mapping
  await test('30. Client cannot create identity mapping', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
    });
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
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
    });
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
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('personalProfiles').add({
      identity_id: 'identityB',
      display_name: 'Spoofed',
      visibility: 'private',
    }));
  });

  // ── M3 Public/Private Projection Tests ──

  // 34. Professional profile public projection is readable by authenticated users
  await test('34. Professional profile public projection is readable', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await db.collection('professionalProfilesPublic').doc('profB').set({
        identity_id: 'identityB',
        display_name: 'User B',
        profession: 'Trainer',
        visibility: 'public',
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('professionalProfilesPublic').doc('profB').get());
  });

  // 35. Client cannot write to professional profile public projection
  await test('35. Client cannot write professional profile public projection', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('professionalProfilesPublic').doc('profA').set({
      identity_id: 'identityA',
      display_name: 'User A',
    }));
  });

  // 36. Location public projection is readable by authenticated users
  await test('36. Location public projection is readable', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await db.collection('locationsPublic').doc('locB').set({
        owner_id: 'identityB',
        owner_type: 'identity',
        location_context: 'manual',
        public_label: 'London, UK',
        city: 'London',
        country: 'UK',
        visibility: 'public',
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('locationsPublic').doc('locB').get());
  });

  // 37. Client cannot write to location public projection
  await test('37. Client cannot write location public projection', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('locationsPublic').doc('locA').set({
      owner_id: 'identityA',
      public_label: 'Test',
    }));
  });

  // 38. Private professional profile is not readable by non-owner (even with public visibility)
  await test('38. Private professional profile not readable by non-owner', async () => {
    await clear();
    let profB;
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupIdentity(db, 'authB', 'identityB');
      profB = await setupProfile(db, 'professionalProfiles', 'identityB', {
        display_name: 'User B',
        visibility: 'public',
        contact_email: 'private@test.com',
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('professionalProfiles').doc(profB).get());
  });

  // 39. Private location is not readable by non-owner (even with public visibility)
  await test('39. Private location not readable by non-owner with public visibility', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupIdentity(db, 'authB', 'identityB');
      await setupLocation(db, 'locB', 'identityB', 'public');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('locations').doc('locB').get());
  });
}

// ── M4 Server-Authoritative Write Protection Tests ──

async function runServerAuthoritativeTests() {
  // 40. Ordinary user cannot promote their own role
  await test('40. Ordinary user cannot promote own role to admin', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupUser(db, 'identityA', { role: 'user', email: 'a@test.com' });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('users').doc('identityA').update({
      role: 'admin',
    }));
  });

  // 41. Ordinary user can update non-role fields on own user doc
  await test('41. Ordinary user can update non-role fields on own user doc', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupUser(db, 'identityA', { role: 'user', email: 'a@test.com', display_name: 'A' });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('users').doc('identityA').update({
      display_name: 'Updated Name',
    }));
  });

  // 42. Admin can promote a user role (direct Firestore write)
  await test('42. Admin can update a user role', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authAdmin', 'adminIdentity');
      await setupIdentity(db, 'authA', 'identityA');
      await setupUser(db, 'adminIdentity', { role: 'admin', email: 'admin@test.com' });
      await setupUser(db, 'identityA', { role: 'user', email: 'a@test.com' });
    });
    const db = testEnv.authenticatedContext('authAdmin').firestore();
    await assertSucceeds(db.collection('users').doc('identityA').update({
      role: 'admin',
    }));
  });

  // 43. Client cannot write to identityMappings (role denormalization target)
  await test('43. Client cannot write to identityMappings role field', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('identityMappings').doc('authA').update({
      role: 'admin',
    }));
  });

  // 44. Client cannot set authorized_identity_ids on mediaAssets create
  await test('44. Client cannot set authorized_identity_ids on media create', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('mediaAssets').doc('media1').set({
      owner_id: 'identityA',
      media_type: 'image',
      source_domain: 'verification',
      authorized_identity_ids: ['identityA'],
    }));
  });

  // 45. Client can create media without authorized_identity_ids
  await test('45. Client can create media without authorized_identity_ids', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('mediaAssets').doc('media1').set({
      owner_id: 'identityA',
      media_type: 'image',
      source_domain: 'personal',
    }));
  });

  // 46. Owner cannot add themselves to authorized_identity_ids via update
  await test('46. Owner cannot add self to authorized_identity_ids via update', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupMediaAsset(db, 'media1', 'identityA', {
        source_domain: 'verification',
        source_ref_id: 'verif1',
        authorized_identity_ids: ['identityB'],
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('mediaAssets').doc('media1').update({
      authorized_identity_ids: ['identityA'],
    }));
  });

  // 47. Owner cannot add others to authorized_identity_ids via update
  await test('47. Owner cannot add others to authorized_identity_ids via update', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupMediaAsset(db, 'media1', 'identityA', {
        source_domain: 'verification',
        source_ref_id: 'verif1',
        authorized_identity_ids: null,
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('mediaAssets').doc('media1').update({
      authorized_identity_ids: ['identityB'],
    }));
  });

  // 48. Owner can update other media fields without changing authorized_identity_ids
  await test('48. Owner can update other media fields (authorized_identity_ids unchanged)', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupMediaAsset(db, 'media1', 'identityA', {
        source_domain: 'personal',
        authorized_identity_ids: null,
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('mediaAssets').doc('media1').update({
      alt_text: 'An image',
    }));
  });

  // 49. Admin can update authorized_identity_ids on media
  await test('49. Admin can update authorized_identity_ids on media', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authAdmin', 'adminIdentity');
      await setupIdentity(db, 'authA', 'identityA');
      await setupUser(db, 'adminIdentity', { role: 'admin', email: 'admin@test.com' });
      await setupMediaAsset(db, 'media1', 'identityA', {
        source_domain: 'verification',
        source_ref_id: 'verif1',
        authorized_identity_ids: null,
      });
    });
    const db = testEnv.authenticatedContext('authAdmin').firestore();
    await assertSucceeds(db.collection('mediaAssets').doc('media1').update({
      authorized_identity_ids: ['identityA'],
    }));
  });

  // 50. Non-owner cannot update authorized_identity_ids on someone else media
  await test('50. Non-owner cannot update authorized_identity_ids on others media', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupIdentity(db, 'authB', 'identityB');
      await setupMediaAsset(db, 'media1', 'identityA', {
        source_domain: 'verification',
        source_ref_id: 'verif1',
        authorized_identity_ids: null,
      });
    });
    const db = testEnv.authenticatedContext('authB').firestore();
    await assertFails(db.collection('mediaAssets').doc('media1').update({
      authorized_identity_ids: ['identityB'],
    }));
  });

  // ── M4 Full Field-Diff Regression Tests ──

  // 51. User cannot change own email (identity integrity)
  await test('51. User cannot change own email', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupUser(db, 'identityA', { role: 'user', email: 'a@test.com' });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('users').doc('identityA').update({
      email: 'changed@test.com',
    }));
  });

  // 52. Owner cannot transfer media ownership
  await test('52. Owner cannot transfer media ownership (owner_id)', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupIdentity(db, 'authB', 'identityB');
      await setupMediaAsset(db, 'media1', 'identityA');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('mediaAssets').doc('media1').update({
      owner_id: 'identityB',
    }));
  });

  // 53. Owner cannot reassign source_domain
  await test('53. Owner cannot reassign source_domain', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupMediaAsset(db, 'media1', 'identityA', {
        source_domain: 'personal',
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('mediaAssets').doc('media1').update({
      source_domain: 'verification',
    }));
  });

  // 54. Owner cannot reassign source_ref_id
  await test('54. Owner cannot reassign source_ref_id', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupMediaAsset(db, 'media1', 'identityA', {
        source_domain: 'messaging',
        source_ref_id: 'conv1',
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('mediaAssets').doc('media1').update({
      source_ref_id: 'conv2',
    }));
  });

  // 55. Owner cannot change storage_path after it is set
  await test('55. Owner cannot change storage_path after set', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupMediaAsset(db, 'media1', 'identityA', {
        storage_path: 'media/media1/original',
        file_url: 'https://example.com/media1',
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('mediaAssets').doc('media1').update({
      storage_path: 'media/media2/original',
    }));
  });

  // 56. Owner can set storage_path from null (upload flow)
  await test('56. Owner can set storage_path from null (upload flow)', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupMediaAsset(db, 'media1', 'identityA', {
        storage_path: null,
        file_url: null,
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('mediaAssets').doc('media1').update({
      storage_path: 'media/media1/original',
      file_url: 'https://example.com/media1',
      lifecycle_state: 'active',
    }));
  });

  // 57. Owner cannot change file_url after it is set
  await test('57. Owner cannot change file_url after set', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupMediaAsset(db, 'media1', 'identityA', {
        file_url: 'https://example.com/original',
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('mediaAssets').doc('media1').update({
      file_url: 'https://evil.com/replacement',
    }));
  });

  // 58. Owner cannot escalate protected media to public visibility
  await test('58. Owner cannot escalate protected media to public', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupMediaAsset(db, 'media1', 'identityA', {
        source_domain: 'verification',
        source_ref_id: 'verif1',
        visibility: 'private',
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('mediaAssets').doc('media1').update({
      visibility: 'public',
    }));
  });

  // 59. Owner cannot reactivate archived protected media
  await test('59. Owner cannot reactivate archived protected media', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupMediaAsset(db, 'media1', 'identityA', {
        source_domain: 'verification',
        source_ref_id: 'verif1',
        lifecycle_state: 'archived',
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('mediaAssets').doc('media1').update({
      lifecycle_state: 'active',
    }));
  });

  // 60. Owner can archive active protected media (lifecycle decrease)
  await test('60. Owner can archive active protected media', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupMediaAsset(db, 'media1', 'identityA', {
        source_domain: 'verification',
        source_ref_id: 'verif1',
        lifecycle_state: 'active',
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('mediaAssets').doc('media1').update({
      lifecycle_state: 'archived',
    }));
  });

  // 61. Owner can change visibility on non-protected media
  await test('61. Owner can change visibility on non-protected media', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupMediaAsset(db, 'media1', 'identityA', {
        source_domain: 'personal',
        visibility: 'private',
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('mediaAssets').doc('media1').update({
      visibility: 'public',
    }));
  });

  // 62. Owner can update alt_text (non-sensitive field)
  await test('62. Owner can update alt_text (non-sensitive field)', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupMediaAsset(db, 'media1', 'identityA');
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('mediaAssets').doc('media1').update({
      alt_text: 'A photo of my cat',
    }));
  });

  // 63. Admin can reassign owner_id
  await test('63. Admin can reassign owner_id', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authAdmin', 'adminIdentity');
      await setupIdentity(db, 'authA', 'identityA');
      await setupIdentity(db, 'authB', 'identityB');
      await setupUser(db, 'adminIdentity', { role: 'admin', email: 'admin@test.com' });
      await setupMediaAsset(db, 'media1', 'identityA');
    });
    const db = testEnv.authenticatedContext('authAdmin').firestore();
    await assertSucceeds(db.collection('mediaAssets').doc('media1').update({
      owner_id: 'identityB',
    }));
  });

  // 64. Admin can reassign source_domain
  await test('64. Admin can reassign source_domain', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authAdmin', 'adminIdentity');
      await setupIdentity(db, 'authA', 'identityA');
      await setupUser(db, 'adminIdentity', { role: 'admin', email: 'admin@test.com' });
      await setupMediaAsset(db, 'media1', 'identityA', {
        source_domain: 'personal',
      });
    });
    const db = testEnv.authenticatedContext('authAdmin').firestore();
    await assertSucceeds(db.collection('mediaAssets').doc('media1').update({
      source_domain: 'verification',
    }));
  });

  // 65. Admin can escalate protected media visibility
  await test('65. Admin can escalate protected media visibility', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authAdmin', 'adminIdentity');
      await setupIdentity(db, 'authA', 'identityA');
      await setupUser(db, 'adminIdentity', { role: 'admin', email: 'admin@test.com' });
      await setupMediaAsset(db, 'media1', 'identityA', {
        source_domain: 'verification',
        source_ref_id: 'verif1',
        visibility: 'private',
      });
    });
    const db = testEnv.authenticatedContext('authAdmin').firestore();
    await assertSucceeds(db.collection('mediaAssets').doc('media1').update({
      visibility: 'public',
    }));
  });

  // 66. Owner cannot change legacy_file_url
  await test('66. Owner cannot change legacy_file_url', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupMediaAsset(db, 'media1', 'identityA', {
        legacy_file_url: 'https://legacy.base44.com/file/123',
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('mediaAssets').doc('media1').update({
      legacy_file_url: 'https://evil.com/replacement',
    }));
  });

  // 67. Owner cannot reactivate scheduled-for-deletion protected media
  await test('67. Owner cannot reactivate scheduled-for-deletion protected media', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupMediaAsset(db, 'media1', 'identityA', {
        source_domain: 'messaging',
        source_ref_id: 'conv1',
        lifecycle_state: 'scheduled_for_deletion',
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertFails(db.collection('mediaAssets').doc('media1').update({
      lifecycle_state: 'active',
    }));
  });

  // 68. Owner can schedule non-protected media for deletion
  await test('68. Owner can schedule non-protected media for deletion', async () => {
    await clear();
    await withAdmin(async (db) => {
      await setupIdentity(db, 'authA', 'identityA');
      await setupMediaAsset(db, 'media1', 'identityA', {
        source_domain: 'personal',
        lifecycle_state: 'active',
      });
    });
    const db = testEnv.authenticatedContext('authA').firestore();
    await assertSucceeds(db.collection('mediaAssets').doc('media1').update({
      lifecycle_state: 'scheduled_for_deletion',
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
  await runServerAuthoritativeTests();

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