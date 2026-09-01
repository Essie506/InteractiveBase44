// Connection Service — Relationship System
// ───────────────────────────────────────────────────────────
// Client-side wrappers for the Connection relationship Cloud Functions.
// A Connection is an explicit identity-to-identity relationship, SEPARATE
// from Messaging. Pressing "Connect" creates a connectionRequest — it does
// NOT create a conversation. Communication is owned by the Messaging System.
//
// All relationship state transitions are server-only (Firestore rules deny
// client writes to connectionRequests / connections). These wrappers call
// the trusted Cloud Functions, which enforce:
//   - self-connect prevention
//   - block-state checks
//   - idempotent pending requests
//   - only-the-target-can-respond
//   - canonical connection creation on accept

import {
  callCreateConnectionRequest,
  callRespondConnectionRequest,
  callDisconnectConnection,
  callResolveConnectionStatus,
  callResolveConnectionStatuses,
} from '@/services/firebaseFunctions';

// Create a pending connection request to target_id.
// Returns { status: 'pending' | 'already_connected', request_id?, connection_id? }
export async function createConnectionRequest({ target_id, requester_context, request_message } = {}) {
  return callCreateConnectionRequest({ target_id, requester_context, request_message });
}

// Accept or decline a connection request. Only the target may respond.
export async function respondConnectionRequest({ request_id, response }) {
  return callRespondConnectionRequest({ request_id, response });
}

// Disconnect an existing connection. Either participant may disconnect.
export async function disconnectConnection({ target_id }) {
  return callDisconnectConnection({ target_id });
}

// Resolve the semantic relationship status for a single target.
// Returns { status } where status is one of:
//   self | blocked | connected | pending_outgoing | pending_incoming
//   | disconnected | none
// Respects active blocks (returns 'blocked'). The frontend must use
// this — never infer state from conversations or raw queries.
export async function resolveConnectionStatus({ target_id } = {}) {
  return callResolveConnectionStatus({ target_id });
}

// Batch relationship-status read for Directory cards.
// Returns { statuses: { [target_id]: status } }.
export async function resolveConnectionStatuses({ target_ids } = {}) {
  return callResolveConnectionStatuses({ target_ids });
}