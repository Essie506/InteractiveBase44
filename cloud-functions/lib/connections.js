"use strict";
// Relationship System — Connections
// ───────────────────────────────────────────────────────────
// A dedicated identity-to-identity relationship system, SEPARATE from
// Messaging. A Connection represents explicit relationship intent
// between two Interactive identities. A Connection can permit
// communication, but a messaging thread must NEVER implicitly create
// a Connection.
//
// Lifecycle:
//   Connect    → pending connectionRequest (NO conversation created)
//   Accept     → request accepted + canonical connections/{pairId} active
//   Decline    → request declined, no Connection created
//   Disconnect → connections status → disconnected
//   Block      → existing blockRecords remains authoritative; an active
//                block in either direction prevents Connection-based access
//
// Canonical Connection doc ID: sorted [identityA, identityB].join('__')
// so there is at most one Connection relationship per identity pair.
//
// Profile access (resolveProfessionalAccess) uses hasAcceptedConnection
// (this module's helper in shared.ts) — never conversations or messages.
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveConnectionStatuses = exports.resolveConnectionStatus = exports.resolveProfessionalAccess = exports.disconnectConnection = exports.respondConnectionRequest = exports.createConnectionRequest = void 0;
const https_1 = require("firebase-functions/v2/https");
const crypto_1 = require("crypto");
const shared_1 = require("./shared");
const professionalProfile_1 = require("./professionalProfile");
const REQUESTS = 'connectionRequests';
const CONNECTIONS = 'connections';
const PROFILES = 'professionalProfiles';
const PUBLIC = 'professionalProfilesPublic';
// ── createConnectionRequest ─────────────────────────────────
// Request: { target_id, requester_context?, request_message? }
// Returns: { status: 'pending' | 'already_connected', request_id?, connection_id? }
exports.createConnectionRequest = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const requesterId = await (0, shared_1.getIdentityId)(request.auth.uid);
    const { target_id, requester_context = 'personal', request_message = null } = request.data || {};
    if (!target_id) {
        throw new https_1.HttpsError('invalid-argument', 'target_id is required');
    }
    if (target_id === requesterId) {
        throw new https_1.HttpsError('invalid-argument', 'Cannot connect to yourself');
    }
    // Block check (either direction) — a block prevents a connection request.
    const blocked = await (0, shared_1.isBlocked)(requesterId, target_id);
    if (blocked) {
        throw new https_1.HttpsError('permission-denied', 'Cannot request connection — blocking relationship exists');
    }
    const pairId = (0, shared_1.connectionPairId)(requesterId, target_id);
    // Already connected? Return the existing active connection.
    const existingConn = await shared_1.db.collection(CONNECTIONS).doc(pairId).get();
    if (existingConn.exists && existingConn.data().status === 'active') {
        return { status: 'already_connected', connection_id: pairId };
    }
    // Idempotent: an existing pending request from requester → target is returned as-is.
    const existingPending = await shared_1.db.collection(REQUESTS)
        .where('requester_id', '==', requesterId)
        .where('target_id', '==', target_id)
        .where('status', '==', 'pending')
        .limit(1)
        .get();
    if (!existingPending.empty) {
        return { status: 'pending', request_id: existingPending.docs[0].id, already_pending: true };
    }
    const now = new Date().toISOString();
    const requestId = (0, crypto_1.randomUUID)();
    await shared_1.db.collection(REQUESTS).doc(requestId).set({
        requester_id: requesterId,
        target_id: target_id,
        status: 'pending',
        requester_context,
        requested_at: now,
        responded_at: null,
        request_message: request_message || null,
        _created_date: now,
        _updated_date: now,
    });
    // Notify the target (failure isolated — does not undo the request)
    try {
        await shared_1.db.collection('notificationRecords').doc().set({
            recipient_id: target_id,
            source_system: 'system',
            event_type: 'connection_request_received',
            title: 'New Connection Request',
            body: request_message || 'You have a new connection request.',
            category: 'system',
            priority: 'normal',
            delivery_channels: ['in_app'],
            is_read: false,
            source_id: requestId,
            _created_date: now,
            _updated_date: now,
        });
    }
    catch { /* notification failure does not affect the request */ }
    return { status: 'pending', request_id: requestId };
});
// ── respondConnectionRequest ───────────────────────────────
// Request: { request_id, response: 'accept' | 'decline' }
// Only the target of the request may respond. Accept creates the
// canonical active Connection atomically with the request transition.
exports.respondConnectionRequest = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const callerId = await (0, shared_1.getIdentityId)(request.auth.uid);
    const { request_id, response: action } = request.data || {};
    if (!request_id || !['accept', 'decline'].includes(action)) {
        throw new https_1.HttpsError('invalid-argument', 'request_id and response (accept|decline) required');
    }
    const reqRef = shared_1.db.collection(REQUESTS).doc(request_id);
    const reqDoc = await reqRef.get();
    if (!reqDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Connection request not found');
    }
    const reqData = reqDoc.data();
    if (reqData.status !== 'pending') {
        throw new https_1.HttpsError('failed-precondition', 'Connection request is not pending');
    }
    // Only the target can respond — requester cannot self-accept.
    if (reqData.target_id !== callerId) {
        throw new https_1.HttpsError('permission-denied', 'Only the recipient can respond to a connection request');
    }
    const now = new Date().toISOString();
    const pairId = (0, shared_1.connectionPairId)(reqData.requester_id, reqData.target_id);
    if (action === 'accept') {
        // Atomically: accept the request + upsert the canonical connection.
        await shared_1.db.runTransaction(async (tx) => {
            const snap = await tx.get(reqRef);
            if (snap.data().status !== 'pending') {
                throw new https_1.HttpsError('failed-precondition', 'Connection request is no longer pending');
            }
            tx.update(reqRef, { status: 'accepted', responded_at: now, _updated_date: now });
            const connRef = shared_1.db.collection(CONNECTIONS).doc(pairId);
            const connSnap = await tx.get(connRef);
            const [a, b] = [reqData.requester_id, reqData.target_id].sort();
            tx.set(connRef, {
                identity_a_id: a,
                identity_b_id: b,
                status: 'active',
                established_at: now,
                disconnected_at: null,
                source_request_id: request_id,
                _created_date: connSnap.exists ? (connSnap.data()?._created_date || now) : now,
                _updated_date: now,
            });
        });
        // Notify the requester (failure isolated)
        try {
            await shared_1.db.collection('notificationRecords').doc().set({
                recipient_id: reqData.requester_id,
                source_system: 'system',
                event_type: 'connection_accepted',
                title: 'Connection Accepted',
                body: 'Your connection request was accepted.',
                category: 'system',
                priority: 'normal',
                delivery_channels: ['in_app'],
                is_read: false,
                source_id: request_id,
                _created_date: now,
                _updated_date: now,
            });
        }
        catch { /* notification failure does not undo the connection */ }
        return { request_id, status: 'accepted', connection_id: pairId };
    }
    // decline
    await reqRef.update({ status: 'declined', responded_at: now, _updated_date: now });
    return { request_id, status: 'declined' };
});
// ── disconnectConnection ────────────────────────────────────
// Request: { target_id }
// Either participant may disconnect. Transitions the canonical
// connection to 'disconnected'. Idempotent if already disconnected.
exports.disconnectConnection = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const callerId = await (0, shared_1.getIdentityId)(request.auth.uid);
    const { target_id } = request.data || {};
    if (!target_id) {
        throw new https_1.HttpsError('invalid-argument', 'target_id is required');
    }
    const pairId = (0, shared_1.connectionPairId)(callerId, target_id);
    const connRef = shared_1.db.collection(CONNECTIONS).doc(pairId);
    const connDoc = await connRef.get();
    if (!connDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Connection not found');
    }
    const conn = connDoc.data();
    if (conn.identity_a_id !== callerId && conn.identity_b_id !== callerId) {
        throw new https_1.HttpsError('permission-denied', 'Only a participant can disconnect a connection');
    }
    if (conn.status === 'disconnected') {
        return { connection_id: pairId, status: 'disconnected' };
    }
    const now = new Date().toISOString();
    await connRef.update({ status: 'disconnected', disconnected_at: now, _updated_date: now });
    return { connection_id: pairId, status: 'disconnected' };
});
// ── resolveProfessionalAccess ───────────────────────────────
// Server-side Professional Profile access resolver.
// Enforces the three visibility tiers (public / connections / private)
// using the authoritative Connection relationship — never conversations.
//
// Returns only the public-safe representation to a Connection; the owner
// receives the same public-safe representation with is_owner=true so the
// public view renders consistently and the owner gets an "Edit profile"
// entry point to the authoritative editor.
//
// Request: { screen_name }
// Returns: { access: 'owner'|'public'|'connection'|'denied'|'not_found', profile, is_owner }
exports.resolveProfessionalAccess = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    const rawScreenName = request.data?.screen_name;
    const screenName = rawScreenName ? String(rawScreenName).toLowerCase().trim() : null;
    if (!screenName) {
        throw new https_1.HttpsError('invalid-argument', 'screen_name is required');
    }
    // Resolve caller identity (optional — public access for signed-out visitors)
    let callerId = null;
    if (request.auth) {
        try {
            callerId = await (0, shared_1.getIdentityId)(request.auth.uid);
        }
        catch {
            callerId = null;
        }
    }
    // 1. Try the public projection first (public-read, public-safe fields)
    const pubDoc = await shared_1.db.collection(PUBLIC).doc(screenName).get();
    if (pubDoc.exists) {
        const pubData = pubDoc.data();
        if (callerId && pubData.identity_id === callerId) {
            return { access: 'owner', profile: { id: pubDoc.id, ...pubData }, is_owner: true };
        }
        return { access: 'public', profile: { id: pubDoc.id, ...pubData }, is_owner: false };
    }
    // 2. No public projection — read the private profile by screen_name (admin SDK).
    //    A connection/private profile has no public projection, so only the server
    //    can resolve it and enforce access tiers.
    const privateSnap = await shared_1.db.collection(PROFILES)
        .where('screen_name', '==', screenName)
        .limit(1)
        .get();
    if (privateSnap.empty) {
        return { access: 'not_found', profile: null, is_owner: false };
    }
    const profileId = privateSnap.docs[0].id;
    const profileData = privateSnap.docs[0].data();
    const ownerId = profileData.identity_id;
    // Owner — return the public-safe representation with is_owner=true.
    if (callerId && ownerId === callerId) {
        return {
            access: 'owner',
            profile: (0, professionalProfile_1.buildPublicProjection)(ownerId, profileId, profileData, null),
            is_owner: true,
        };
    }
    const visibility = profileData.visibility || 'public';
    const lifecycle = profileData.lifecycle_state || 'draft';
    // Draft / archived profiles are not viewable by anyone except the owner.
    if (lifecycle !== 'active') {
        return { access: 'denied', profile: null, is_owner: false };
    }
    if (visibility === 'public') {
        // Projection missing but profile is public — rebuild the public representation.
        return {
            access: 'public',
            profile: (0, professionalProfile_1.buildPublicProjection)(ownerId, profileId, profileData, null),
            is_owner: false,
        };
    }
    const directoryVisibility = profileData.directory_visibility || 'unlisted';
    if (visibility === 'connections') {
        if (!callerId) {
            // Signed-out visitor: restricted advert if listed, else denied.
            if (directoryVisibility === 'listed') {
                return { access: 'restricted', profile: (0, professionalProfile_1.buildDirectoryEntry)(ownerId, profileId, profileData, null), is_owner: false };
            }
            return { access: 'denied', profile: null, is_owner: false };
        }
        const connected = await (0, shared_1.hasAcceptedConnection)(callerId, ownerId);
        if (connected) {
            return {
                access: 'connection',
                profile: (0, professionalProfile_1.buildPublicProjection)(ownerId, profileId, profileData, null),
                is_owner: false,
            };
        }
        // Non-connection: restricted advert if listed, else denied.
        if (directoryVisibility === 'listed') {
            return { access: 'restricted', profile: (0, professionalProfile_1.buildDirectoryEntry)(ownerId, profileId, profileData, null), is_owner: false };
        }
        return { access: 'denied', profile: null, is_owner: false };
    }
    // private — owner only (already handled above). A listed private
    // profile still publishes a discovery advert to everyone else; an
    // unlisted private profile is denied to everyone except the owner.
    if (directoryVisibility === 'listed') {
        return { access: 'restricted', profile: (0, professionalProfile_1.buildDirectoryEntry)(ownerId, profileId, profileData, null), is_owner: false };
    }
    return { access: 'denied', profile: null, is_owner: false };
});
// ── resolveConnectionStatus ─────────────────────────────────
// Server-side relationship-status read for Connect/Pending/Connected
// UI states. The frontend must NOT infer relationship state from
// conversations or raw collection queries. Returns a semantic state:
//   self | blocked | connected | pending_outgoing | pending_incoming
//   | disconnected | none
//
// An active block in either direction overrides every other state and
// returns 'blocked' — the Connect action must be unavailable.
//
// Request: { target_id }
// Returns: { status }
exports.resolveConnectionStatus = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const callerId = await (0, shared_1.getIdentityId)(request.auth.uid);
    const { target_id } = request.data || {};
    if (!target_id) {
        throw new https_1.HttpsError('invalid-argument', 'target_id is required');
    }
    const map = await computeStatusMap(callerId, [target_id]);
    return { status: map[target_id] || 'none' };
});
// ── resolveConnectionStatuses ───────────────────────────────
// Batch relationship-status read — used by the Directory to resolve
// Connect/Pending/Connected states for many professional cards in a
// single call (avoids N round-trips). Uses a small fixed set of
// single-field queries (auto-indexed by Firestore) and resolves the
// per-target state in memory.
//
// Request: { target_ids: string[] }
// Returns: { statuses: Record<target_id, status> }
exports.resolveConnectionStatuses = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const callerId = await (0, shared_1.getIdentityId)(request.auth.uid);
    const targetIds = Array.isArray(request.data?.target_ids) ? request.data.target_ids : [];
    if (targetIds.length === 0) {
        return { statuses: {} };
    }
    const statuses = await computeStatusMap(callerId, targetIds);
    return { statuses };
});
// ── computeStatusMap (shared by single + batch) ─────────────
// Performs a fixed set of single-field queries (no composite indexes
// required) and resolves the semantic status for each target_id in
// memory. Status priority: blocked > connected > pending_outgoing >
// pending_incoming > disconnected > none.
async function computeStatusMap(callerId, targetIds) {
    const [outgoingSnap, incomingSnap, connASnap, connBSnap, blockOutSnap, blockInSnap] = await Promise.all([
        shared_1.db.collection(REQUESTS).where('requester_id', '==', callerId).get(),
        shared_1.db.collection(REQUESTS).where('target_id', '==', callerId).get(),
        shared_1.db.collection(CONNECTIONS).where('identity_a_id', '==', callerId).get(),
        shared_1.db.collection(CONNECTIONS).where('identity_b_id', '==', callerId).get(),
        shared_1.db.collection('blockRecords').where('blocker_id', '==', callerId).get(),
        shared_1.db.collection('blockRecords').where('blocked_id', '==', callerId).get(),
    ]);
    const outgoingPending = new Set(outgoingSnap.docs
        .map((d) => d.data())
        .filter((d) => d.status === 'pending')
        .map((d) => d.target_id));
    const incomingPending = new Set(incomingSnap.docs
        .map((d) => d.data())
        .filter((d) => d.status === 'pending')
        .map((d) => d.requester_id));
    const connStatus = new Map();
    for (const doc of [...connASnap.docs, ...connBSnap.docs]) {
        const data = doc.data();
        const other = data.identity_a_id === callerId ? data.identity_b_id : data.identity_a_id;
        connStatus.set(other, data.status);
    }
    const blockedByCaller = new Set(blockOutSnap.docs.map((d) => d.data().blocked_id));
    const blockedCaller = new Set(blockInSnap.docs.map((d) => d.data().blocker_id));
    const results = {};
    for (const tid of targetIds) {
        if (tid === callerId) {
            results[tid] = 'self';
            continue;
        }
        if (blockedByCaller.has(tid) || blockedCaller.has(tid)) {
            results[tid] = 'blocked';
            continue;
        }
        const cs = connStatus.get(tid);
        if (cs === 'active') {
            results[tid] = 'connected';
            continue;
        }
        if (outgoingPending.has(tid)) {
            results[tid] = 'pending_outgoing';
            continue;
        }
        if (incomingPending.has(tid)) {
            results[tid] = 'pending_incoming';
            continue;
        }
        if (cs === 'disconnected') {
            results[tid] = 'disconnected';
            continue;
        }
        results[tid] = 'none';
    }
    return results;
}
//# sourceMappingURL=connections.js.map