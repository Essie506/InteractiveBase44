# Workout System (Spec 12) — Conformance & Gap Report

**Specification:** Interactive Workout System Specification v2.0 (Spec 12)
**Date:** 2026-09-12
**Scope:** Targeted Workout Sharing (§9), Business Permission Taxonomy (§9 + Business §8), Creator Attribution, Lifecycle & Discovery

---

## Summary

This report documents the conformance of the Workout System's targeted sharing
feature against Spec 12, the Business permission taxonomy, and the cross-system
creator-attribution model. The implementation routes all mutations through
canonical server-side Cloud Functions; the client is a presentation + UI-gating
layer only. All tests pass (7 new share-authority + 20 existing business-permission),
the cloud-functions TypeScript build is clean, and the Vite client build succeeds.

---

## 1. Targeted Workout Sharing (Spec 12 §9)

| Requirement | Implementation | Status |
|---|---|---|
| Share to specific accepted connections (not Feed broadcast) | `shareWorkoutWithConnections` Cloud Function — resolves recipients by identity ID or email, verifies accepted Connection + non-blocked, delivers in-app notification with direct workout link | ✅ |
| Server-side authority enforcement | Function re-checks creator/owner authority authoritatively; UI gating is defence-in-depth only | ✅ |
| Recipient eligibility (accepted connection, not blocked) | Server resolves Connection status + BlockRecord before delivering notification; ineligible recipients skipped with reason | ✅ |
| Email-based recipient resolution | `recipient_emails` resolved to identities at share time; unresolved emails preserved for future delivery, never granted access | ✅ |
| Notification delivery | `createNotification` Cloud Function writes NotificationRecord with `target_system: 'workout'`, `target_id`, and a deep-link action_url | ✅ |
| Distinct from Share Engine (Spec 14) | Workout share is a direct notification, not a Share record — Spec 14 Share Engine is for Feed/content resharing | ✅ |

### UI Authority Gating (defence-in-depth)

| Viewer | Workout ownership | Share control visible | Verified |
|---|---|---|---|
| Professional creator | identity, creator === user | ✅ Yes | ✅ test |
| Unrelated authenticated user | identity, creator !== user | ❌ No | ✅ test |
| Business owner/admin | business, has manage_workouts | ✅ Yes | ✅ test |
| Business staff (no manage_workouts) | business, creator but staff role | ❌ No | ✅ test |
| Unauthenticated | any | ❌ No | ✅ test |
| Permission check error | business | ❌ No (fail-safe) | ✅ test |

---

## 2. Business Permission Taxonomy (Spec 12 §9 + Business §8)

| Requirement | Implementation | Status |
|---|---|---|
| `manage_workouts` permission exists | `ROLE_PERMISSIONS` in `businessPermissions.js`: owner + admin include it; staff + member do not by default | ✅ |
| Explicit grant override | `hasPermission` checks explicit `permissions[]` array on membership before falling back to role defaults | ✅ |
| Business "My Workouts" aggregation | `listBusinessMyWorkouts`: business-owned (owner_id == businessId) + active staff professional workouts, deduplicated by id | ✅ |
| Ownership never rewritten | Staff professional workouts retain `owner_type: 'identity'`; aggregation is read-only | ✅ test |
| Inactive staff excluded | Only `getActiveMemberships` results drive staff aggregation; ended membership → workouts disappear without modification | ✅ test |

---

## 3. Creator Attribution (Spec 12 §9 + Data Arch §13)

| Requirement | Implementation | Status |
|---|---|---|
| Immutable creator | `creator_identity_id` set on create, never overwritten by later editors | ✅ |
| Live profile projection (no snapshot) | `WorkoutCreatorBadge` / `WorkoutCreatorAttribution` resolve display name/avatar live from professional profile projection via `creator_identity_id` | ✅ |
| Business-owned workout distinct creator | A business workout can have `creator_identity_id` (staff) ≠ `owner_id` (business) | ✅ test |
| Identity-owned workout creator === owner | Enforced server-side in `saveWorkout` | ✅ test |

---

## 4. Lifecycle & Discovery (Spec 12 §15)

| Requirement | Implementation | Status |
|---|---|---|
| Lifecycle states (draft → published → archived → retired) | `lifecycle_state` enum on Workout entity; `saveWorkout` validates transitions | ✅ |
| Drafts private, published discoverable | `listPublishedWorkouts` filters `lifecycle_state == 'published' && visibility == 'public'` | ✅ |
| Search index sync | `searchIndex.ts` updated on publish/unpublish; archived/retired removed from index | ✅ |
| Visibility tiers (public/connections/private) | `visibility` field enforced by Firestore rules + client query filters | ✅ |

---

## 5. Known Gaps & Operational Steps

| Item | Status | Action |
|---|---|---|
| `shareWorkoutWithConnections` deployment | Code complete, not yet deployed | Scoped Firebase Function deploy required |
| `listMyConnections` deployment | Code complete, not yet deployed | Scoped deploy (recipient picker data source) |
| Professional specialisms/session types taxonomy backfill | Pending | One-time backfill script (`professionalBackfill.ts`) |
| `getInteractionState` CORS fix | Server implementation verified, not deployed | Scoped deploy to verify cross-origin callable |
| Stale post-author identity (6a7b4765…) | Distinct user; repair not possible | Documented; no action |
| Stripe Price IDs for 5 paid plans | Pending | Populate before live subscription activation |
| `RESEND_API_KEY` secret | Missing in Firebase project | Required for email notification delivery |

---

## 6. Verification Summary

| Check | Result |
|---|---|
| Cloud Functions `tsc --noEmit` | ✅ Clean compile |
| Vite client build | ✅ Succeeds |
| `tests/workout-share-authority.test.cjs` (7 tests) | ✅ 7 passed, 0 failed |
| `tests/workout-business-permissions.test.cjs` (20 tests) | ✅ 20 passed, 0 failed |
| Firestore rules (workout share path) | ✅ Reviewed — writes via Cloud Functions only; direct client writes denied |

---

## 7. Architectural Decisions (Workout Sharing)

1. **Server-authoritative sharing:** The Cloud Function is the sole authority for
   who may share and who receives. UI `canEdit` gating prevents the Share button
   from appearing for unauthorized users, but the server re-checks independently.

2. **Connection-based, not Feed-based:** Targeted sharing uses in-app notifications
   tied to the existing Connection relationship — distinct from the Share Engine
   (Spec 14), which creates Share records for Feed re-distribution.

3. **Email as discovery, not ownership:** Unresolved recipient emails are stored
   for future delivery but never granted access. Email is a discovery/invitation
   mechanism, not an ownership key (consistent with Calendar §3).

4. **Fail-safe permission errors:** Any error in the `checkPermission` path
   defaults to `canEdit = false` — the user sees no Share control rather than
   an erroneously enabled one.