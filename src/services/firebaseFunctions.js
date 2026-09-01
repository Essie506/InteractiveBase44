// Firebase Cloud Function callable wrappers
// ───────────────────────────────────────────────────────────
// Centralised client-side invocations for all trusted server
// operations. Uses the Firebase Functions SDK (httpsCallable)
// which automatically attaches the user's Firebase ID token.
//
// All functions are onCall — Firebase infrastructure verifies
// the ID token before invoking the function. No manual token
// handling, no Base44 SDK dependency.

import { httpsCallable } from 'firebase/functions';
import { getFunctionsInstance } from '@/firebase/firebaseClient';

function callable(name) {
  return httpsCallable(getFunctionsInstance(), name);
}

// ── Identity ──
export async function callResolveIdentity() {
  const result = await callable('resolveIdentity')();
  return result.data;
}

// ── Conversations ──
export async function callCreateConversation(data) {
  const result = await callable('createConversation')(data);
  return result.data;
}

export async function callRespondMessageRequest(data) {
  const result = await callable('respondMessageRequest')(data);
  return result.data;
}

// ── Notifications ──
export async function callCreateNotification(data) {
  const result = await callable('createNotification')(data);
  return result.data;
}

// ── Trust ──
export async function callCreateTrustSignal(data) {
  const result = await callable('createTrustSignal')(data);
  return result.data;
}

export async function callDecideVerification(data) {
  const result = await callable('decideVerification')(data);
  return result.data;
}

// ── Business ──
export async function callAcceptInvitation(data) {
  const result = await callable('acceptInvitation')(data);
  return result.data;
}

// ── Users ──
export async function callFindUserByEmail(data) {
  const result = await callable('findUserByEmail')(data);
  return result.data;
}

export async function callResolveParticipants(data) {
  const result = await callable('resolveParticipants')(data);
  return result.data;
}

export async function callSetUserRole(data) {
  const result = await callable('setUserRole')(data);
  return result.data;
}

// ── Media migration (admin only) ──
export async function callMigrateMedia(data) {
  const result = await callable('migrateMedia')(data);
  return result.data;
}

// ── Media access (protected media signed URL) ──
// Returns a short-lived signed URL (15 min) after server-side
// source-domain authorization. Used for message attachments and
// verification evidence — prevents long-lived download URL sharing.
export async function callGetProtectedMediaUrl(data) {
  const result = await callable('getProtectedMediaUrl')(data);
  return result.data;
}

// ── Phase 5: Stripe Connect ──
export async function callCreateConnectAccount(data) {
  const result = await callable('createConnectAccount')(data);
  return result.data;
}

export async function callGetConnectAccountStatus(data) {
  const result = await callable('getConnectAccountStatus')(data);
  return result.data;
}

export async function callGetStripeConfig(data) {
  const result = await callable('getStripeConfig')(data);
  return result.data;
}

// ── Phase 5: Booking Payment ──
export async function callCreateBookingDraft(data) {
  const result = await callable('createBookingDraft')(data);
  return result.data;
}

export async function callCreatePaymentIntent(data) {
  const result = await callable('createPaymentIntent')(data);
  return result.data;
}

export async function callConfirmFreeBooking(data) {
  const result = await callable('confirmFreeBooking')(data);
  return result.data;
}

// ── Phase 5: Booking Lifecycle ──
export async function callCancelBooking(data) {
  const result = await callable('cancelBooking')(data);
  return result.data;
}

export async function callRescheduleBooking(data) {
  const result = await callable('rescheduleBooking')(data);
  return result.data;
}

export async function callReportNoShow(data) {
  const result = await callable('reportNoShow')(data);
  return result.data;
}

export async function callCompleteBooking(data) {
  const result = await callable('completeBooking')(data);
  return result.data;
}

// ── Professional Profile (public projection + screen_name uniqueness) ──
export async function callSaveProfessionalProfile(data) {
  const result = await callable('saveProfessionalProfile')(data);
  return result.data;
}

export async function callValidateScreenName(data) {
  const result = await callable('validateScreenName')(data);
  return result.data;
}

// ── Personal Profile (public projection + screen_name uniqueness) ──
export async function callSavePersonalProfile(data) {
  const result = await callable('savePersonalProfile')(data);
  return result.data;
}

export async function callValidatePersonalScreenName(data) {
  const result = await callable('validatePersonalScreenName')(data);
  return result.data;
}

// ── Business Profile (public projection) ──
export async function callSaveBusinessProfile(data) {
  const result = await callable('saveBusinessProfile')(data);
  return result.data;
}

// ── Relationship System — Connections ──
// A Connection is an explicit identity-to-identity relationship,
// separate from Messaging. All transitions are server-only.
export async function callCreateConnectionRequest(data) {
  const result = await callable('createConnectionRequest')(data);
  return result.data;
}

export async function callRespondConnectionRequest(data) {
  const result = await callable('respondConnectionRequest')(data);
  return result.data;
}

export async function callDisconnectConnection(data) {
  const result = await callable('disconnectConnection')(data);
  return result.data;
}

// Server-side Professional Profile access resolver. Enforces the
// public / connections / private visibility tiers using the
// authoritative Connection relationship.
export async function callResolveProfessionalAccess(data) {
  const result = await callable('resolveProfessionalAccess')(data);
  return result.data;
}