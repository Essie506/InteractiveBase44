// Workout System — trusted Firebase Cloud Functions (Spec 12).
// ───────────────────────────────────────────────────────────
// The sole write path for Workout records (§9 Workout Identity Engine).
// Creates permanent workout identities, manages lifecycle (§15 Publication
// Engine), and enforces creator ownership. Reads are via the Firebase client
// SDK (public for published workouts, owner-filtered for drafts).

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId } from './shared';

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
export const saveWorkout = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const identityId = await getIdentityId(request.auth.uid);
    const {
      workout_id, title, description, workout_type, difficulty,
      duration_minutes, exercises, media_url, cover_url,
      lifecycle_state, visibility, business_id, is_free, price_pence,
    } = request.data || {};

    if (!title || !title.trim()) throw new HttpsError('invalid-argument', 'Title required');
    if (!VALID_TYPES.includes(workout_type)) throw new HttpsError('invalid-argument', `Invalid workout type: ${workout_type}`);

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

    if (workout_id) {
      const doc = await db.collection('workouts').doc(workout_id).get();
      if (!doc.exists) throw new HttpsError('not-found', 'Workout not found');
      if (doc.data()?.creator_identity_id !== identityId) {
        throw new HttpsError('permission-denied', 'Only the creator can edit this workout');
      }
      await doc.ref.update(payload);
      return { id: workout_id };
    }

    const ref = db.collection('workouts').doc();
    await ref.set({
      ...payload,
      creator_identity_id: identityId,
      _created_date: now,
    });
    return { id: ref.id };
  },
);

// ── deleteWorkout ─────────────────────────────────────────────
// Soft-delete: archives the workout (§15). History preserved.
export const deleteWorkout = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const identityId = await getIdentityId(request.auth.uid);
    const { workout_id } = request.data || {};
    if (!workout_id) throw new HttpsError('invalid-argument', 'workout_id required');
    const doc = await db.collection('workouts').doc(workout_id).get();
    if (!doc.exists) throw new HttpsError('not-found', 'Workout not found');
    if (doc.data()?.creator_identity_id !== identityId) {
      throw new HttpsError('permission-denied', 'Only the creator can archive this workout');
    }
    await doc.ref.update({
      lifecycle_state: 'archived',
      _updated_date: new Date().toISOString(),
    });
    return { state: 'archived' };
  },
);