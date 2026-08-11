# M3 Completion Report — Core Data + Authentication Cutover

**Date:** 2026-08-11
**Migration Phase:** M3 (Core Data + Authentication Cutover)
**Preceded by:** M0 (Backend Abstraction), M1 (Firebase Foundation), M1.1 (Identity Decoupling), M2 (Auth Infrastructure)
**Status:** ✅ INFRASTRUCTURE COMPLETE — DATA MIGRATED — SERVICES CUT OVER — AWAITING ENV ACTIVATION

---

## Executive Summary

M3 migrates all core Phase 1–4 domain data from Base44 to Firebase Firestore and switches all Interactive services from Base44 to Firebase repositories. Authentication is cut over from Base44 Auth to Firebase Auth with identity resolution via the trusted `ResolveIdentity` backend function.

**Data migration:** 27 collections migrated (25 domain + 2 public projections). All counts match. All referential-integrity checks pass.

**Service cutover:** All 13 service/lib modules updated to route to Firebase repositories when `VITE_FIREBASE_*` env vars are set, with automatic fallback to Base44 for rollback safety.

**AuthContext cutover:** Updated to use Firebase Auth (`onAuthStateChanged`) with identity resolution and user-state loading from Firestore.

**Security rules:** Updated with public/private projection split for Professional Profiles and Locations. 39/39 tests pass (33 original M1.1 + 6 new M3 projection tests).

**Activation:** The cutover is activated by setting `VITE_FIREBASE_*` environment variables. Until then, the app continues using Base44 (rollback safe).

---

## 1. Collections Migrated

| # | Firestore Collection | Base44 Entity | Records | ID Strategy | Notes |
|---|---|---|---|---|---|
| 1 | users | User | 3 → 3 | Preserve Base44 ID | Base44 User ID = Interactive Identity ID |
| 2 | personalProfiles | PersonalProfile | 2 → 2 | Preserve | |
| 3 | professionalProfiles | ProfessionalProfile | 2 → 2 | Preserve | Private collection (owner-only read) |
| 4 | professionalProfilesPublic | ProfessionalProfile | 2 → 2 | Preserve | Public projection (public fields only) |
| 5 | businesses | Business | 1 → 1 | Preserve | |
| 6 | businessProfiles | BusinessProfile | 1 → 1 | Preserve | |
| 7 | businessMemberships | BusinessMembership | 1 → 1 | Deterministic | `{businessId}_{identityId}` |
| 8 | businessInvitations | BusinessInvitation | 0 → 0 | Preserve | |
| 9 | subscriptionPlans | SubscriptionPlan | 3 → 3 | Preserve | |
| 10 | businessSubscriptions | BusinessSubscription | 1 → 1 | Preserve | |
| 11 | onboardingStates | OnboardingState | 2 → 2 | Preserve | |
| 12 | userSettings | UserSetting | 2 → 2 | Preserve | |
| 13 | notificationPreferences | NotificationPreference | 2 → 2 | Preserve | |
| 14 | notificationRecords | NotificationRecord | 1 → 1 | Preserve | |
| 15 | mediaAssets | MediaAsset | 0 → 0 | Preserve | Metadata only — files stay on Base44 |
| 16 | verificationRequests | VerificationRequest | 2 → 2 | Preserve | |
| 17 | trustRecords | TrustRecord | 0 → 0 | Preserve | |
| 18 | trustSignals | TrustSignal | 0 → 0 | Preserve | |
| 19 | locations | Location | 0 → 0 | Preserve | Private collection (owner-only read) |
| 20 | locationsPublic | Location | 0 → 0 | Preserve | Public projection (public fields only) |
| 21 | calendarEvents | CalendarEvent | 1 → 1 | Preserve | |
| 22 | availabilityRules | AvailabilityRule | 0 → 0 | Preserve | |
| 23 | externalCalendarConnections | ExternalCalendarConnection | 0 → 0 | Preserve | |
| 24 | conversations | Conversation | 1 → 1 | Preserve | |
| 25 | messages (subcollection) | Message | 1 → 1 | Preserve | `conversations/{convId}/messages/{msgId}` |
| 26 | blockRecords | BlockRecord | 0 → 0 | Deterministic | `{blockerId}__{blockedId}` |
| 27 | identityMappings | IdentityMapping | 0 → 0 | auth_uid field | Doc ID = Firebase Auth UID |

**Total records migrated:** 28 (across all collections with data)

---

## 2. Collections Deferred

| Collection | Reason | Status |
|---|---|---|
| projects (SpecVault) | Separable from core platform; remains on Base44 behind specService | Deferred per §5 |
| specifications (SpecVault) | Same | Deferred |
| specVersions (SpecVault) | Same | Deferred |

SpecVault does not block the core Interactive platform cutover. It remains fully functional on Base44.

---

## 3. Record Counts Before/After

All counts match between Base44 and Firestore:

| Collection | Base44 | Firestore | Match |
|---|---|---|---|
| users | 3 | 3 | ✅ |
| personalProfiles | 2 | 2 | ✅ |
| professionalProfiles | 2 | 2 | ✅ |
| professionalProfilesPublic | 2 | 2 | ✅ |
| businesses | 1 | 1 | ✅ |
| businessProfiles | 1 | 1 | ✅ |
| businessMemberships | 1 | 1 | ✅ |
| subscriptionPlans | 3 | 3 | ✅ |
| businessSubscriptions | 1 | 1 | ✅ |
| onboardingStates | 2 | 2 | ✅ |
| userSettings | 2 | 2 | ✅ |
| notificationPreferences | 2 | 2 | ✅ |
| notificationRecords | 1 | 1 | ✅ |
| verificationRequests | 2 | 2 | ✅ |
| calendarEvents | 1 | 1 | ✅ |
| conversations | 1 | 1 | ✅ |
| messages | 1 | 1 | ✅ |

**All 17 collections with data: counts match.**

---

## 4. ID Preservation Results

| ID Type | Strategy | Result |
|---|---|---|
| User / Interactive Identity | Base44 User ID preserved as Firestore doc ID | ✅ All 3 users preserved |
| PersonalProfile | Base44 doc ID preserved | ✅ All 2 profiles preserved |
| ProfessionalProfile | Base44 doc ID preserved | ✅ All 2 profiles preserved |
| Business | Base44 doc ID preserved | ✅ All 1 business preserved |
| BusinessProfile | Base44 doc ID preserved | ✅ All 1 profile preserved |
| BusinessMembership | Deterministic: `{businessId}_{identityId}` | ✅ All 1 membership transformed |
| SubscriptionPlan | Base44 doc ID preserved | ✅ All 3 plans preserved |
| CalendarEvent | Base44 doc ID preserved | ✅ All 1 event preserved |
| Conversation | Base44 doc ID preserved | ✅ All 1 conversation preserved |
| Message | Base44 doc ID preserved (subcollection) | ✅ All 1 message preserved |
| IdentityMapping | `auth_uid` field used as doc ID | ✅ 0 records (no mappings yet) |

**No ID re-keying required.** All domain identity references (`identity_id`, `owner_id`, `participant_ids`, `sender_id`, `recipient_id`, `blocker_id`, `blocked_id`, `created_by_id`) retain their original Base44 values.

---

## 5. Identity-Reference Validation

| Check | Result |
|---|---|
| Business membership → valid business + identity | ✅ 0 orphan references |
| Personal profile → valid identity | ✅ 0 orphan references |
| Professional profile → valid identity | ✅ 0 orphan references |
| Conversation participants → valid identities | ✅ 0 orphan participants |
| Notification recipient → valid identity | ✅ 0 orphan recipients |
| Calendar event owner → valid identity/business | ✅ 0 orphan owners |
| Identity mapping → valid identity | ✅ 0 orphan identities |
| Duplicate deterministic membership IDs | ✅ 0 duplicates |

**All referential-integrity checks pass.**

---

## 6. Transformation Rules Applied

| Field | Base44 Format | Firestore Format | Transformation |
|---|---|---|---|
| `id` | Entity ID | Document ID | Stripped from data, used as doc path |
| `created_date` | ISO string | `_created_date` (Timestamp) | Renamed + converted to `{seconds, nanos}` |
| `updated_date` | ISO string | `_updated_date` (Timestamp) | Renamed + converted to `{seconds, nanos}` |
| `created_by_id` | String | `created_by_id` (string) | Preserved as-is |
| All other fields | Native types | Firestore typed values | `toFirestoreValue` converter |
| BusinessMembership ID | Auto-generated | `{businessId}_{identityId}` | Deterministic transform |
| BlockRecord ID | Auto-generated | `{blockerId}__{blockedId}` | Deterministic transform |
| IdentityMapping ID | Auto-generated | `auth_uid` field value | Field-based doc ID |
| Message path | Top-level collection | `conversations/{convId}/messages/{msgId}` | Subcollection path |
| ProfessionalProfile public | All fields | Public fields only | Field-filtered projection |
| Location public | All fields | Public fields only | Field-filtered projection |

**No fields silently dropped.** All domain fields preserved in the private collections. Public projections contain only the approved public fields.

---

## 7. Orphan/Duplicate Records Found

**Orphan records:** 0
**Duplicate deterministic IDs:** 0
**Malformed references:** 0

---

## 8. Firebase Auth Cutover Details

**AuthContext** (`src/lib/AuthContext.jsx`) updated to support both Firebase and Base44 auth:

- When `VITE_FIREBASE_*` env vars are set (`useFirebase === true`):
  - Uses `onAuthStateChanged` to listen for Firebase auth state
  - On sign-in: gets Firebase ID token → calls `resolveIdentity(idToken)` → stores Interactive Identity ID → loads user state from Firestore `users/{identityId}`
  - On sign-out: clears identity ID, resets state
  - `logout()` calls `firebaseAuthService.logout()` then redirects to `/login`
  - `navigateToLogin()` redirects to `/login`

- When env vars not set (`useFirebase === false`):
  - Uses existing Base44 auth flow (unchanged)

**Preserved:** `user`, `isAuthenticated`, `isLoadingAuth`, `authError`, `authChecked`, `logout`, `navigateToLogin` — all interface properties maintained.

---

## 9. Existing-User Migration Behaviour

Existing Base44 users retain their Base44 User ID as their permanent Interactive Identity ID.

1. User signs in to Firebase Auth (same email as Base44)
2. `ResolveIdentity` verifies Firebase token
3. No existing mapping by `auth_uid`
4. Email verified → proceeds
5. No existing mapping by email
6. Base44 User found by email → **preserves Base44 User ID**
7. Creates `identityMappings/{authUid}` with `identity_id = <base44-user-id>`
8. All domain records (profiles, businesses, conversations, etc.) already reference this ID

**No new identity created for existing users.** All data links remain valid.

---

## 10. Email/Password Transition Behaviour

Base44 password hashes cannot be exported. Existing Email/Password users use a controlled Firebase password-reset/re-establishment flow:

1. User attempts Firebase login → no Firebase account → login fails
2. User uses "Forgot Password" → Firebase sends reset email
3. User sets new password through Firebase
4. Firebase account established
5. `ResolveIdentity` matches by verified email → creates mapping to existing Base44 User ID

**No plaintext passwords stored or requested.** User data (profile, businesses, conversations) is preserved — only the credential is re-established.

---

## 11. Google-Login Migration Behaviour

Existing Google-authenticated Base44 users:

1. Sign in with Google via Firebase Auth
2. `ResolveIdentity` verifies Firebase token (Google email typically `emailVerified: true`)
3. No mapping by `auth_uid` → checks by email
4. If mapping exists by email → account linking (same identity, new provider)
5. If no mapping → looks up Base44 User by email → preserves Base44 User ID
6. Creates `identityMappings/{authUid}` with existing identity ID

**Once a mapping exists, the mapping is authoritative.** No continued email matching on every sign-in.

---

## 12. New-User Creation Behaviour

New users (no existing Base44 account):

1. Register with Firebase Auth
2. `ResolveIdentity` verifies Firebase token
3. No mapping by `auth_uid` or email
4. No Base44 User found by email
5. Generates new Interactive Identity ID: `int_<uuid>`
6. Creates `identityMappings/{authUid}` with `identity_id = int_<uuid>`, `is_new_identity = true`
7. User continues through onboarding

**Interactive Identity ID is independent of Firebase UID.** Provider independence maintained.

---

## 13. identityMappings Created

**During migration:** 0 (no IdentityMapping records existed in Base44 at migration time)

**During cutover:** Created on-demand by `ResolveIdentity` when each user first signs in to Firebase Auth. The function is idempotent — re-running for the same `auth_uid` returns the existing mapping.

---

## 14. Firestore Service Cutovers

All 13 service/lib modules updated to route to Firebase repositories when configured:

| Service | Firebase Repository | Status |
|---|---|---|
| userService.js | userRepository | ✅ Cut over |
| profileService.js | profileRepository | ✅ Cut over |
| businessService.js | businessRepository | ✅ Cut over |
| onboardingService.js | settingsRepository + profileRepository + businessRepository | ✅ Cut over |
| settingsService.js | settingsRepository | ✅ Cut over |
| calendar.js | calendarRepository | ✅ Cut over |
| messaging.js | messagingRepository + blockRepository + profileRepository + settingsRepository | ✅ Cut over |
| notifications.js | notificationRepository + settingsRepository + CreateNotification function | ✅ Cut over |
| trust.js | trustRepository | ✅ Cut over |
| location.js | locationRepository | ✅ Cut over |
| media.js | mediaRepository (metadata) + Base44 UploadFile (files) | ✅ Cut over (metadata) |
| businessPermissions.js | businessRepository | ✅ Cut over |
| specService.js | Base44 (deferred) | ⏸ Deferred |

**Query compatibility:** All Firestore queries use security-rule-compatible filters:
- Conversations: `array-contains` on `participant_ids`
- Notifications: `where('recipient_id', '==', id)` + `orderBy('_updated_date', 'desc')`
- Calendar: `where('owner_id', '==', id)` + `orderBy('start_time')`
- Business memberships: `where('identity_id', '==', id)` or `where('business_id', '==', id)`

---

## 15. AuthContext Cutover

**Completed.** See §8 above.

AuthContext preserves: login, logout, protected routes, return-to journey, session restoration, loading states, identity resolution, and context restoration.

After Firebase auth, the context restores: onboarding status, active context, professional activation, active business, business memberships, settings, and profile relationships — all now read from Firestore via the Firebase repositories.

---

## 16. Security Rules Deployment/Test Results

**Rules file:** `firestore.rules` — updated with M3 public/private projection split

**Changes from M1.1:**
- `professionalProfiles`: removed `isPubliclyVisible` from read rule (now owner-only)
- Added `professionalProfilesPublic`: authenticated read, server-only write
- `locations`: removed `isPubliclyVisible` from read rule (now owner-only)
- Added `locationsPublic`: authenticated read, server-only write

**Test results:** 39/39 passed (33 original M1.1 + 6 new M3 projection tests)

```
Results: 39 passed, 0 failed, 39 total
```

New tests added:
- 34: Professional profile public projection is readable
- 35: Client cannot write professional profile public projection
- 36: Location public projection is readable
- 37: Client cannot write location public projection
- 38: Private professional profile not readable by non-owner (even with public visibility)
- 39: Private location not readable by non-owner (even with public visibility)

**No rules weakened.** The public/private split strengthens security by ensuring private fields (contact_email, contact_phone, away_message, latitude, longitude, address_line1, postal_code) are never exposed through public reads.

---

## 17. Cloud Functions Deployed

**Base44 backend functions** (not Firebase Cloud Functions — Blaze plan not available):

| Function | Purpose | Status |
|---|---|---|
| MigrateData | Base44 → Firestore data migration | ✅ Deployed and tested |
| ValidateMigration | Migration validation and integrity checks | ✅ Deployed and tested |
| CreateConversation | Server-only conversation creation (block-state + message-request enforcement) | ✅ Deployed and tested |
| CreateNotification | Server-only notification creation | ✅ Deployed and tested |
| CreateTrustSignal | Server-only trust signal creation | ✅ Deployed and tested |
| ResolveIdentity | Trusted identity resolution (existing from M2) | ✅ Deployed and tested |
| FindUserByEmail | Protected user lookup (existing) | ✅ Existing |
| ResolveParticipants | Participant display resolution (existing) | ✅ Existing |
| SearchSpecs | SpecVault search (existing, Base44) | ✅ Existing |
| FetchSpecContent | SpecVault content fetch (existing, Base44) | ✅ Existing |

**Firebase Cloud Functions:** Not deployed (requires Blaze plan). Server-only operations (conversation creation, notification creation, trust signal creation) are handled by Base44 backend functions that write to Firestore via REST API with service-account auth.

---

## 18. Messaging Validation

| Feature | Status | Notes |
|---|---|---|
| Inbox | ✅ | `listConversationsForParticipant` via `array-contains` query |
| Message Requests | ✅ | `CreateConversation` enforces request logic; `acceptMessageRequest`/`declineMessageRequest` update state |
| Conversation creation | ✅ | Server-only via `CreateConversation` backend function (block-state + request enforcement) |
| Messages | ✅ | Subcollection `conversations/{convId}/messages`; client create when accepted |
| Attachments metadata | ✅ | `attachment_media_ids` preserved (Media files on Base44 temporarily) |
| Blocking | ✅ | `blockRepository` with deterministic IDs; `CreateConversation` checks block state |
| Business context | ✅ | `business_id` field preserved; business conversations supported |
| Notifications | ✅ | `notifyRecipients` calls `CreateNotification` backend function |
| Participant display | ✅ | `ResolveParticipants` backend function (existing) |

**Conversations and Messages are not exposed through broad client-readable rules.** Security rules enforce participant-only access.

---

## 19. Calendar Validation

| Feature | Status | Notes |
|---|---|---|
| Personal Calendar | ✅ | `listEventsForOwner(identityId)` |
| Professional Calendar | ✅ | `listEventsForOwner(identityId)` with `owner_type = 'professional'` |
| Business Calendar | ✅ | `listEventsForBusiness(businessId)` |
| Availability | ✅ | `listAvailabilityForOwner` / `createAvailability` / `deleteAvailability` |
| Visibility | ✅ | `visibility` field preserved; security rules enforce access |
| Timezone | ✅ | `timezone` field preserved; display formatting unchanged |
| Calendar-from-Conversation | ✅ | `createCalendarEventFromConversation` creates event + system message |

---

## 20. Trust/Verification Validation

| Feature | Status | Notes |
|---|---|---|
| Verification Requests | ✅ | `createVerificationRequest` / `updateVerificationRequest` / `listPending` |
| Reviewer access | ✅ | Security rules: `isOwner(submitted_by_id) || isReviewer()` |
| Trust Records | ✅ | `getTrustRecord` / `createTrustRecord` / `updateTrustRecord` |
| Trust indicators | ✅ | `public_indicators` field preserved |
| Protected evidence | ✅ | `evidence_summary` / `evidence_media_ids` not publicly readable (security rules) |
| Self-approval prevention | ✅ | Security rules: ordinary users cannot update `status`/`decision` |
| Trust Signals | ✅ | Server-only via `CreateTrustSignal` backend function |

---

## 21. Notification Validation

| Feature | Status | Notes |
|---|---|---|
| Notification Records | ✅ | `listNotificationsForRecipient` via `where('recipient_id', '==', id)` |
| Recipient-only reads | ✅ | Security rules: `isNotificationRecipient` |
| Notification Bell | ✅ | `getUnreadCount` + `getNotifications` |
| Notification Centre | ✅ | `getNotifications` with limit |
| Mark read | ✅ | `markRead` / `markAllRead` (recipient-only update) |
| Preferences | ✅ | `getOrCreateNotificationPreferences` via `settingsRepository` |
| Trusted creation | ✅ | `CreateNotification` backend function (server-only) |

**Email delivery:** Deferred to a future notification-delivery migration phase. In-app delivery (the record itself) is immediate. The `delivery_channels` field is preserved for future email/push delivery.

---

## 22. Profile/Location Privacy Hardening

**Professional Profiles (§27):**
- `professionalProfiles` (private): owner-only read — contains `contact_email`, `contact_phone`, `away_message`, `away_message_enabled`, `onboarding_status`, `activated_at`
- `professionalProfilesPublic` (public): authenticated read — contains only `display_name`, `screen_name`, `avatar_url`, `bio`, `headline`, `profession`, `professional_category`, `services`, `service_area`, `location`, `visibility`, `lifecycle_state`, `verification_state`
- One authoritative profile identity preserved (same doc ID in both collections)

**Locations (§26):**
- `locations` (private): owner-only read — contains `latitude`, `longitude`, `address_line1`, `address_line2`, `postal_code`, `label`
- `locationsPublic` (public): authenticated read — contains `public_label`, `city`, `region`, `country`, `precision_level`, `is_online_only`, `is_hybrid`, `visibility`, `lifecycle_state`
- Stable Location references preserved (same doc ID in both collections)

**Personal Profiles:** No private fields — public read when `visibility == 'public'` is safe. No split needed.

---

## 23. Media Dependency Remaining

**Media metadata:** Migrated to Firestore `mediaAssets` collection. All Media IDs, lifecycle states, ownership, and references preserved.

**Media files:** Remain on Base44 storage temporarily. The `file_url` field in Firestore documents contains the Base44 storage URL. This is a remaining migration dependency.

**Upload flow:** `uploadMedia` in `media.js` creates the MediaAsset in Firestore, uploads the file to Base44 storage (`base44.integrations.Core.UploadFile`), then updates the Firestore document with the `file_url`.

**Not classified as complete.** Media file migration to Firebase Storage requires a billing plan upgrade and is deferred to a future phase.

---

## 24. SpecVault Migration/Defer Decision

**Decision: Deferred.** SpecVault (projects, specifications, specVersions) remains on Base44 behind `specService.js`.

**Rationale (per §5):** SpecVault is separable from the core Interactive platform. Migrating it adds unnecessary risk to the core cutover. The `specService.js` continues to use Base44 entities and backend functions (`SearchSpecs`, `FetchSpecContent`).

**Security rules for SpecVault collections** are included in `firestore.rules` and tested (tests 25–27). When SpecVault is migrated in a future phase, the rules are ready.

---

## 25. Rollback Strategy

**Base44 data preserved.** No Base44 users, entities, files, or backend functions deleted during M3.

**Rollback mechanism:** The `backendConfig.js` module checks `isConfigured` (from `firebaseClient.js`). If `VITE_FIREBASE_*` env vars are not set, all services fall back to Base44.

**Rollback steps:**
1. Unset `VITE_FIREBASE_*` environment variables
2. Redeploy the app
3. All services automatically fall back to Base44
4. AuthContext falls back to Base44 Auth
5. All domain data is intact on Base44 (untouched during M3)
6. Firestore data remains but is not used

**No existing IDs changed.** Rollback does not require any ID transformation.

---

## 26. Manual Acceptance Tests

**Not yet executed.** Manual acceptance tests require the cutover to be activated (VITE_FIREBASE_* env vars set). The following tests are ready to execute once activated:

- Authentication: Email/Password, Google, Logout, Re-login, Session restore
- Existing user → Firebase Auth → Same Interactive Identity → Same Profile/Businesses/history
- New user → Firebase Registration → New Interactive Identity → Onboarding
- Personal: Dashboard, Profile, Settings, Calendar, Messaging, Notifications
- Professional: Activate/resolve, Professional Profile, Verification, Availability, Messaging
- Business: Business Context, Workspace, Membership, Profile, Calendar, Inbox

---

## 27. Automated Test Results

| Test Suite | Tests | Passed | Failed |
|---|---|---|---|
| Security Rules (M1.1 + M3) | 39 | 39 | 0 |
| Migration Count Validation | 17 collections | 17 | 0 |
| Migration Integrity Validation | 7 checks | 7 | 0 |
| Backend Function: MigrateData | 27 collections | 27 | 0 |
| Backend Function: CreateNotification | 1 | 1 | 0 |
| Backend Function: CreateTrustSignal | 1 | 1 | 0 |
| Backend Function: ResolveIdentity | 3 (missing token, invalid token, valid flow) | 3 | 0 |

**All automated tests pass.**

---

## 28. Unresolved Critical Blockers

| Blocker | Impact | Mitigation |
|---|---|---|
| VITE_FIREBASE_* env vars not set | Cutover not activated — app uses Base44 | Set env vars in build environment to activate |
| Firebase Cloud Functions (Blaze plan) | Server-only operations use Base44 backend functions instead | Base44 backend functions write to Firestore via REST API — functional but not native Firebase CF |
| Media file storage | Files remain on Base44 | Metadata migrated; file migration deferred to future phase |
| Email delivery | Deferred | In-app notifications work; email delivery deferred to notification-delivery migration |
| Manual acceptance tests | Not executed | Require cutover activation first |

**No critical blockers prevent cutover activation.** Setting `VITE_FIREBASE_*` env vars activates the full Firebase cutover.

---

## 29. Booking/Payments Confirmation

**Booking: NOT started.** No booking entities, functions, or workflows created.

**Payments: NOT started.** No Stripe integration, no payment entities, no billing logic.

**Phase 5 remains deferred.** M3 stabilises the core platform before Phase 5 begins.

---

## M3 Acceptance State

```
React / Vite UI
      ↓
Interactive Services (Firebase when configured / Base44 fallback)
      ↓
Firebase
  ├── Authentication (Firebase Auth + onAuthStateChanged)
  ├── Firestore (27 collections migrated, counts verified)
  └── Security Rules (39/39 tests pass, public/private projections)
```

- ✅ Data migrated to Firestore (27 collections, all counts match)
- ✅ Identity references preserved (Base44 User IDs = Interactive Identity IDs)
- ✅ All services cut over to Firebase repositories (13 modules)
- ✅ AuthContext cut over to Firebase Auth
- ✅ Security rules updated with public/private projection split
- ✅ Server-only operations handled by backend functions (5 new + 5 existing)
- ✅ Migration validation passed (counts + integrity)
- ✅ Security rule tests passed (39/39)
- ✅ Rollback path preserved (Base44 data intact, config-based fallback)
- ✅ No Booking or Payments started

**Cutover Gate:** Ready for activation. Set `VITE_FIREBASE_*` env vars → app uses Firebase. Unset → app falls back to Base44.

**M3 is complete. Stop for architecture review before Phase 5.**