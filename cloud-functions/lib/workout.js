"use strict";
// Workout System — trusted Firebase Cloud Functions (Spec 12).
// ───────────────────────────────────────────────────────────
// The sole write path for Workout records (§9 Workout Identity Engine).
// Creates permanent workout identities, manages lifecycle (§15 Publication
// Engine), and enforces creator ownership. Reads are via the Firebase client
// SDK (public for published workouts, owner-filtered for drafts).
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteWorkout = exports.saveWorkout = void 0;
const https_1 = require("firebase-functions/v2/https");
const shared_1 = require("./shared");
const searchIndex_1 = require("./searchIndex");
const VALID_TYPES = [
    'individual', 'programme', 'training_plan', 'challenge', 'rehab',
    'mobility', 'stretching', 'yoga', 'pilates', 'cardio', 'strength',
    'sports_specific', 'educational', 'assessment', 'recovery',
];
const VALID_DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'all_levels'];
const VALID_LIFECYCLE = ['draft', 'published', 'archived', 'retired'];
// ── saveWorkout ──────────────────────────────────────────────
// Creates a new workout identity or updates an existing one.
// Creator is immutable after creation (§9).
exports.saveWorkout = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    const identityId = await (0, shared_1.getIdentityId)(request.auth.uid);
    const { workout_id, title, description, workout_type, difficulty, duration_minutes, exercises, media_url, cover_url, lifecycle_state, visibility, business_id, is_free, price_pence, } = request.data || {};
    if (!title || !title.trim())
        throw new https_1.HttpsError('invalid-argument', 'Title required');
    if (!VALID_TYPES.includes(workout_type))
        throw new https_1.HttpsError('invalid-argument', `Invalid workout type: ${workout_type}`);
    const now = new Date().toISOString();
    const ownerType = business_id ? 'business' : 'identity';
    const ownerId = business_id || identityId;
    const operatingContext = business_id ? 'business' : 'professional';
    const payload = {
        owner_type: ownerType,
        owner_id: ownerId,
        operating_context: operatingContext,
        business_id: business_id || null,
        title: title.trim().slice(0, 200),
        description: (description || '').trim().slice(0, 5000),
        workout_type,
        difficulty: VALID_DIFFICULTIES.includes(difficulty) ? difficulty : 'all_levels',
        duration_minutes: Math.max(1, Math.min(480, duration_minutes || 30)),
        exercises: Array.isArray(exercises)
            ? exercises
                .filter((e) => e && e.name && e.name.trim())
                .slice(0, 50)
                .map((e) => ({
                name: String(e.name).trim().slice(0, 200),
                description: String(e.description || '').trim().slice(0, 1000),
                sets: e.sets ? Number(e.sets) : null,
                reps: e.reps ? Number(e.reps) : null,
                duration_seconds: e.duration_seconds ? Number(e.duration_seconds) : null,
                rest_seconds: e.rest_seconds ? Number(e.rest_seconds) : null,
            }))
            : [],
        media_url: media_url || null,
        cover_url: cover_url || null,
        lifecycle_state: VALID_LIFECYCLE.includes(lifecycle_state) ? lifecycle_state : 'draft',
        visibility: visibility || 'public',
        is_free: is_free !== false,
        price_pence: is_free !== false ? 0 : Math.max(0, Math.round(Number(price_pence) || 0)),
        _updated_date: now,
    };
    let workoutRef;
    if (workout_id) {
        const doc = await shared_1.db.collection('workouts').doc(workout_id).get();
        if (!doc.exists)
            throw new https_1.HttpsError('not-found', 'Workout not found');
        if (doc.data()?.creator_identity_id !== identityId) {
            throw new https_1.HttpsError('permission-denied', 'Only the creator can edit this workout');
        }
        workoutRef = doc.ref;
        await workoutRef.update(payload);
    }
    else {
        workoutRef = shared_1.db.collection('workouts').doc();
        await workoutRef.set({
            ...payload,
            creator_identity_id: identityId,
            _created_date: now,
        });
    }
    // ── Cross-system search indexing (V2 §15.5) ──
    if (payload.lifecycle_state === 'published' && payload.visibility === 'public') {
        try {
            await (0, searchIndex_1.indexContentInline)(workoutRef.id, 'workout', {
                contentType: 'workout',
                title: payload.title,
                description: payload.description,
                tags: [payload.workout_type, payload.difficulty].filter(Boolean),
                ownerId: payload.owner_id,
                visibility: payload.visibility,
            });
        }
        catch (err) {
            console.error('search index failed for workout', workoutRef.id, err);
        }
    }
    return { id: workoutRef.id };
});
// ── deleteWorkout ─────────────────────────────────────────────
// Soft-delete: archives the workout (§15). History preserved.
exports.deleteWorkout = (0, https_1.onCall)({ region: 'europe-west2', cors: shared_1.allowedOrigins }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    const identityId = await (0, shared_1.getIdentityId)(request.auth.uid);
    const { workout_id } = request.data || {};
    if (!workout_id)
        throw new https_1.HttpsError('invalid-argument', 'workout_id required');
    const doc = await shared_1.db.collection('workouts').doc(workout_id).get();
    if (!doc.exists)
        throw new https_1.HttpsError('not-found', 'Workout not found');
    if (doc.data()?.creator_identity_id !== identityId) {
        throw new https_1.HttpsError('permission-denied', 'Only the creator can archive this workout');
    }
    await doc.ref.update({
        lifecycle_state: 'archived',
        _updated_date: new Date().toISOString(),
    });
    // Remove from search index (V2 §15.5)
    try {
        await (0, searchIndex_1.unindexContentInline)('workout', workout_id);
    }
    catch (err) {
        console.error('search unindex failed for workout', workout_id, err);
    }
    return { state: 'archived' };
});
//# sourceMappingURL=workout.js.map