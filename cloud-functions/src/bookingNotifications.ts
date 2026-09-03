// Booking notification context builder — resolves the safe email context
// for booking lifecycle notifications (Booking §1.7.1, §2.18, §3.12).
// ───────────────────────────────────────────────────────────
// The booking functions (bookingPayment, bookingLifecycle, stripeWebhook)
// call buildBookingEmailContext to assemble the BookingEmailContext, then
// pass it + buildBookingEmailPayload to emitNotification. This keeps the
// emitNotification call in the source file (per the dispatcher boundary)
// while avoiding duplication of the provider-name / date-formatting logic.

import { db } from './shared';
import { BookingEmailContext, BookingEventType } from './notifications/email/payloads/booking';

/**
 * Resolve the provider or business display name for a booking email.
 * Business bookings → businessProfilesPublic.name.
 * Professional bookings → professionalProfilesPublic.display_name.
 */
export async function resolveBookingProviderName(booking: Record<string, any>): Promise<string | null> {
  if (booking.business_id) {
    try {
      const snap = await db.collection('businessProfilesPublic').doc(booking.business_id).get();
      if (snap.exists) return snap.data()!.name || null;
    } catch { /* fall through */ }
  }
  try {
    const profSnap = await db.collection('professionalProfilesPublic')
      .where('identity_id', '==', booking.provider_identity_id)
      .limit(1)
      .get();
    if (!profSnap.empty) return profSnap.docs[0].data().display_name || null;
  } catch { /* ignore */ }
  return null;
}

function formatBookingWhen(booking: Record<string, any>): { dateLabel: string; timeLabel: string } {
  const tz = booking.timezone || 'UTC';
  const start = new Date(booking.start_time);
  const end = booking.end_time ? new Date(booking.end_time) : null;
  const dateLabel = start.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: tz,
  });
  const timeLabel = `${start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz })}${end ? ' – ' + end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }) : ''}`;
  return { dateLabel, timeLabel };
}

function bookingPaymentStatusLabel(booking: Record<string, any>): string | null {
  if (booking.payment_requirement === 'not_required' || booking.payment_route === 'free') return 'No payment required';
  if (booking.payment_status_mirror === 'succeeded') return 'Paid';
  if (booking.payment_status_mirror === 'refunded') return 'Refunded';
  if (booking.payment_route === 'deposit') return 'Deposit paid';
  if (booking.payment_route === 'pay_later') return 'Pay later';
  if (booking.payment_route === 'arrange_directly') return 'Arrange directly';
  return 'Payment required';
}

function bookingLocationLabel(booking: Record<string, any>): string | null {
  const lt = booking.location_context || booking.location_type;
  if (lt === 'online') return 'Online';
  if (lt === 'hybrid') return 'Hybrid';
  if (lt === 'physical') return 'In person';
  return lt || null;
}

/**
 * Build the BookingEmailContext for a booking lifecycle notification.
 * Resolves the provider/business display name and formats date/time.
 */
export async function buildBookingEmailContext(
  bookingId: string,
  booking: Record<string, any>,
  eventType: BookingEventType,
): Promise<BookingEmailContext> {
  const providerName = await resolveBookingProviderName(booking);
  const { dateLabel, timeLabel } = formatBookingWhen(booking);
  return {
    bookingReference: bookingId,
    providerOrBusinessName: providerName,
    serviceLabel: booking.booking_type || booking.service_id || null,
    dateLabel,
    timeLabel,
    timezone: booking.timezone || 'UTC',
    locationLabel: bookingLocationLabel(booking),
    paymentStatusLabel: bookingPaymentStatusLabel(booking),
    managementRoute: `/bookings/${bookingId}`,
    eventType,
  };
}