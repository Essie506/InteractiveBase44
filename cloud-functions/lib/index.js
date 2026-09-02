"use strict";
// Interactive — Firebase Cloud Functions (M4)
// ───────────────────────────────────────────────────────────
// Re-exports all callable functions. Firebase Functions framework
// discovers exports from this file (package.json main: "lib/index.js").
//
// All functions use onCall with:
//   - region: europe-west2
//   - cors: explicit approved-origin regex (not cors: true)
//   - request.auth for Firebase-verified identity
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryDeliveries = exports.processDelivery = exports.backfillCalendarOwnership = exports.backfillProfessionalDirectory = exports.backfillPublicProfiles = exports.saveCalendarEvent = exports.saveBusinessProfile = exports.validatePersonalScreenName = exports.savePersonalProfile = exports.validateScreenName = exports.saveProfessionalProfile = exports.resolveConnectionStatuses = exports.resolveConnectionStatus = exports.resolveProfessionalAccess = exports.disconnectConnection = exports.respondConnectionRequest = exports.createConnectionRequest = exports.completeBooking = exports.reportNoShow = exports.rescheduleBooking = exports.cancelBooking = exports.stripeWebhook = exports.confirmFreeBooking = exports.createPaymentIntent = exports.createBookingDraft = exports.getStripeConfig = exports.getConnectAccountStatus = exports.createConnectAccount = exports.getProtectedMediaUrl = exports.migrateMedia = exports.setUserRole = exports.resolveParticipants = exports.findUserByEmail = exports.acceptInvitation = exports.decideVerification = exports.createTrustSignal = exports.createNotification = exports.respondMessageRequest = exports.createConversation = exports.resolveIdentity = void 0;
var identity_1 = require("./identity");
Object.defineProperty(exports, "resolveIdentity", { enumerable: true, get: function () { return identity_1.resolveIdentity; } });
var conversations_1 = require("./conversations");
Object.defineProperty(exports, "createConversation", { enumerable: true, get: function () { return conversations_1.createConversation; } });
Object.defineProperty(exports, "respondMessageRequest", { enumerable: true, get: function () { return conversations_1.respondMessageRequest; } });
var notifications_1 = require("./notifications");
Object.defineProperty(exports, "createNotification", { enumerable: true, get: function () { return notifications_1.createNotification; } });
var trust_1 = require("./trust");
Object.defineProperty(exports, "createTrustSignal", { enumerable: true, get: function () { return trust_1.createTrustSignal; } });
Object.defineProperty(exports, "decideVerification", { enumerable: true, get: function () { return trust_1.decideVerification; } });
var business_1 = require("./business");
Object.defineProperty(exports, "acceptInvitation", { enumerable: true, get: function () { return business_1.acceptInvitation; } });
var users_1 = require("./users");
Object.defineProperty(exports, "findUserByEmail", { enumerable: true, get: function () { return users_1.findUserByEmail; } });
Object.defineProperty(exports, "resolveParticipants", { enumerable: true, get: function () { return users_1.resolveParticipants; } });
Object.defineProperty(exports, "setUserRole", { enumerable: true, get: function () { return users_1.setUserRole; } });
var media_1 = require("./media");
Object.defineProperty(exports, "migrateMedia", { enumerable: true, get: function () { return media_1.migrateMedia; } });
Object.defineProperty(exports, "getProtectedMediaUrl", { enumerable: true, get: function () { return media_1.getProtectedMediaUrl; } });
// Phase 5 — Booking + Payments
var stripeConnect_1 = require("./stripeConnect");
Object.defineProperty(exports, "createConnectAccount", { enumerable: true, get: function () { return stripeConnect_1.createConnectAccount; } });
Object.defineProperty(exports, "getConnectAccountStatus", { enumerable: true, get: function () { return stripeConnect_1.getConnectAccountStatus; } });
Object.defineProperty(exports, "getStripeConfig", { enumerable: true, get: function () { return stripeConnect_1.getStripeConfig; } });
var bookingPayment_1 = require("./bookingPayment");
Object.defineProperty(exports, "createBookingDraft", { enumerable: true, get: function () { return bookingPayment_1.createBookingDraft; } });
Object.defineProperty(exports, "createPaymentIntent", { enumerable: true, get: function () { return bookingPayment_1.createPaymentIntent; } });
Object.defineProperty(exports, "confirmFreeBooking", { enumerable: true, get: function () { return bookingPayment_1.confirmFreeBooking; } });
var stripeWebhook_1 = require("./stripeWebhook");
Object.defineProperty(exports, "stripeWebhook", { enumerable: true, get: function () { return stripeWebhook_1.stripeWebhook; } });
var bookingLifecycle_1 = require("./bookingLifecycle");
Object.defineProperty(exports, "cancelBooking", { enumerable: true, get: function () { return bookingLifecycle_1.cancelBooking; } });
Object.defineProperty(exports, "rescheduleBooking", { enumerable: true, get: function () { return bookingLifecycle_1.rescheduleBooking; } });
Object.defineProperty(exports, "reportNoShow", { enumerable: true, get: function () { return bookingLifecycle_1.reportNoShow; } });
Object.defineProperty(exports, "completeBooking", { enumerable: true, get: function () { return bookingLifecycle_1.completeBooking; } });
// Relationship System — Connections + Professional access
var connections_1 = require("./connections");
Object.defineProperty(exports, "createConnectionRequest", { enumerable: true, get: function () { return connections_1.createConnectionRequest; } });
Object.defineProperty(exports, "respondConnectionRequest", { enumerable: true, get: function () { return connections_1.respondConnectionRequest; } });
Object.defineProperty(exports, "disconnectConnection", { enumerable: true, get: function () { return connections_1.disconnectConnection; } });
Object.defineProperty(exports, "resolveProfessionalAccess", { enumerable: true, get: function () { return connections_1.resolveProfessionalAccess; } });
Object.defineProperty(exports, "resolveConnectionStatus", { enumerable: true, get: function () { return connections_1.resolveConnectionStatus; } });
Object.defineProperty(exports, "resolveConnectionStatuses", { enumerable: true, get: function () { return connections_1.resolveConnectionStatuses; } });
// Professional Profile — public projection + screen name uniqueness
var professionalProfile_1 = require("./professionalProfile");
Object.defineProperty(exports, "saveProfessionalProfile", { enumerable: true, get: function () { return professionalProfile_1.saveProfessionalProfile; } });
Object.defineProperty(exports, "validateScreenName", { enumerable: true, get: function () { return professionalProfile_1.validateScreenName; } });
// Personal Profile — public projection + screen name uniqueness
var personalProfile_1 = require("./personalProfile");
Object.defineProperty(exports, "savePersonalProfile", { enumerable: true, get: function () { return personalProfile_1.savePersonalProfile; } });
Object.defineProperty(exports, "validatePersonalScreenName", { enumerable: true, get: function () { return personalProfile_1.validatePersonalScreenName; } });
// Business Profile — public projection
var businessProfile_1 = require("./businessProfile");
Object.defineProperty(exports, "saveBusinessProfile", { enumerable: true, get: function () { return businessProfile_1.saveBusinessProfile; } });
// Calendar Event — public projection (Events Discovery)
var calendarEvent_1 = require("./calendarEvent");
Object.defineProperty(exports, "saveCalendarEvent", { enumerable: true, get: function () { return calendarEvent_1.saveCalendarEvent; } });
// Backfill — one-time population of public projections
var backfillProfiles_1 = require("./backfillProfiles");
Object.defineProperty(exports, "backfillPublicProfiles", { enumerable: true, get: function () { return backfillProfiles_1.backfillPublicProfiles; } });
// Dedicated Professional-only Directory/Advert migration (admin-only).
// Does NOT run Personal/Business/Event backfill.
var backfillProfessionalDirectory_1 = require("./backfillProfessionalDirectory");
Object.defineProperty(exports, "backfillProfessionalDirectory", { enumerable: true, get: function () { return backfillProfessionalDirectory_1.backfillProfessionalDirectory; } });
// Calendar Event ownership correction backfill (admin-only). Implemented
// but NOT invoked — run via admin callable before production cutover.
var backfillCalendarOwnership_1 = require("./backfillCalendarOwnership");
Object.defineProperty(exports, "backfillCalendarOwnership", { enumerable: true, get: function () { return backfillCalendarOwnership_1.backfillCalendarOwnership; } });
// Notifications — delivery foundation (dispatcher + outbox worker + retry sweep).
// Domain systems emit semantic events via emitNotification (imported directly);
// these exports are the delivery-side triggers that Firebase discovers.
var deliveryWorker_1 = require("./notifications/deliveryWorker");
Object.defineProperty(exports, "processDelivery", { enumerable: true, get: function () { return deliveryWorker_1.processDelivery; } });
var deliverySweep_1 = require("./notifications/deliverySweep");
Object.defineProperty(exports, "retryDeliveries", { enumerable: true, get: function () { return deliverySweep_1.retryDeliveries; } });
//# sourceMappingURL=index.js.map