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
exports.saveCalendarEvent = exports.saveBusinessProfile = exports.validatePersonalScreenName = exports.savePersonalProfile = exports.validateScreenName = exports.saveProfessionalProfile = exports.resolveConnectionStatuses = exports.resolveConnectionStatus = exports.resolveProfessionalAccess = exports.disconnectConnection = exports.respondConnectionRequest = exports.createConnectionRequest = exports.deletePost = exports.savePost = exports.deleteShare = exports.createShare = exports.deleteWorkout = exports.saveWorkout = exports.getInteractionState = exports.toggleSave = exports.deleteComment = exports.createComment = exports.toggleReaction = exports.createCustomerPortal = exports.getMySubscription = exports.createSubscriptionCheckout = exports.guestLookupBooking = exports.completeBooking = exports.reportNoShow = exports.rescheduleBooking = exports.cancelBooking = exports.stripeWebhook = exports.confirmFreeBooking = exports.createPaymentIntent = exports.createBookingDraft = exports.getStripeConfig = exports.getConnectAccountStatus = exports.createConnectAccount = exports.getProtectedMediaUrl = exports.migrateMedia = exports.setUserRole = exports.resolveParticipants = exports.findUserByEmail = exports.acceptInvitation = exports.decideVerification = exports.createTrustSignal = exports.createNotification = exports.respondMessageRequest = exports.createConversation = exports.resolveIdentity = void 0;
exports.updateCampaignStatus = exports.saveCampaign = exports.unindexContent = exports.indexContent = exports.retryDeliveries = exports.processDelivery = exports.backfillCalendarOwnership = exports.backfillProfessionalDirectory = exports.backfillPublicProfiles = exports.handleBusinessRelationshipExit = exports.setPersonalTimelineState = exports.revokeCalendarInvitation = exports.respondCalendarInvitation = exports.handleSourceUnavailable = exports.deactivateIdentityCalendar = exports.migrateCalendarLifecycleStates = exports.splitRecurrenceSeries = exports.saveOccurrenceException = exports.listReminderRules = exports.deleteReminderRule = exports.saveReminderRule = exports.sweepReminders = exports.sweepExpiredHolds = exports.getCalendarView = exports.deleteCalendarEvent = void 0;
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
var bookingPayment_2 = require("./bookingPayment");
Object.defineProperty(exports, "guestLookupBooking", { enumerable: true, get: function () { return bookingPayment_2.guestLookupBooking; } });
// Phase 6 — Plans & Monetisation (Spec 17): recurring subscriptions via Stripe
var subscriptionManage_1 = require("./subscriptionManage");
Object.defineProperty(exports, "createSubscriptionCheckout", { enumerable: true, get: function () { return subscriptionManage_1.createSubscriptionCheckout; } });
Object.defineProperty(exports, "getMySubscription", { enumerable: true, get: function () { return subscriptionManage_1.getMySubscription; } });
Object.defineProperty(exports, "createCustomerPortal", { enumerable: true, get: function () { return subscriptionManage_1.createCustomerPortal; } });
// Community Interaction (Spec 20): reactions, comments, saves
var communityInteraction_1 = require("./communityInteraction");
Object.defineProperty(exports, "toggleReaction", { enumerable: true, get: function () { return communityInteraction_1.toggleReaction; } });
Object.defineProperty(exports, "createComment", { enumerable: true, get: function () { return communityInteraction_1.createComment; } });
Object.defineProperty(exports, "deleteComment", { enumerable: true, get: function () { return communityInteraction_1.deleteComment; } });
Object.defineProperty(exports, "toggleSave", { enumerable: true, get: function () { return communityInteraction_1.toggleSave; } });
Object.defineProperty(exports, "getInteractionState", { enumerable: true, get: function () { return communityInteraction_1.getInteractionState; } });
// Workout System (Spec 12): workout identity, composition, publication
var workout_1 = require("./workout");
Object.defineProperty(exports, "saveWorkout", { enumerable: true, get: function () { return workout_1.saveWorkout; } });
Object.defineProperty(exports, "deleteWorkout", { enumerable: true, get: function () { return workout_1.deleteWorkout; } });
// Share Engine (Spec 14.1): content sharing
var share_1 = require("./share");
Object.defineProperty(exports, "createShare", { enumerable: true, get: function () { return share_1.createShare; } });
Object.defineProperty(exports, "deleteShare", { enumerable: true, get: function () { return share_1.deleteShare; } });
// Post System: post lifecycle (create, edit, delete)
var post_1 = require("./post");
Object.defineProperty(exports, "savePost", { enumerable: true, get: function () { return post_1.savePost; } });
Object.defineProperty(exports, "deletePost", { enumerable: true, get: function () { return post_1.deletePost; } });
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
Object.defineProperty(exports, "deleteCalendarEvent", { enumerable: true, get: function () { return calendarEvent_1.deleteCalendarEvent; } });
var calendarView_1 = require("./calendarView");
Object.defineProperty(exports, "getCalendarView", { enumerable: true, get: function () { return calendarView_1.getCalendarView; } });
var holdSweep_1 = require("./holdSweep");
Object.defineProperty(exports, "sweepExpiredHolds", { enumerable: true, get: function () { return holdSweep_1.sweepExpiredHolds; } });
var reminderSweep_1 = require("./reminderSweep");
Object.defineProperty(exports, "sweepReminders", { enumerable: true, get: function () { return reminderSweep_1.sweepReminders; } });
var reminderRule_1 = require("./reminderRule");
Object.defineProperty(exports, "saveReminderRule", { enumerable: true, get: function () { return reminderRule_1.saveReminderRule; } });
Object.defineProperty(exports, "deleteReminderRule", { enumerable: true, get: function () { return reminderRule_1.deleteReminderRule; } });
Object.defineProperty(exports, "listReminderRules", { enumerable: true, get: function () { return reminderRule_1.listReminderRules; } });
var occurrenceException_1 = require("./occurrenceException");
Object.defineProperty(exports, "saveOccurrenceException", { enumerable: true, get: function () { return occurrenceException_1.saveOccurrenceException; } });
var recurrenceSeriesSplit_1 = require("./recurrenceSeriesSplit");
Object.defineProperty(exports, "splitRecurrenceSeries", { enumerable: true, get: function () { return recurrenceSeriesSplit_1.splitRecurrenceSeries; } });
var migrateCalendarLifecycleStates_1 = require("./migrateCalendarLifecycleStates");
Object.defineProperty(exports, "migrateCalendarLifecycleStates", { enumerable: true, get: function () { return migrateCalendarLifecycleStates_1.migrateCalendarLifecycleStates; } });
var identityDeactivation_1 = require("./identityDeactivation");
Object.defineProperty(exports, "deactivateIdentityCalendar", { enumerable: true, get: function () { return identityDeactivation_1.deactivateIdentityCalendar; } });
// Phase 2 — Source Unavailable handler (§106–§108, §111)
var handleSourceUnavailable_1 = require("./handleSourceUnavailable");
Object.defineProperty(exports, "handleSourceUnavailable", { enumerable: true, get: function () { return handleSourceUnavailable_1.handleSourceUnavailable; } });
// Phase 3 — Calendar Participation (invitation response lifecycle)
var calendarParticipation_1 = require("./calendarParticipation");
Object.defineProperty(exports, "respondCalendarInvitation", { enumerable: true, get: function () { return calendarParticipation_1.respondCalendarInvitation; } });
Object.defineProperty(exports, "revokeCalendarInvitation", { enumerable: true, get: function () { return calendarParticipation_1.revokeCalendarInvitation; } });
Object.defineProperty(exports, "setPersonalTimelineState", { enumerable: true, get: function () { return calendarParticipation_1.setPersonalTimelineState; } });
// Phase 3 — Business Relationship Exit (§109)
var handleBusinessRelationshipExit_1 = require("./handleBusinessRelationshipExit");
Object.defineProperty(exports, "handleBusinessRelationshipExit", { enumerable: true, get: function () { return handleBusinessRelationshipExit_1.handleBusinessRelationshipExit; } });
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
// Search Index — V2 §15.5 cross-system search indexing
var searchIndex_1 = require("./searchIndex");
Object.defineProperty(exports, "indexContent", { enumerable: true, get: function () { return searchIndex_1.indexContent; } });
Object.defineProperty(exports, "unindexContent", { enumerable: true, get: function () { return searchIndex_1.unindexContent; } });
// Promotions — V2 §19 campaign management
var promotion_1 = require("./promotion");
Object.defineProperty(exports, "saveCampaign", { enumerable: true, get: function () { return promotion_1.saveCampaign; } });
Object.defineProperty(exports, "updateCampaignStatus", { enumerable: true, get: function () { return promotion_1.updateCampaignStatus; } });
//# sourceMappingURL=index.js.map