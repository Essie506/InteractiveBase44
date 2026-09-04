// Interactive — Firebase Cloud Functions (M4)
// ───────────────────────────────────────────────────────────
// Re-exports all callable functions. Firebase Functions framework
// discovers exports from this file (package.json main: "lib/index.js").
//
// All functions use onCall with:
//   - region: europe-west2
//   - cors: explicit approved-origin regex (not cors: true)
//   - request.auth for Firebase-verified identity

export { resolveIdentity } from './identity';
export { createConversation, respondMessageRequest } from './conversations';
export { createNotification } from './notifications';
export { createTrustSignal, decideVerification } from './trust';
export { acceptInvitation } from './business';
export { findUserByEmail, resolveParticipants, setUserRole } from './users';
export { migrateMedia, getProtectedMediaUrl } from './media';

// Phase 5 — Booking + Payments
export { createConnectAccount, getConnectAccountStatus, getStripeConfig } from './stripeConnect';
export { createBookingDraft, createPaymentIntent, confirmFreeBooking } from './bookingPayment';
export { stripeWebhook } from './stripeWebhook';
export { cancelBooking, rescheduleBooking, reportNoShow, completeBooking } from './bookingLifecycle';

// Relationship System — Connections + Professional access
export { createConnectionRequest, respondConnectionRequest, disconnectConnection, resolveProfessionalAccess, resolveConnectionStatus, resolveConnectionStatuses } from './connections';

// Professional Profile — public projection + screen name uniqueness
export { saveProfessionalProfile, validateScreenName } from './professionalProfile';

// Personal Profile — public projection + screen name uniqueness
export { savePersonalProfile, validatePersonalScreenName } from './personalProfile';

// Business Profile — public projection
export { saveBusinessProfile } from './businessProfile';

// Calendar Event — public projection (Events Discovery)
export { saveCalendarEvent } from './calendarEvent';
export { sweepExpiredHolds } from './holdSweep';
export { sweepReminders } from './reminderSweep';
export { saveReminderRule, deleteReminderRule, listReminderRules } from './reminderRule';
export { saveOccurrenceException } from './occurrenceException';
export { splitRecurrenceSeries } from './recurrenceSeriesSplit';
export { migrateCalendarLifecycleStates } from './migrateCalendarLifecycleStates';

// Phase 2 — Source Unavailable handler (§106–§108, §111)
export { handleSourceUnavailable } from './handleSourceUnavailable';

// Phase 3 — Calendar Participation (invitation response lifecycle)
export { respondCalendarInvitation, revokeCalendarInvitation } from './calendarParticipation';

// Phase 3 — Business Relationship Exit (§109)
export { handleBusinessRelationshipExit } from './handleBusinessRelationshipExit';

// Backfill — one-time population of public projections
export { backfillPublicProfiles } from './backfillProfiles';

// Dedicated Professional-only Directory/Advert migration (admin-only).
// Does NOT run Personal/Business/Event backfill.
export { backfillProfessionalDirectory } from './backfillProfessionalDirectory';

// Calendar Event ownership correction backfill (admin-only). Implemented
// but NOT invoked — run via admin callable before production cutover.
export { backfillCalendarOwnership } from './backfillCalendarOwnership';

// Notifications — delivery foundation (dispatcher + outbox worker + retry sweep).
// Domain systems emit semantic events via emitNotification (imported directly);
// these exports are the delivery-side triggers that Firebase discovers.
export { processDelivery } from './notifications/deliveryWorker';
export { retryDeliveries } from './notifications/deliverySweep';