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
export { findUserByEmail, resolveParticipants } from './users';
export { migrateMedia, getProtectedMediaUrl } from './media';