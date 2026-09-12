// Workout System — trusted Firebase Cloud Functions (Spec 12).
// ───────────────────────────────────────────────────────────
// The sole write path for Workout records (§9 Workout Identity Engine).
// Creates permanent workout identities, manages lifecycle (§15 Publication
// Engine), and enforces creator ownership. Reads are via the Firebase client
// SDK (public for published workouts, owner-filtered for drafts).

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, allowedOrigins, getIdentityId, hasBusinessWorkoutPermission, isBlocked, hasAcceptedConnection, resolveEmailsToIdentities } from './shared';
import { indexContentInline, unindexContentInline } from './searchIndex';

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

    // ── Creation authority (Spec 12 §9) ──
    // Personal profiles must NOT create workouts. Only professional
    // identities (professional_activated) or business members may create.
    if (business_id) {
      // Business workout — caller must have manage_workouts permission
      // (owner/admin by default, or staff/member with explicit grant).
      const allowed = await hasBusinessWorkoutPermission(business_id, identityId);
      if (!allowed) {
        throw new HttpsError('permission-denied', 'You need manage_workouts permission to create business workouts');
      }
    } else {
      // Identity workout — caller must be in Professional context AND have
      // a valid Professional activation state (Spec 12 §9). The canonical
      // activation rule mirrors the client: active_context === 'professional'
      // AND (professional_activated || professional_onboarding_status === 'active').
      const userDoc = await db.collection('users').doc(identityId).get();
      const userData = userDoc.exists ? userDoc.data() : null;
      const isProfessionallyActivated =
        !!userData?.professional_activated ||
        userData?.professional_onboarding_status === 'active';
      if (userData?.active_context !== 'professional' || !isProfessionallyActivated) {
        throw new HttpsError(
          'permission-denied',
          'Only Professional-context identities with an active Professional profile can create workouts',
        );
      }
    }

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
      const doc = await db.collection('workouts').doc(workout_id).get();
      if (!doc.exists) throw new HttpsError('not-found', 'Workout not found');
      const existing = doc.data()!;
      // Edit authority: business workouts → any active business member;
      // identity workouts → only the creator.
      if (existing.owner_type === 'business' && existing.business_id) {
        const allowed = await hasBusinessWorkoutPermission(existing.business_id, identityId);
        if (!allowed) {
          throw new HttpsError('permission-denied', 'You need manage_workouts permission to edit this business workout');
        }
      } else {
        if (existing.creator_identity_id !== identityId) {
          throw new HttpsError('permission-denied', 'Only the creator can edit this workout');
        }
      }
      // Ownership is immutable after creation — omit ownership fields
      // from the update payload so a client cannot change owner_type.
      const { owner_type, owner_id, operating_context, business_id: _biz, ...updatePayload } = payload;
      workoutRef = doc.ref;
      await workoutRef.update(updatePayload);
    } else {
      workoutRef = db.collection('workouts').doc();
      await workoutRef.set({
        ...payload,
        creator_identity_id: identityId,
        _created_date: now,
      });
    }

    // ── Cross-system search indexing (V2 §15.5) ──
    if (payload.lifecycle_state === 'published' && payload.visibility === 'public') {
      try {
        await indexContentInline(workoutRef.id, 'workout', {
          contentType: 'workout',
          title: payload.title,
          description: payload.description,
          tags: [payload.workout_type, payload.difficulty].filter(Boolean),
          ownerId: payload.owner_id,
          visibility: payload.visibility,
        });
      } catch (err) {
        console.error('search index failed for workout', workoutRef.id, err);
      }
    }

    return { id: workoutRef.id };
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
    const existing = doc.data()!;
    // Delete authority: business workouts → any active business member;
    // identity workouts → only the creator.
    if (existing.owner_type === 'business' && existing.business_id) {
      const allowed = await hasBusinessWorkoutPermission(existing.business_id, identityId);
      if (!allowed) {
        throw new HttpsError('permission-denied', 'You need manage_workouts permission to archive this business workout');
      }
    } else {
      if (existing.creator_identity_id !== identityId) {
        throw new HttpsError('permission-denied', 'Only the creator can archive this workout');
      }
    }
    await doc.ref.update({
      lifecycle_state: 'archived',
      _updated_date: new Date().toISOString(),
    });

    // Remove from search index (V2 §15.5)
    try {
      await unindexContentInline('workout', workout_id);
    } catch (err) {
      console.error('search unindex failed for workout', workout_id, err);
    }

    return { state: 'archived' };
  },
);

// ── shareWorkoutWithConnections ──────────────────────────────
// Targeted Workout share to specific accepted Connections (Spec 12).
// ───────────────────────────────────────────────────────────
// An authorised Professional or Business workout owner/manager can
// share a Workout directly with specific accepted connections. This
// is DISTINCT from:
//   - publicly available/published Workout (Feed/Directory discovery)
//   - saved Workout (Save entity)
//   - Business "My Workouts" aggregation (staff membership visibility)
//   - general Feed share/repost (Share Engine commentary shares)
//
// Authority mirrors the edit authority:
//   - identity workout → creator_identity_id === caller
//   - business workout → hasBusinessWorkoutPermission (manage_workouts)
//
// Recipients must have an accepted Connection with the sharer and no
// active block. Email is a lookup mechanism — emails that do not resolve
// to an existing identity are skipped (no external-invitation workflow
// is invented). Recipients receive an in-app notification with a direct
// link to the Workout.
export const shareWorkoutWithConnections = onCall(
  { region: 'europe-west2', cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const identityId = await getIdentityId(request.auth.uid);
    const { workout_id, recipient_identity_ids, recipient_emails } = request.data || {};

    if (!workout_id) throw new HttpsError('invalid-argument', 'workout_id required');

    // Load workout
    const workoutDoc = await db.collection('workouts').doc(workout_id).get();
    if (!workoutDoc.exists) throw new HttpsError('not-found', 'Workout not found');
    const workout = workoutDoc.data()!;

    // ── Authority (Spec 12 §9 + Business §8) ──
    if (workout.owner_type === 'business' && workout.business_id) {
      const allowed = await hasBusinessWorkoutPermission(workout.business_id, identityId);
      if (!allowed) {
        throw new HttpsError('permission-denied', 'You need manage_workouts permission to share this business workout');
      }
    } else {
      if (workout.creator_identity_id !== identityId) {
        throw new HttpsError('permission-denied', 'You can only share your own workouts');
      }
    }

    // Combine recipient identity IDs (pre-selected + email-resolved)
    const allRecipientIds = new Set<string>();
    if (Array.isArray(recipient_identity_ids)) {
      for (const id of recipient_identity_ids) {
        if (id && typeof id === 'string' && id !== identityId) allRecipientIds.add(id);
      }
    }
    if (Array.isArray(recipient_emails) && recipient_emails.length > 0) {
      const { resolved } = await resolveEmailsToIdentities(recipient_emails);
      for (const id of Object.values(resolved)) {
        if (id && id !== identityId) allRecipientIds.add(id);
      }
    }

    if (allRecipientIds.size === 0) {
      throw new HttpsError('invalid-argument', 'No eligible recipients selected');
    }

    // For each recipient: verify accepted connection + no block, then notify.
    const now = new Date().toISOString();
    let shared = 0;
    let skipped = 0;
    const skippedReasons: Array<{ identity_id: string; reason: string }> = [];

    for (const recipientId of allRecipientIds) {
      const blocked = await isBlocked(identityId, recipientId);
      if (blocked) {
        skipped++;
        skippedReasons.push({ identity_id: recipientId, reason: 'blocked' });
        continue;
      }
      const connected = await hasAcceptedConnection(identityId, recipientId);
      if (!connected) {
        skipped++;
        skippedReasons.push({ identity_id: recipientId, reason: 'not_a_connection' });
        continue;
      }
      try {
        await db.collection('notificationRecords').doc().set({
          recipient_id: recipientId,
          source_system: 'workout',
          event_type: 'workout_shared',
          title: 'Shared a workout with you',
          body: `${workout.title || 'A workout'} has been shared with you.`,
          category: 'workout',
          priority: 'normal',
          delivery_channels: ['in_app'],
          is_read: false,
          action_url: `/workouts/${workout_id}`,
          action_label: 'View Workout',
          source_id: workout_id,
          _created_date: now,
          _updated_date: now,
        });
        shared++;
      } catch (err) {
        console.error('Failed to create workout share notification:', err);
        skipped++;
        skippedReasons.push({ identity_id: recipientId, reason: 'notification_failed' });
      }
    }

    return { shared, skipped, skipped_reasons: skippedReasons };
  },
);