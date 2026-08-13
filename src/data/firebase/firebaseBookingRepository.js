/**
 * Firebase Booking + Payment Repository
 * ───────────────────────────────────────────────────────────
 * Collections:
 *   bookings/{bookingId}
 *   paymentRecords/{paymentRecordId}
 *   refundRecords/{refundRecordId}
 *   receipts/{receiptId}
 *   slotHolds/{holdId}
 *   stripeConnectAccounts/{accountId}
 *
 * Phase 5 — Firebase-native. No Base44 fallback.
 * All financial transitions go through Cloud Functions.
 * The repository is read-only for clients (writes are server-only).
 */

import { db } from '@/firebase/firebaseClient';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, limit,
} from 'firebase/firestore';
import { toFirestoreDoc, fromFirestoreDoc } from './mappers';

// ── Bookings ────────────────────────────────────────────────

export async function getBooking(bookingId) {
  const snap = await getDoc(doc(db, 'bookings', bookingId));
  return fromFirestoreDoc(snap);
}

export async function listBookingsForCustomer(identityId) {
  const q = query(
    collection(db, 'bookings'),
    where('customer_identity_id', '==', identityId),
    orderBy('_created_date', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function listBookingsForProvider(identityId) {
  const q = query(
    collection(db, 'bookings'),
    where('provider_identity_id', '==', identityId),
    orderBy('_created_date', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function listBookingsForBusiness(businessId) {
  const q = query(
    collection(db, 'bookings'),
    where('business_id', '==', businessId),
    orderBy('_created_date', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

export async function getBookingByGuestEmail(email, bookingId) {
  const q = query(
    collection(db, 'bookings'),
    where('guest_email', '==', email),
    where('__name__', '==', bookingId),
    limit(1),
  );
  const snap = await getDocs(q);
  return snap.empty ? null : fromFirestoreDoc(snap.docs[0]);
}

// ── Payment Records ─────────────────────────────────────────

export async function getPaymentRecord(paymentRecordId) {
  const snap = await getDoc(doc(db, 'paymentRecords', paymentRecordId));
  return fromFirestoreDoc(snap);
}

export async function getPaymentRecordForBooking(bookingId) {
  const q = query(
    collection(db, 'paymentRecords'),
    where('booking_id', '==', bookingId),
    limit(1),
  );
  const snap = await getDocs(q);
  return snap.empty ? null : fromFirestoreDoc(snap.docs[0]);
}

// ── Refund Records ───────────────────────────────────────────

export async function getRefundRecord(refundRecordId) {
  const snap = await getDoc(doc(db, 'refundRecords', refundRecordId));
  return fromFirestoreDoc(snap);
}

export async function listRefundsForBooking(bookingId) {
  const q = query(
    collection(db, 'refundRecords'),
    where('booking_id', '==', bookingId),
    orderBy('_created_date', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

// ── Receipts ────────────────────────────────────────────────

export async function getReceiptForBooking(bookingId) {
  const q = query(
    collection(db, 'receipts'),
    where('booking_id', '==', bookingId),
    limit(1),
  );
  const snap = await getDocs(q);
  return snap.empty ? null : fromFirestoreDoc(snap.docs[0]);
}

export async function listReceiptsForCustomer(identityId) {
  // Receipts don't store customer_identity_id directly — query via bookings
  const bookings = await listBookingsForCustomer(identityId);
  const bookingIds = bookings.map(b => b.id);
  if (bookingIds.length === 0) return [];
  const q = query(
    collection(db, 'receipts'),
    where('booking_id', 'in', bookingIds.slice(0, 10)),
    orderBy('_created_date', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(fromFirestoreDoc);
}

// ── Slot Holds ──────────────────────────────────────────────

export async function getSlotHold(holdId) {
  const snap = await getDoc(doc(db, 'slotHolds', holdId));
  return fromFirestoreDoc(snap);
}

// ── Stripe Connect Accounts ─────────────────────────────────

export async function getConnectAccountForProvider(identityId) {
  const q = query(
    collection(db, 'stripeConnectAccounts'),
    where('identity_id', '==', identityId),
    where('business_id', '==', null),
    limit(1),
  );
  const snap = await getDocs(q);
  return snap.empty ? null : fromFirestoreDoc(snap.docs[0]);
}

export async function getConnectAccountForBusiness(businessId) {
  const q = query(
    collection(db, 'stripeConnectAccounts'),
    where('business_id', '==', businessId),
    limit(1),
  );
  const snap = await getDocs(q);
  return snap.empty ? null : fromFirestoreDoc(snap.docs[0]);
}