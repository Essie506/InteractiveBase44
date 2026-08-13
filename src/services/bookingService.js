/**
 * Booking Service — Phase 5
 * ───────────────────────────────────────────────────────────
 * Client-side booking operations. All financial transitions
 * go through trusted Firebase Cloud Functions — the client is
 * never authoritative for payment success.
 *
 * Architecture:
 *   Page → BookingService → Cloud Function (trusted) → Stripe
 *
 * No Base44 fallback — booking is Firebase-native only.
 */

import { bookingRepository } from '@/data/firebase';
import {
  callCreateBookingDraft,
  callCreatePaymentIntent,
  callConfirmFreeBooking,
  callCancelBooking,
  callRescheduleBooking,
  callReportNoShow,
  callCompleteBooking,
} from '@/services/firebaseFunctions';

// ── Booking Draft Creation ──────────────────────────────────
// Creates a booking draft with price/policy snapshots and a slot hold.
// The server calculates the fee and total — the client never provides
// an authoritative total.
export async function createBookingDraft(bookingData) {
  return callCreateBookingDraft(bookingData);
}

// ── Payment Intent ──────────────────────────────────────────
// Creates a Stripe PaymentIntent for a booking that requires payment.
// Returns the client_secret for Stripe.js to complete payment.
export async function createPaymentIntent(bookingId) {
  return callCreatePaymentIntent({ booking_id: bookingId });
}

// ── Free / No-Payment Booking Confirmation ──────────────────
// Confirms a booking with no payment requirement (free, pay_later,
// arrange_directly, external_payment).
export async function confirmFreeBooking(bookingId) {
  return callConfirmFreeBooking({ booking_id: bookingId });
}

// ── Cancellation ─────────────────────────────────────────────
// Cancels a booking with server-side policy evaluation and Stripe
// refund if applicable. The client never calculates the refund amount.
export async function cancelBooking(bookingId, reason) {
  return callCancelBooking({ booking_id: bookingId, reason });
}

// ── Rescheduling ────────────────────────────────────────────
// Same-price reschedule. Price-difference rescheduling is not
// supported in this initial implementation (specification gap).
export async function rescheduleBooking(bookingId, newStartTime, newEndTime, reason) {
  return callRescheduleBooking({
    booking_id: bookingId,
    new_start_time: newStartTime,
    new_end_time: newEndTime,
    reason,
  });
}

// ── No-Show ──────────────────────────────────────────────────
// Reports a no-show for a past booking. Does not auto-refund.
export async function reportNoShow(bookingId, reason) {
  return callReportNoShow({ booking_id: bookingId, reason });
}

// ── Completion ──────────────────────────────────────────────
// Marks a confirmed booking as completed.
export async function completeBooking(bookingId) {
  return callCompleteBooking({ booking_id: bookingId });
}

// ── Reads (via repository) ──────────────────────────────────

export async function getBooking(bookingId) {
  return bookingRepository.getBooking(bookingId);
}

export async function listMyBookings(identityId) {
  return bookingRepository.listBookingsForCustomer(identityId);
}

export async function listProviderBookings(identityId) {
  return bookingRepository.listBookingsForProvider(identityId);
}

export async function listBusinessBookings(businessId) {
  return bookingRepository.listBookingsForBusiness(businessId);
}

export async function getPaymentRecord(bookingId) {
  return bookingRepository.getPaymentRecordForBooking(bookingId);
}

export async function getReceipt(bookingId) {
  return bookingRepository.getReceiptForBooking(bookingId);
}

export async function listRefunds(bookingId) {
  return bookingRepository.listRefundsForBooking(bookingId);
}

// ── Guest Booking Lookup ────────────────────────────────────
// Controlled server-side guest lookup — does not expose other
// guests' bookings. Uses the authenticated user's email to match.
export async function getGuestBooking(email, bookingId) {
  return bookingRepository.getBookingByGuestEmail(email, bookingId);
}