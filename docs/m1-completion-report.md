# M1 Completion Report — Firebase Foundation + Firestore Security Architecture

**Date:** 2026-08-11
**Phase:** M1 (Firebase Foundation + Security Architecture)
**Preceded by:** M0 (Backend Abstraction) — complete

---

## 1. Firebase SDK Installation & Configuration

- **Package:** `firebase@^10.12.0` installed via npm (modular Web SDK)
- **Import style:** Modular tree-shakeable imports (`firebase/app`, `firebase/auth`, `firebase/firestore`)
- **No hard-coded config:** All configuration read from Vite environment variables
- **No Admin credentials in frontend:** Only web app configuration is used; service-account keys are excluded

## 2. Firebase Initialisation Files Created

| File | Purpose |
|---|---|
| `src/firebase/firebaseClient.js` | Single shared Firebase app instance — initialises App, Auth, Firestore |
| `.env.example` | Documents the 6 required `VITE_FIREBASE_*` environment variables |
| `firebase.json` | Firebase CLI config — points to rules/indexes, configures emulator suite |
| `firestore.indexes.json` | Composite indexes for security-rule-compliant queries |

The initialisation module exports a single `app`, `firebaseAuth`, `db`, and `isConfigured` flag. No page or component imports this directly — only the repository adapters in `src/data/firebase/` use it.

## 3. Required Environment-Variable Names

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

`.env.example` created with empty values. Real values must be placed in `.env.local` (gitignored). The `isConfigured` flag in `firebaseClient.js` is `false` until `apiKey`, `projectId`, and `appId` are all set — adapters remain inactive without configuration.

## 4. Target Firestore Collection Structure

| Collection | Doc ID Strategy | Key Fields | Domain Owner |
|---|---|---|---|
| `identityMappings/{authUid}` | Firebase Auth UID | `identity_id` → Interactive Identity ID, `auth_provider` | Authentication Mapping |
| `users/{identityId}` | Interactive Identity ID | `role`, `onboarding_status`, `active_context`, `active_business_id`, `professional_activated`, `terms_accepted`, `email`, `full_name` | Application Identity |
| `personalProfiles/{id}` | Auto | `identity_id` → uid | Personal Profile |
| `professionalProfiles/{id}` | Auto | `identity_id` → uid | Professional Profile |
| `businesses/{id}` | Auto | `owner_id` → uid | Business |
| `businessProfiles/{id}` | Auto | `business_id` → Business | Business Profile |
| `businessMemberships/{businessId}_{identityId}` | **Deterministic** | `business_id`, `identity_id`, `role`, `lifecycle_state` | Business Membership |
| `businessInvitations/{id}` | Auto | `business_id`, `email`, `identity_id`, `status`, `role` | Business Invitation |
| `subscriptionPlans/{id}` | Auto | `tier`, `status`, `sort_order` | Subscription |
| `businessSubscriptions/{id}` | Auto | `business_id`, `plan_id`, `status` | Subscription |
| `onboardingStates/{id}` | Auto | `identity_id` → uid, `intent`, `current_step`, `status` | Onboarding |
| `userSettings/{id}` | Auto | `identity_id` → uid | Settings |
| `notificationPreferences/{id}` | Auto | `identity_id` → uid | Settings |
| `notificationRecords/{id}` | Auto | `recipient_id` → uid, `source_system`, `event_type` | Notifications |
| `mediaAssets/{id}` | Auto | `owner_id` → uid, `file_url`, `visibility`, `lifecycle_state` | Media |
| `verificationRequests/{id}` | Auto | `target_type`, `target_id`, `submitted_by_id`, `status`, `decision` | Trust |
| `trustRecords/{id}` | Auto | `target_id`, `trust_level`, `public_indicators`, `evidence_summary` | Trust |
| `trustSignals/{id}` | Auto | `source_system`, `target_id`, `signal_type` | Trust |
| `locations/{id}` | Auto | `owner_id` → uid, `latitude`, `longitude`, `public_label`, `visibility` | Location |
| `calendarEvents/{id}` | Auto | `owner_id`, `owner_type`, `business_id`, `visibility`, `start_time` | Calendar |
| `availabilityRules/{id}` | Auto | `owner_id`, `owner_type`, `business_id`, `day_of_week` | Calendar |
| `externalCalendarConnections/{id}` | Auto | `identity_id` → uid, `provider`, `sync_status` | Calendar |
| `conversations/{id}` | Auto | `participant_ids[]`, `request_status`, `business_id` | Messaging |
| `conversations/{id}/messages/{msgId}` | Subcollection | `sender_id`, `body`, `status`, `read_by[]` | Messaging |
| `blockRecords/{blockerId}__{blockedId}` | **Deterministic** | `blocker_id`, `blocked_id`, `status` | Trust & Safety |
| `projects/{id}` | Auto | `name`, `description`, `color` | SpecVault |
| `specifications/{id}` | Auto | `title`, `project_id`, `status`, `version` | SpecVault |
| `specVersions/{id}` | Auto | `specification_id`, `version`, `status`, `file_url` | SpecVault |

**Deterministic ID strategy** for `businessMemberships` and `blockRecords` enables O(1) security-rule lookups via `exists()`/`get()` — Firestore rules cannot run queries, so deterministic paths are essential for permission checks.

## 5. Interactive Identity ↔ Firebase Auth UID Design (M1.1 — Decoupled)

```
Firebase Auth UID
       │
       ▼
identityMappings/{authUid}        ← Authentication mapping (server-created)
       │ .identity_id
       ▼
Interactive Identity ID
       │
       ├──→ users/{identityId}     ← Application identity state
       ├──→ personalProfiles.identity_id
       ├──→ professionalProfiles.identity_id
       ├──→ businesses.owner_id
       ├──→ businessMemberships.identity_id
       ├──→ locations.owner_id
       ├──→ userSettings.identity_id
       ├──→ notificationRecords.recipient_id
       ├──→ conversations.participant_ids[]
       ├──→ messages.sender_id
       ├──→ blockRecords.blocker_id / blocked_id
       └──→ all other domain identity references
```

**Architecture principle:** Firebase Auth UID identifies the authentication principal only. Interactive retains its own stable application identity identifier, decoupled from the authentication provider. This allows authentication providers/backend infrastructure to change in future without requiring all Interactive domain identity references to change.

- **`identityMappings/{authUid}`** — Maps Firebase Auth UID → Interactive Identity ID. Created by Cloud Function on first sign-in. Read-only for the authenticated user; no client writes.
- **`users/{identityId}`** — Application identity state keyed by the stable Interactive Identity ID (not the Auth UID). Created by Cloud Function alongside the mapping.
- **Domain records** — All `identity_id`, `owner_id`, `participant_ids`, `sender_id`, `recipient_id`, `blocker_id`, `blocked_id`, and other domain identity references point to the Interactive Identity ID, never the Firebase Auth UID.
- **Security rules** — `myIdentityId()` helper resolves the Auth UID → Interactive Identity ID via the mapping, then all ownership/participant checks compare against the Interactive Identity ID.
- **No application-domain state in Firebase Auth custom claims** — Firestore is the correct owner.
- **Provider independence** — If Firebase Auth is replaced or supplemented with another provider, only the `identityMappings` collection changes; all domain records retain their identity references.

## 6. Firestore Security Rules Created

File: `firestore.rules` (project root)

**Default posture: DENY unless explicitly authorised.** No broad `if true` or `if request.auth != null` rules. Every collection has its own read/write conditions.

Rules cover all 27 collections/subcollections listed in §4.

## 7. Reusable Rule Helpers

| Helper | Purpose |
|---|---|
| `isAuthenticated()` | `request.auth != null` |
| `uid()` | Current user's Firebase Auth UID |
| `isOwner(identityId)` | Authenticated user matches the identity ID |
| `userExists(userId)` / `userDoc(userId)` | Safe get() guarded by exists() |
| `isAdmin()` | User doc has `role == 'admin'` |
| `isReviewer()` | User doc has `role in ['admin', 'reviewer']` |
| `membershipId(businessId, identityId)` | Deterministic membership doc ID |
| `isBusinessMember(businessId)` | Exists check on deterministic membership doc |
| `membershipData(businessId)` | Get membership doc data |
| `hasBusinessRole(businessId, role)` | Member check + role match |
| `isBusinessAdmin(businessId)` | Owner or admin role |
| `isBusinessOwner(businessId)` | Owner role only |
| `isConversationParticipant(conversationId)` | UID in `participant_ids` array |
| `isConversationAccepted(conversationId)` | `request_status == 'accepted'` |
| `isNotificationRecipient(resource)` | `recipient_id` matches UID |
| `isPubliclyVisible(resource)` | `visibility == 'public'` |
| `isNotBlockedBy(blockerId, blockedId)` | Block doc does not exist |
| `isInvitationForAuthUser(resource)` | Invitation email matches `request.auth.token.email` |

## 8. Personal/Profile Security Model

- **Personal profiles:** Owner-only write; public read when `visibility == 'public'`; admin always
- **Professional profiles:** Same pattern; private contact info and verification evidence protected at document level
- **Production hardening note:** Field-level separation (public projection vs private master) should be implemented by splitting into separate collections — documented in rules comments

## 9. Professional Security Model

- Public presentation fields readable when `visibility == 'public'`
- Private fields (contact_email, contact_phone, away_message, internal settings) not separately exposed at field level in M1 — document-level rules apply
- Verification evidence in `verificationRequests` and `trustRecords` is not publicly readable (submitter + reviewer only)

## 10. Business/Member/Permission Security Model

- **Businesses:** Authenticated read; owner create; admin/owner update; owner/admin delete
- **Business profiles:** Authenticated read; business admin create/update; business owner delete
- **Business memberships (deterministic ID):**
  - Self-join denied (`identity_id != uid()`)
  - Self-promotion denied (cannot change own role)
  - Owner role cannot be created or assigned via client (`role != 'owner'`)
  - Only admins can change other members' roles
  - Members can update only their own non-role fields
- **Business invitations:** Admin or invitee (by email match) can read/update; admin creates
- **Multi-business isolation:** All business-scoped queries check `isBusinessMember`/`isBusinessAdmin` against the specific `business_id` — no cross-business access

## 11. Calendar Security Model

- Owner read/write for personal events
- Business member read for business events; business admin write
- `visibility` field controls public/connections/staff access
- Staff-only events require `isBusinessMember`
- **Query compatibility:** Queries must constrain by `owner_id` or `business_id` — rules are not filters

## 12. Messaging/Conversation Security Model

- **Conversation creation: `allow create: if false`** — server-only Cloud Function required to enforce message-request and block-state rules
- Conversation read: participant only
- Message read: participant of parent conversation
- Message create: authenticated sender + `sender_id == uid()` + participant + conversation accepted
- Message update: sender only (e.g., status updates)
- Block state check (`isNotBlockedBy`) documented for Cloud Function use

## 13. Notification Security Model

- Read: recipient only (`recipient_id == uid()`)
- **Create: `if false`** — server-only; clients cannot spoof notifications
- Update: recipient only, cannot change `recipient_id`
- Delete: recipient or admin

## 14. Trust/Verification Security Model

- **Verification requests:** Submitter reads own; reviewer reads all; submitter creates with `pending_review`/`pending`; submitter updates non-status fields only; reviewer can update status/decision
- **Trust records:** Target owner reads; reviewer creates/updates; admin deletes
- **Trust signals:** Admin read only; **no client writes** — system-generated via Cloud Function
- Private evidence (`evidence_summary`, `evidence_media_ids`) not publicly exposed

## 15. Location Security Model

- Owner read/write; public read when `visibility == 'public'`
- Private fields (latitude, longitude, address_line1, postal_code) protected at document level
- **Production hardening:** Split public/private projections into separate collections for field-level safety — documented in rules comments

## 16. Block Security Model

- Deterministic doc ID: `{blockerId}__{blockedId}`
- Only blocker can create/update/delete their own blocks
- Blocker can read their own blocks; blocked user cannot inspect
- `isNotBlockedBy()` helper available for Cloud Function messaging enforcement

## 17. Operations Requiring Trusted Backend Functions (Cloud Functions)

| Operation | Reason | M1 Status |
|---|---|---|
| **Conversation creation** | Enforce DM restrictions, block state, request state | Interface prepared; rules deny client create |
| **Message-request handling** | Accept/decline with atomic state transition | Interface prepared |
| **Notification creation** | Prevent spoofed system notifications | Interface prepared; rules deny client create |
| **Verification approval/rejection** | Atomic update of VerificationRequest + TrustRecord + notifications | Interface prepared; rules allow reviewer update but CF recommended |
| **TrustSignal creation** | System-generated only | Interface prepared; rules deny client write |
| **Business invitation acceptance** | Atomic: create membership + update invitation status | Interface prepared |
| **Business role assignment (owner)** | Cannot be done via client | Rules deny; CF required |
| **Protected user lookup (by email)** | `users/{uid}` is owner-only read | Interface prepared; CF required |
| **Participant resolution** | Cross-user profile lookup | Existing Base44 function; CF equivalent in M2 |
| **Block-enforced message send** | Check block state before creating message | CF required |
| **Payment-related writes** | Future (Booking/Payments phase) | Deferred |
| **Booking transaction creation** | Future | Deferred |

**Spark plan note:** Cloud Functions deployment requires the Blaze plan. M1 prepares interfaces only — no functions deployed. When the plan is upgraded, these operations can be implemented as Cloud Functions calling the repository adapters with admin credentials.

## 18. Firebase Adapters/Repositories Created

| File | Collections | Service Contract Match |
|---|---|---|
| `firebaseUserRepository.js` | `users` | userService |
| `firebaseProfileRepository.js` | `personalProfiles`, `professionalProfiles` | profileService |
| `firebaseBusinessRepository.js` | `businesses`, `businessProfiles`, `businessMemberships`, `businessInvitations`, `subscriptionPlans`, `businessSubscriptions` | businessService |
| `firebaseCalendarRepository.js` | `calendarEvents`, `availabilityRules`, `externalCalendarConnections` | calendar lib |
| `firebaseMessagingRepository.js` | `conversations`, `conversations/{id}/messages` | messaging lib |
| `firebaseNotificationRepository.js` | `notificationRecords` | notifications lib |
| `firebaseTrustRepository.js` | `verificationRequests`, `trustRecords`, `trustSignals` | trust lib |
| `firebaseLocationRepository.js` | `locations` | location lib |
| `firebaseMediaRepository.js` | `mediaAssets` | media lib |
| `firebaseSettingsRepository.js` | `userSettings`, `notificationPreferences`, `onboardingStates` | settingsService, onboardingService |
| `firebaseSpecRepository.js` | `projects`, `specifications`, `specVersions` | specService |
| `firebaseBlockRepository.js` | `blockRecords` | trust lib |
| `mappers.js` | — | Shared mapping utilities |
| `index.js` | — | Barrel export |

All repositories implement the same application-facing behaviour as the existing M0 services. **No service is switched to Firebase yet.** Repositories are importable but not wired in.

## 19. Security Rule Test Strategy & Results

### Test Environment

`firebase.json` configures the Firebase Emulator Suite:
- Firestore emulator: port 8080
- Auth emulator: port 9099
- Emulator UI: port 4000

### Test Cases (to be executed with emulator)

| # | Test | Expected Result |
|---|---|---|
| 1 | Unauthenticated user reads `users/{uid}` | DENIED |
| 2 | User A reads `users/{uidB}` | DENIED |
| 3 | User A reads User B `personalProfiles` (private) | DENIED |
| 4 | User A reads User B `personalProfiles` (public) | ALLOWED |
| 5 | User A reads User B `notificationRecords` | DENIED |
| 6 | User A reads User B `userSettings` | DENIED |
| 7 | User A reads User B private `locations` | DENIED |
| 8 | Business A member reads Business B `businesses` | ALLOWED (business existence is authenticated read) |
| 9 | Business A member writes Business B `businessProfiles` | DENIED |
| 10 | Ordinary member promotes self to admin | DENIED |
| 11 | Ordinary member creates owner membership | DENIED |
| 12 | Non-participant reads `conversations/{id}` | DENIED |
| 13 | Non-participant reads `conversations/{id}/messages` | DENIED |
| 14 | Client creates `conversations/{id}` | DENIED |
| 15 | Participant creates message in accepted conversation | ALLOWED |
| 16 | Participant creates message with wrong `sender_id` | DENIED |
| 17 | Client creates `notificationRecords` | DENIED |
| 18 | Ordinary user approves verification (updates status) | DENIED |
| 19 | Non-reviewer reads `verificationRequests` of others | DENIED |
| 20 | Public reads `trustRecords` evidence | DENIED |
| 21 | Client creates `trustSignals` | DENIED |
| 22 | User A removes User B's block | DENIED |
| 23 | User creates block with `blocker_id` != uid | DENIED |
| 24 | Blocked sender creates conversation | DENIED (server-only) |
| 25 | Unauthenticated reads public `specifications` | DENIED |
| 26 | Authenticated reads public `specifications` | ALLOWED |
| 27 | Client updates `specVersions` (immutable) | DENIED |

### Execution

**M1.1 status:** Tests implemented and executed against the Firebase Emulator Suite.

**Test dependency:** `@firebase/rules-unit-testing@^3.0.0` (compatible with `firebase@^10.x`) + `firebase-tools@^13.0.0`

**Test file:** `tests/firestore-rules.test.js` — 27 documented cases + 6 identity-mapping-specific cases (33 total)

Run with:
```bash
firebase emulators:exec --only firestore "node tests/firestore-rules.test.js"
```

See §28 for execution results.

## 20. Firestore Query Patterns Requiring Change

| Current Base44 Pattern | Firestore Change Required |
|---|---|
| `base44.entities.CalendarEvent.list()` (all events) | Must query by `owner_id` or `business_id` — cannot list all |
| `base44.entities.Conversation.filter({participant_ids: uid})` | Use `array-contains` query: `where('participant_ids', 'array-contains', uid)` |
| `base44.entities.NotificationRecord.filter({recipient_id: uid})` | Requires composite index: `recipient_id` + `_updated_date desc` |
| `base44.entities.BusinessMembership.filter({identity_id: uid})` | Query by `identity_id` — index required |
| `base44.entities.Specification.list('-updated_date', 50)` | Use `orderBy('_updated_date', 'desc')` — field name changes from `updated_date` to `_updated_date` |
| `base44.entities.User.list()` (admin only) | Cannot list all users via client — requires Cloud Function |
| `base44.entities.Message.filter({conversation_id: id})` | Subcollection query: `collection('conversations', id, 'messages')` |
| Free-text search (SearchSpecs) | Cannot be done with Firestore — requires external search (Algolia/Typesense) or Firebase Extensions |

**Key constraint:** Firestore security rules are not post-query filters. Every query must already constrain results to records the caller is authorised to read. The `firestore.indexes.json` file defines the composite indexes needed for these queries.

## 21. App Check Recommendation

**Recommendation:** Enable Firebase App Check in a future production hardening phase (post-M2).

- **App Check** provides device attestation (reCAPTCHA Enterprise for web, Play Integrity for Android, DeviceCheck for iOS)
- It protects Firestore/Storage/Cloud Functions from unauthorised clients
- It is **not a replacement** for Authentication or Security Rules — it is an additional layer
- **M1 status:** Not configured. Requires App Check registration in Firebase Console and token provider integration. Document as a future security step.

## 22. Storage Work Deferred

- Cloud Storage for Firebase is **not enabled** (Spark plan requires billing upgrade for Storage)
- No Storage Security Rules created
- No file upload/migration implemented
- `firebaseMediaRepository.js` handles Firestore metadata only — no file operations
- **Deferred to:** Media migration phase (post-M2), after plan upgrade or Storage enablement

## 23. Cloud Functions Work Deferred

- Cloud Functions deployment requires the **Blaze (pay-as-you-go) plan**
- Current plan: **Spark (free tier)**
- **No Cloud Functions deployed in M1**
- Function contracts/interfaces prepared in repository adapters (see §17)
- When plan is upgraded, Cloud Functions will call repository adapters with admin SDK credentials

## 24. No Base44 Data Migrated

Confirmed. No Base44 production records were read, copied, or written to Firebase. The Firebase project contains no authoritative data. Only non-authoritative test/configuration data may be added during rule testing (via emulator).

## 25. Existing Application Behaviour Still Uses Base44

Confirmed. All Interactive services (`authService`, `userService`, `profileService`, `businessService`, `onboardingService`, `settingsService`, `specService`, and all `lib/` modules) continue to use the Base44 implementation. No service was switched to Firebase. No page or component imports Firebase directly. The M0 abstraction boundary is preserved.

## 26. Firebase/Spark-Plan Limitations Encountered

| Limitation | Impact | Mitigation |
|---|---|---|
| Cloud Storage requires billing upgrade | Media uploads deferred | Firestore metadata only in M1 |
| Cloud Functions require Blaze plan | Server-required operations cannot be deployed | Interfaces prepared; rules deny client writes where server is needed |
| No full-text search in Firestore | SpecVault semantic search cannot use Firestore | Keep Base44 SearchSpecs function; use external search in future |
| Firestore rules cannot run queries | Permission checks need deterministic doc IDs | Used deterministic IDs for memberships and blocks |

## 27. Conflicts with Approved Firebase & Data Architecture Specification

**No conflicts identified.** The M1 implementation follows the approved specification:
- Identity separation: Firebase Auth UID → `identityMappings/{authUid}` → Interactive Identity ID → `users/{identityId}` (M1.1 decoupled) ✓
- Security-first: deny-by-default, no broad rules ✓
- Domain ownership preserved ✓
- No data migration ✓
- No authentication cutover ✓
- Base44 remains authoritative ✓
- M0 abstraction preserved ✓

**One architectural recommendation for future hardening:** Location and Professional Profile data should use separate public/private projection collections for field-level security, rather than document-level visibility alone. This is documented in the rules comments and should be implemented in a later hardening phase.

---

## 28. M1.1 Security Rule Test Execution Results

**Date executed:** 2026-08-11
**Environment:** Firebase Emulator Suite (Firestore emulator, port 8080)
**Test framework:** `@firebase/rules-unit-testing@^3.0.0` + `firebase-tools@^13.0.0`
**Java runtime:** OpenJDK 17 (installed in test environment)
**Test file:** `tests/firestore-rules.test.cjs`

### Tests Executed: 33
### Tests Passed: 33
### Tests Failed: 0

All 27 documented test cases passed. 6 additional identity-mapping-specific tests were added for M1.1 and also passed.

| # | Test | Result |
|---|---|---|
| 1 | Unauthenticated user denied private records | PASS |
| 2 | User A cannot read User B private profile | PASS |
| 3 | User A cannot read User B private Profile | PASS |
| 4 | Public Profile data can be read where visibility permits | PASS |
| 5 | User A cannot read User B Notifications | PASS |
| 6 | User A cannot read User B Settings | PASS |
| 7 | User A cannot read User B private Location | PASS |
| 8 | Business A member can read Business B business record | PASS |
| 9 | Business A member cannot write Business B protected data | PASS |
| 10 | Ordinary Business member cannot promote their role | PASS |
| 11 | Ordinary member cannot create owner membership | PASS |
| 12 | Non-participant cannot read Conversation | PASS |
| 13 | Non-participant cannot read Messages | PASS |
| 14 | Client cannot create Conversation directly | PASS |
| 15 | Participant can create message in accepted conversation | PASS |
| 16 | Cannot create message with wrong sender_id | PASS |
| 17 | Client cannot create Notifications | PASS |
| 18 | Ordinary user cannot approve verification | PASS |
| 19 | Non-reviewer cannot read others verification requests | PASS |
| 20 | Private verification evidence cannot be read publicly | PASS |
| 21 | Client cannot create Trust Signals | PASS |
| 22 | User cannot remove another users block | PASS |
| 23 | User cannot create block pretending to be another user | PASS |
| 24 | Blocked sender cannot bypass Messaging restrictions | PASS |
| 25 | Unauthenticated denied SpecVault access | PASS |
| 26 | Authenticated can read SpecVault | PASS |
| 27 | Spec Versions are immutable | PASS |
| 28 | Authenticated user can read own identity mapping | PASS |
| 29 | User cannot read another users identity mapping | PASS |
| 30 | Client cannot create identity mapping | PASS |
| 31 | User without identity mapping denied domain access | PASS |
| 32 | User can create profile with correct identity_id | PASS |
| 33 | User cannot create profile with wrong identity_id | PASS |

### Security Rules Changed (M1.1)

| Rule Change | Reason |
|---|---|
| Split `myIdentityId()` into `hasIdentityMapping()` (boolean) + `getIdentityId()` (string) | Original `myIdentityId()` returned a string (identity_id) via `&&` chain, causing "Type error: Received [string] Expected [bool]" in rule evaluation. Splitting into a boolean guard and a string accessor ensures all rule expressions evaluate to booleans. |
| All create rules changed from `isAuthenticated() && ... == uid()` to `isOwner(request.resource.data.field)` | `isOwner()` returns a guaranteed boolean (`hasIdentityMapping() && getIdentityId() == identityId`), preventing type errors and ensuring the identity mapping is checked before any domain write. |
| `users/{userId}` → `users/{identityId}` with `allow create: if false` | Doc ID is now the Interactive Identity ID (not Auth UID). Creation is server-only (Cloud Function) to prevent clients from creating user docs without an identity mapping. |
| Added `identityMappings/{authUid}` collection | New indirection layer mapping Firebase Auth UID → Interactive Identity ID. Read-only for the authenticated user; no client writes. |
| `!= uid()` → `!= getIdentityId()` in businessMemberships | Membership identity references now compare against the Interactive Identity ID, not the Auth UID. |
| `isAdmin()` / `isReviewer()` use `hasIdentityMapping() + getIdentityId()` | Admin/reviewer checks now resolve through the identity mapping, ensuring the user has a valid Interactive identity before checking role. |
| `isBusinessMember()` uses `hasIdentityMapping() + getIdentityId()` | Business membership checks now resolve through the identity mapping. |
| `isConversationParticipant()` uses `hasIdentityMapping() + getIdentityId()` | Conversation participant checks now resolve through the identity mapping. |

**No rules were weakened.** All changes preserve the deny-by-default posture and the approved security architecture. The split into `hasIdentityMapping()` / `getIdentityId()` is a correctness fix — the original `myIdentityId()` would have caused type errors in production, not just tests.

---

## 29. Base44 Identity ID Preservation Strategy (M2/M3)

### Problem

Existing Base44 production data uses Base44 User IDs (`created_by_id`, `identity_id`, `owner_id`, etc.) as domain identity references. M2/M3 must migrate this data to Firebase without changing domain identity keys, while mapping Firebase Auth UIDs to the preserved Interactive Identity IDs.

### Strategy: Base44 ID → Interactive Identity ID

1. **Preserve Base44 User IDs as Interactive Identity IDs.** The Base44 User ID for each user becomes their stable Interactive Identity ID in Firebase. This means:
   - `users/{identityId}` — doc ID == existing Base44 User ID
   - All `identity_id`, `owner_id`, `participant_ids`, `sender_id`, `recipient_id`, `blocker_id`, `blocked_id` fields retain their existing Base44 User ID values
   - No domain record needs its identity references changed

2. **Create identity mappings during M2 auth migration.** When each user signs in to Firebase Auth for the first time (M2):
   - Firebase Auth creates a new Auth UID for the user
   - A Cloud Function looks up the user by email in the migrated `users` collection
   - The Cloud Function creates `identityMappings/{authUid}` with `identity_id = <existing Base44 User ID>`
   - From that point, all domain access resolves through the mapping

3. **Data migration (M3) copies records with identity references intact.** When Base44 entity records are copied to Firestore:
   - `identity_id` fields keep their Base44 User ID values
   - `owner_id` fields keep their Base44 User ID values
   - `participant_ids` arrays keep their Base44 User ID values
   - No ID transformation is needed — the values are already the correct Interactive Identity IDs

4. **Email is the join key.** During M2, users authenticate with Firebase Auth using the same email they used in Base44. The Cloud Function matches by email to create the identity mapping. Users who have not yet signed in to Firebase simply don't have a mapping — they can't access the app until they do, but their data is already in place.

### Migration Sequence

```
M2 (Auth Migration):
  1. Enable Firebase Auth
  2. User signs in with Firebase Auth (same email as Base44)
  3. Cloud Function: auth.user().onCreate → lookup by email → create identityMappings/{authUid}
  4. User now has: Firebase Auth UID → identityMappings → Interactive Identity ID (== Base44 User ID)

M3 (Data Migration):
  1. For each Base44 entity, copy records to Firestore
  2. identity_id, owner_id, etc. keep their Base44 User ID values
  3. No transformation needed — values are already correct Interactive Identity IDs
  4. Security rules resolve identity via identityMappings lookup
```

### Why This Works

- **Domain identity references never change.** Base44 User IDs ARE the Interactive Identity IDs. The `identityMappings` collection is the only new artifact.
- **Authentication provider independence.** If Firebase Auth is later replaced, only `identityMappings` changes — all domain records keep their identity references.
- **No data backfill needed.** Existing records don't need their identity fields updated. Only the mapping collection is new.
- **Gradual migration supported.** Users can migrate at their own pace. Data is in place; the mapping is created on first sign-in.

---

## Acceptance State Verification

```
                 React UI
                    │
                    ▼
          Interactive Services (Base44 — active)
             /             \
            /               \
 Current Base44           Firebase
 Implementation         Prepared Adapter
      │                       │
      ▼                       ▼
Active Backend         Auth + Firestore
                     + Security Rules
                       prepared/tested
```

- ✅ React UI → Interactive Services (M0 boundary preserved)
- ✅ Interactive Services → Base44 (active, unchanged)
- ✅ Firebase adapters created behind same service contracts
- ✅ Firebase Auth + Firestore initialised (not yet active)
- ✅ Security rules written (deny-by-default, per-collection)
- ✅ Identity decoupled: Auth UID → identityMappings → Interactive Identity ID (M1.1)
- ✅ Security rule tests executed: 33 passed, 0 failed (M1.1)
- ✅ No data migrated, no auth switched, no Base44 removed
- ✅ No Booking or Payments work begun

**M1.1 is complete. Stop for architecture review before M2.**