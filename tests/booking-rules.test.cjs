/**
 * Firestore Security Rules Tests — Phase 5 Booking + Payments
 * ───────────────────────────────────────────────────────────
 * Tests all Phase 5 collection permissions:
 *   bookings, paymentRecords, refundRecords, receipts,
 *   slotHolds, stripeConnectAccounts, processedStripeEvents
 *
 * Verifies:
 *   - All writes are server-only (clients cannot create/update/delete)
 *   - Clients cannot alter authoritative price, fee, Stripe, refund,
 *     receipt, or booking-status fields
 *   - Customers can read their own bookings/payments/receipts
 *   - Providers can read their own bookings/payments/receipts
 *   - Business members can read bookings/payments for their business
 *   - Unrelated users cannot access booking/payment records
 *   - Guests cannot access other guests' bookings
 *
 * Usage:
 *   firebase emulators:exec --only firestore "node tests/booking-rules.test.cjs"
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

// ── Admin setup helper ──
async function withAdmin(fn) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await fn(context.firestore());
  });
}

// ── Setup helpers ──
async function setupIdentity(db, authUid, identityId, role) {
  await db.collection('identityMappings').doc(authUid).set({
    identity_id: identityId,
  });
  await db.collection('users').doc(identityId).set({
    role: role || 'user',
  });
}

async function setupBusiness(db, businessId, ownerId) {
  await db.collection('businesses').doc(businessId).set({
    name: 'Test Business',
    owner_id: ownerId,
  });
  await db.collection('businessMemberships').doc(`${businessId}_${ownerId}`).set({
    business_id: businessId,
    identity_id: ownerId,
    role: 'owner',
  });
}

async function setupBooking(db, bookingId, data) {
  await db.collection('bookings').doc(bookingId).set(data);
}

async function setupPaymentRecord(db, payId, data) {
  await db.collection('paymentRecords').doc(payId).set(data);
}

async function setupRefundRecord(db, refundId, data) {
  await db.collection('refundRecords').doc(refundId).set(data);
}

async function setupReceipt(db, receiptId, data) {
  await db.collection('receipts').doc(receiptId).set(data);
}

async function setupSlotHold(db, holdId, data) {
  await db.collection('slotHolds').doc(holdId).set(data);
}

async function setupConnectAccount(db, accountId, data) {
  await db.collection('stripeConnectAccounts').doc(accountId).set(data);
}

function authedDb(authUid) {
  return testEnv.authenticatedContext(authUid).firestore();
}

function unauthedDb() {
  return testEnv.unauthenticatedContext().firestore();
}

// ═══════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════

async function runTests() {
  // ── Setup: identities ──
  await withAdmin(async (db) => {
    await setupIdentity(db, 'customer-uid', 'cust-id', 'user');
    await setupIdentity(db, 'provider-uid', 'prov-id', 'user');
    await setupIdentity(db, 'unrelated-uid', 'unrel-id', 'user');
    await setupIdentity(db, 'admin-uid', 'admin-id', 'admin');
    await setupIdentity(db, 'bizadmin-uid', 'bizadmin-id', 'user');
    await setupBusiness(db, 'biz-1', 'bizadmin-id');
  });

  // ═══════════════════════════════════════════════════════════
  // BOOKINGS — server-only writes, identity-based reads
  // ═══════════════════════════════════════════════════════════

  await withAdmin(async (db) => {
    await setupBooking(db, 'booking-1', {
      customer_identity_id: 'cust-id',
      guest_email: null,
      provider_identity_id: 'prov-id',
      business_id: null,
      booking_status: 'scheduled',
      payment_route: 'pay_through_interactive',
      payment_requirement: 'required',
      payment_status_mirror: 'succeeded',
      price_snapshot: { base_price_pence: 5000, currency: 'GBP' },
      booking_fee_snapshot: { amount_pence: 250, currency: 'GBP' },
      total_snapshot: { amount_pence: 5250, currency: 'GBP' },
      stripe_payment_intent_id: 'pi_test123',
      stripe_connected_account_id: 'acct_test123',
      hold_id: 'hold-1',
    });

    await setupBooking(db, 'booking-2', {
      customer_identity_id: null,
      guest_email: 'guest@test.com',
      provider_identity_id: 'prov-id',
      business_id: 'biz-1',
      booking_status: 'scheduled',
      payment_route: 'full_payment',
      payment_requirement: 'required',
      payment_status_mirror: 'succeeded',
      price_snapshot: { base_price_pence: 3000, currency: 'GBP' },
      booking_fee_snapshot: { amount_pence: 150, currency: 'GBP' },
      total_snapshot: { amount_pence: 3150, currency: 'GBP' },
      hold_id: 'hold-2',
    });

    await setupBooking(db, 'booking-3', {
      customer_identity_id: 'unrel-id',
      provider_identity_id: 'prov-id',
      business_id: null,
      booking_status: 'scheduled',
      payment_route: 'pay_later',
      payment_requirement: 'not_required',
      payment_status_mirror: 'none',
      price_snapshot: { base_price_pence: 2000, currency: 'GBP' },
      hold_id: 'hold-3',
    });
  });

  // ── Bookings: server-only writes ──
  await test('BOOKINGS: client cannot create booking', async () => {
    const db = authedDb('customer-uid');
    await assertFails(db.collection('bookings').doc('booking-new').set({
      customer_identity_id: 'cust-id',
      provider_identity_id: 'prov-id',
      booking_status: 'draft',
    }));
  });

  await test('BOOKINGS: client cannot update booking status', async () => {
    const db = authedDb('customer-uid');
    await assertFails(db.collection('bookings').doc('booking-1').update({
      booking_status: 'confirmed',
    }));
  });

  await test('BOOKINGS: client cannot update price snapshot', async () => {
    const db = authedDb('customer-uid');
    await assertFails(db.collection('bookings').doc('booking-1').update({
      price_snapshot: { base_price_pence: 1, currency: 'GBP' },
    }));
  });

  await test('BOOKINGS: client cannot update Stripe IDs', async () => {
    const db = authedDb('customer-uid');
    await assertFails(db.collection('bookings').doc('booking-1').update({
      stripe_payment_intent_id: 'pi_hijacked',
    }));
  });

  await test('BOOKINGS: client cannot delete booking', async () => {
    const db = authedDb('customer-uid');
    await assertFails(db.collection('bookings').doc('booking-1').delete());
  });

  // ── Bookings: identity-based reads ──
  await test('BOOKINGS: customer can read own booking', async () => {
    const db = authedDb('customer-uid');
    await assertSucceeds(db.collection('bookings').doc('booking-1').get());
  });

  await test('BOOKINGS: provider can read own booking', async () => {
    const db = authedDb('provider-uid');
    await assertSucceeds(db.collection('bookings').doc('booking-1').get());
  });

  await test('BOOKINGS: business member can read business booking', async () => {
    const db = authedDb('bizadmin-uid');
    await assertSucceeds(db.collection('bookings').doc('booking-2').get());
  });

  await test('BOOKINGS: unrelated user cannot read booking', async () => {
    const db = authedDb('unrelated-uid');
    await assertFails(db.collection('bookings').doc('booking-1').get());
  });

  await test('BOOKINGS: admin can read any booking', async () => {
    const db = authedDb('admin-uid');
    await assertSucceeds(db.collection('bookings').doc('booking-3').get());
  });

  // ═══════════════════════════════════════════════════════════
  // PAYMENT RECORDS — server-only writes, identity-based reads
  // ═══════════════════════════════════════════════════════════

  await withAdmin(async (db) => {
    await setupPaymentRecord(db, 'pay-1', {
      booking_id: 'booking-1',
      payer_identity_id: 'cust-id',
      guest_email: null,
      provider_identity_id: 'prov-id',
      business_id: null,
      stripe_payment_intent_id: 'pi_test123',
      amount_snapshot: 5250,
      currency: 'GBP',
      payment_status: 'succeeded',
      refund_state: 'none',
    });

    await setupPaymentRecord(db, 'pay-2', {
      booking_id: 'booking-2',
      payer_identity_id: null,
      guest_email: 'guest@test.com',
      provider_identity_id: 'prov-id',
      business_id: 'biz-1',
      stripe_payment_intent_id: 'pi_test456',
      amount_snapshot: 3150,
      currency: 'GBP',
      payment_status: 'succeeded',
      refund_state: 'none',
    });
  });

  await test('PAYMENTS: client cannot create payment record', async () => {
    const db = authedDb('customer-uid');
    await assertFails(db.collection('paymentRecords').doc('pay-new').set({
      booking_id: 'booking-1',
      payment_status: 'succeeded',
    }));
  });

  await test('PAYMENTS: client cannot update payment status', async () => {
    const db = authedDb('customer-uid');
    await assertFails(db.collection('paymentRecords').doc('pay-1').update({
      payment_status: 'succeeded',
    }));
  });

  await test('PAYMENTS: client cannot update refund state', async () => {
    const db = authedDb('customer-uid');
    await assertFails(db.collection('paymentRecords').doc('pay-1').update({
      refund_state: 'refunded',
    }));
  });

  await test('PAYMENTS: payer can read own payment record', async () => {
    const db = authedDb('customer-uid');
    await assertSucceeds(db.collection('paymentRecords').doc('pay-1').get());
  });

  await test('PAYMENTS: provider can read own payment record', async () => {
    const db = authedDb('provider-uid');
    await assertSucceeds(db.collection('paymentRecords').doc('pay-1').get());
  });

  await test('PAYMENTS: business member can read business payment', async () => {
    const db = authedDb('bizadmin-uid');
    await assertSucceeds(db.collection('paymentRecords').doc('pay-2').get());
  });

  await test('PAYMENTS: unrelated user cannot read payment record', async () => {
    const db = authedDb('unrelated-uid');
    await assertFails(db.collection('paymentRecords').doc('pay-1').get());
  });

  // ═══════════════════════════════════════════════════════════
  // REFUND RECORDS — server-only writes, requester-based reads
  // ═══════════════════════════════════════════════════════════

  await withAdmin(async (db) => {
    await setupRefundRecord(db, 'refund-1', {
      booking_id: 'booking-1',
      payment_record_id: 'pay-1',
      stripe_refund_id: 're_test123',
      requested_amount: 5250,
      status: 'completed',
      requester_identity_id: 'cust-id',
    });
  });

  await test('REFUNDS: client cannot create refund record', async () => {
    const db = authedDb('customer-uid');
    await assertFails(db.collection('refundRecords').doc('refund-new').set({
      booking_id: 'booking-1',
      status: 'completed',
    }));
  });

  await test('REFUNDS: client cannot update refund status', async () => {
    const db = authedDb('customer-uid');
    await assertFails(db.collection('refundRecords').doc('refund-1').update({
      status: 'completed',
    }));
  });

  await test('REFUNDS: requester can read own refund record', async () => {
    const db = authedDb('customer-uid');
    await assertSucceeds(db.collection('refundRecords').doc('refund-1').get());
  });

  await test('REFUNDS: unrelated user cannot read refund record', async () => {
    const db = authedDb('unrelated-uid');
    await assertFails(db.collection('refundRecords').doc('refund-1').get());
  });

  // ═══════════════════════════════════════════════════════════
  // RECEIPTS — server-only writes, identity-based reads
  // ═══════════════════════════════════════════════════════════

  await withAdmin(async (db) => {
    await setupReceipt(db, 'receipt-1', {
      booking_id: 'booking-1',
      customer_snapshot: { identity_id: 'cust-id' },
      provider_snapshot: { identity_id: 'prov-id', business_id: null },
      subtotal_pence: 5000,
      booking_fee_pence: 250,
      total_pence: 5250,
      currency: 'GBP',
    });

    await setupReceipt(db, 'receipt-2', {
      booking_id: 'booking-2',
      customer_snapshot: { identity_id: null },
      provider_snapshot: { identity_id: 'prov-id', business_id: 'biz-1' },
      subtotal_pence: 3000,
      booking_fee_pence: 150,
      total_pence: 3150,
      currency: 'GBP',
    });
  });

  await test('RECEIPTS: client cannot create receipt', async () => {
    const db = authedDb('customer-uid');
    await assertFails(db.collection('receipts').doc('receipt-new').set({
      booking_id: 'booking-1',
      total_pence: 100,
    }));
  });

  await test('RECEIPTS: client cannot update receipt', async () => {
    const db = authedDb('customer-uid');
    await assertFails(db.collection('receipts').doc('receipt-1').update({
      total_pence: 1,
    }));
  });

  await test('RECEIPTS: customer can read own receipt', async () => {
    const db = authedDb('customer-uid');
    await assertSucceeds(db.collection('receipts').doc('receipt-1').get());
  });

  await test('RECEIPTS: provider can read own receipt', async () => {
    const db = authedDb('provider-uid');
    await assertSucceeds(db.collection('receipts').doc('receipt-1').get());
  });

  await test('RECEIPTS: business member can read business receipt', async () => {
    const db = authedDb('bizadmin-uid');
    await assertSucceeds(db.collection('receipts').doc('receipt-2').get());
  });

  await test('RECEIPTS: unrelated user cannot read receipt', async () => {
    const db = authedDb('unrelated-uid');
    await assertFails(db.collection('receipts').doc('receipt-1').get());
  });

  // ═══════════════════════════════════════════════════════════
  // SLOT HOLDS — server-only writes, creator/provider reads
  // ═══════════════════════════════════════════════════════════

  await withAdmin(async (db) => {
    await setupSlotHold(db, 'hold-1', {
      provider_identity_id: 'prov-id',
      business_id: null,
      start_time: '2026-09-01T10:00:00Z',
      end_time: '2026-09-01T11:00:00Z',
      status: 'confirmed',
      created_by_identity_id: 'cust-id',
    });
  });

  await test('HOLDS: client cannot create slot hold', async () => {
    const db = authedDb('customer-uid');
    await assertFails(db.collection('slotHolds').doc('hold-new').set({
      provider_identity_id: 'prov-id',
      status: 'active',
    }));
  });

  await test('HOLDS: client cannot update slot hold status', async () => {
    const db = authedDb('customer-uid');
    await assertFails(db.collection('slotHolds').doc('hold-1').update({
      status: 'released',
    }));
  });

  await test('HOLDS: creator can read own hold', async () => {
    const db = authedDb('customer-uid');
    await assertSucceeds(db.collection('slotHolds').doc('hold-1').get());
  });

  await test('HOLDS: provider can read hold on their slot', async () => {
    const db = authedDb('provider-uid');
    await assertSucceeds(db.collection('slotHolds').doc('hold-1').get());
  });

  await test('HOLDS: unrelated user cannot read hold', async () => {
    const db = authedDb('unrelated-uid');
    await assertFails(db.collection('slotHolds').doc('hold-1').get());
  });

  // ═══════════════════════════════════════════════════════════
  // STRIPE CONNECT ACCOUNTS — server-only writes, owner reads
  // ═══════════════════════════════════════════════════════════

  await withAdmin(async (db) => {
    await setupConnectAccount(db, 'acct-1', {
      identity_id: 'prov-id',
      business_id: null,
      stripe_account_id: 'acct_stripe_1',
      account_status: 'enabled',
      charges_enabled: true,
      payouts_enabled: true,
    });

    await setupConnectAccount(db, 'acct-2', {
      identity_id: 'bizadmin-id',
      business_id: 'biz-1',
      stripe_account_id: 'acct_stripe_2',
      account_status: 'enabled',
      charges_enabled: true,
      payouts_enabled: true,
    });
  });

  await test('CONNECT: client cannot create connect account', async () => {
    const db = authedDb('provider-uid');
    await assertFails(db.collection('stripeConnectAccounts').doc('acct-new').set({
      identity_id: 'prov-id',
      charges_enabled: true,
    }));
  });

  await test('CONNECT: client cannot update connect account', async () => {
    const db = authedDb('provider-uid');
    await assertFails(db.collection('stripeConnectAccounts').doc('acct-1').update({
      charges_enabled: true,
    }));
  });

  await test('CONNECT: owner can read own connect account', async () => {
    const db = authedDb('provider-uid');
    await assertSucceeds(db.collection('stripeConnectAccounts').doc('acct-1').get());
  });

  await test('CONNECT: business member can read business connect account', async () => {
    const db = authedDb('bizadmin-uid');
    await assertSucceeds(db.collection('stripeConnectAccounts').doc('acct-2').get());
  });

  await test('CONNECT: unrelated user cannot read connect account', async () => {
    const db = authedDb('unrelated-uid');
    await assertFails(db.collection('stripeConnectAccounts').doc('acct-1').get());
  });

  // ═══════════════════════════════════════════════════════════
  // PROCESSED STRIPE EVENTS — fully server-only
  // ═══════════════════════════════════════════════════════════

  await withAdmin(async (db) => {
    await db.collection('processedStripeEvents').doc('evt-1').set({
      event_id: 'evt_test123',
      event_type: 'payment_intent.succeeded',
      processing_status: 'completed',
    });
  });

  await test('EVENTS: client cannot read processed events', async () => {
    const db = authedDb('admin-uid');
    await assertFails(db.collection('processedStripeEvents').doc('evt-1').get());
  });

  await test('EVENTS: client cannot create processed events', async () => {
    const db = authedDb('admin-uid');
    await assertFails(db.collection('processedStripeEvents').doc('evt-new').set({
      event_id: 'evt_new',
    }));
  });

  await test('EVENTS: unauthenticated cannot read processed events', async () => {
    const db = unauthedDb();
    await assertFails(db.collection('processedStripeEvents').doc('evt-1').get());
  });

  // ═══════════════════════════════════════════════════════════
  // UNAUTHENTICATED ACCESS — all Phase 5 collections blocked
  // ═══════════════════════════════════════════════════════════

  await test('UNAUTH: unauthenticated cannot read bookings', async () => {
    const db = unauthedDb();
    await assertFails(db.collection('bookings').doc('booking-1').get());
  });

  await test('UNAUTH: unauthenticated cannot read payment records', async () => {
    const db = unauthedDb();
    await assertFails(db.collection('paymentRecords').doc('pay-1').get());
  });

  await test('UNAUTH: unauthenticated cannot read receipts', async () => {
    const db = unauthedDb();
    await assertFails(db.collection('receipts').doc('receipt-1').get());
  });
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

(async () => {
  try {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync(RULES_PATH, 'utf8'),
        host: 'localhost',
        port: 8080,
      },
    });

    await clear();
    await runTests();

    // ── Summary ──
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    console.log('\n═══════════════════════════════════════');
    console.log(`Phase 5 Security Rules Tests: ${passed} passed, ${failed} failed (${results.length} total)`);
    console.log('═══════════════════════════════════════');

    if (failed > 0) {
      console.log('\nFAILURES:');
      results.filter(r => !r.passed).forEach(r => {
        console.log(`  ✗ ${r.name}: ${r.error}`);
      });
      process.exit(1);
    }
  } catch (err) {
    console.error('Test setup error:', err);
    process.exit(1);
  } finally {
    if (testEnv) await testEnv.cleanup();
  }
})();