# M2 Completion Report — Authentication + Identity Cutover

**Date:** 2026-08-11
**Migration Phase:** M2 (Authentication + Identity Cutover)
**Status:** ⚠️ INFRASTRUCTURE COMPLETE — CUTOVER BLOCKED (§17)

---

## Executive Summary

M2 infrastructure has been fully implemented: Firebase Authentication service, trusted identity-resolution backend function, IdentityMapping entity, and identity resolution service. All M1.1 Security Rule tests continue to pass (33/33).

**The cutover is blocked by a fundamental platform dependency (§17):** Base44 SDK entity operations (`base44.entities.X.list()`, `.create()`, `.filter()`, etc.) require a valid Base44 access token. This token is set exclusively by Base44's own authentication flow. Firebase Authentication produces a different token that the Base44 SDK cannot use. There is no mechanism to exchange a Firebase token for a Base44 session.

Per §17: *"If Base44 cannot safely support Firebase-authenticated access to Base44 domain data, stop and report the blocker rather than weakening security."*

**The cutover has NOT been performed.** Base44 Authentication remains active and authoritative. All M2 infrastructure is ready for activation once the hybrid bridge is resolved.

---

## 1. Firebase Authentication Operations Implemented

**File:** `src/services/firebaseAuthService.js`

| Operation | Method | Status |
|---|---|---|
| Registration | `register({ email, password })` | ✅ Implemented |
| Email/Password Login | `loginViaEmailPassword(email, password)` | ✅ Implemented |
| Google Login | `loginWithGoogle()` | ✅ Implemented |
| Logout | `logout()` | ✅ Implemented |
| Current User | `getCurrentUser()` | ✅ Implemented |
| Auth State Listener | `onAuthStateChange(callback)` | ✅ Implemented |
| ID Token Retrieval | `getIdToken()` | ✅ Implemented |
| Is Authenticated | `isAuthenticated()` | ✅ Implemented |
| Password Reset Request | `resetPasswordRequest(email)` | ✅ Implemented |
| Password Reset | `resetPassword({ resetCode, newPassword })` | ✅ Implemented |
| Email Verification | `sendEmailVerification()` | ✅ Implemented |
| Resend Verification | `resendEmailVerification()` | ✅ Implemented |
| Reload User | `reloadUser()` | ✅ Implemented |
| Profile Update | `updateProfile(data)` | ✅ Implemented |

**Not implemented (per §10):** Apple Sign-in, Phone/OTP authentication. These are separate future capabilities.

**Status:** All operations implemented but NOT YET ACTIVE. The existing `authService.js` (Base44) remains in use.

---

## 2. authService Migration Details

The existing `authService.js` (Base44 wrapper) has **NOT been modified or replaced**. A new `firebaseAuthService.js` has been created alongside it with a matching application-facing contract.

**Why not switched:** The cutover is blocked by §17 (see §13 below). Switching `AuthContext` to Firebase Auth would break all Base44 SDK entity operations, making the app non-functional.

**Contract differences documented:**
- `verifyOtp` / `setToken` / `resendOtp` (Base44 OTP flow) → replaced by `sendEmailVerification` / `resendEmailVerification` (Firebase email-link flow). This is a UX difference: Firebase uses email-link verification, not OTP codes. The existing Register.jsx OTP flow would need updating when the cutover proceeds.
- `loginWithProvider(provider, fromUrl)` → `loginWithGoogle()` (Firebase popup). The `fromUrl` return-to handling would be added in AuthContext integration.
- `me()` → `getCurrentUser()` + identity resolution. Firebase Auth provides the Firebase user; the Interactive Identity is resolved separately via `identityService.resolveIdentity()`.

---

## 3. Identity-Resolution Function Architecture

**File:** `base44/functions/ResolveIdentity/entry.ts`

```
Client (Firebase ID Token)
    ↓
ResolveIdentity backend function
    ↓
    ├─ 1. Verify Firebase token (identitytoolkit REST API)
    ├─ 2. Check existing mapping by auth_uid (idempotent)
    ├─ 3. Require email verification for email-based matching
    ├─ 4. Check existing mapping by email (account linking)
    ├─ 5. Look up Base44 User by email (preserve Base44 ID)
    ├─ 6. Generate new Interactive Identity ID if no match
    └─ 7. Create IdentityMapping record
    ↓
Return { identityId, isNew, isExisting, isLinked }
```

**Authentication model:** The function verifies the Firebase ID token as its authentication mechanism. It does NOT call `base44.auth.me()` because the caller is Firebase-authenticated, not Base44-authenticated. All entity operations use `base44.asServiceRole` (service-level credentials).

**Security:** The function only operates on data related to the caller's own Firebase UID and verified email. It cannot be used to access other users' identity mappings.

---

## 4. Existing-User Migration Behaviour

For an existing Base44 user authenticating through Firebase for the first time:

1. Firebase Auth produces a new Firebase UID
2. `ResolveIdentity` verifies the Firebase token
3. No existing mapping found by auth_uid
4. Email is verified in Firebase → proceeds
5. No existing mapping found by email
6. Base44 User found by email → **preserves Base44 User ID as Interactive Identity ID**
7. Creates IdentityMapping: `{ auth_uid: <firebase-uid>, identity_id: <base44-user-id> }`
8. Returns `{ identityId: <base44-user-id>, isNew: false, isExisting: true }`

**Base44 ID preservation confirmed (§12):** The existing Base44 User ID becomes the permanent Interactive Identity ID. No replacement ID is generated.

---

## 5. New-User Identity Creation Behaviour

For a genuinely new user (no existing Base44 account):

1. Firebase Auth creates the user
2. `ResolveIdentity` verifies the Firebase token
3. No existing mapping by auth_uid or email
4. No Base44 User found by email
5. Generates new Interactive Identity ID: `int_<uuid>`
6. Creates IdentityMapping: `{ auth_uid: <firebase-uid>, identity_id: int_<uuid>, is_new_identity: true }`
7. Returns `{ identityId: int_<uuid>, isNew: true, isExisting: false }`

**Identity stability:** The `int_<uuid>` ID is independent of the Firebase UID. If authentication infrastructure changes in future, the Interactive Identity remains stable.

---

## 6. Google Authentication Behaviour

```
Google Sign-In (Firebase popup)
    ↓
Firebase Auth UID
    ↓
ResolveIdentity
    ↓
Existing mapping by auth_uid?
    │ YES → return existing identity
    │ NO  → email verified? (Google emails are typically verified)
    │       ↓
    │       Existing mapping by email?
    │       │ YES → account linking (same identity, new provider)
    │       │ NO  → Base44 User by email?
    │       │      │ YES → preserve Base44 ID
    │       │      │ NO  → generate new identity
    ↓
Create mapping
```

Google emails are typically `emailVerified: true` in Firebase, so Google users proceed directly to email-based matching.

---

## 7. Email/Password Migration Strategy

**Existing Base44 Email/Password accounts:** Base44 password hashes cannot be read, extracted, or migrated. Per §12, we do not request, extract, or store plaintext passwords.

**Strategy implemented:** Controlled transition via Firebase password reset/re-establishment.

1. Existing user attempts Firebase login with their email
2. Firebase Auth has no record → login fails
3. User uses "Forgot Password" → Firebase sends password reset email
4. User sets a new password through Firebase
5. Firebase account is established
6. `ResolveIdentity` matches by verified email → creates mapping to existing Base44 User ID

**This means existing users must re-establish their password through Firebase.** Their Base44 User ID and all domain data are preserved — only the credential is re-established.

**Limitation acknowledged:** This requires existing users to have access to their email account. Users without email access would need manual identity resolution (see §22).

---

## 8. Account-Linking Behaviour

When the same person uses Email/Password and Google with the same verified email:

1. First provider (e.g., Email/Password) → creates mapping: `{ auth_uid: A, identity_id: X, email: user@example.com }`
2. Second provider (e.g., Google) → different auth_uid B, same email
3. `ResolveIdentity` checks existing mapping by email → finds mapping with `identity_id: X`
4. Creates new mapping: `{ auth_uid: B, identity_id: X, email: user@example.com }`
5. Returns `{ identityId: X, isLinked: true }`

**Single Interactive Identity preserved.** Multiple Firebase Auth UIDs map to the same Interactive Identity ID.

**Collision protection:** If multiple mappings exist for the same email but with different `identity_id` values, the function returns `AMBIGUOUS_EMAIL_MAPPING` (409) for manual resolution.

---

## 9. Email-Verification Behaviour

**Firebase `emailVerified`** is authoritative for authentication-level email verification.

**Policy implemented:**
- If mapping exists by auth_uid → return it regardless of email verification (idempotent)
- If no mapping and resolving by email → **require `emailVerified: true`**
- Unverified email → returns `EMAIL_NOT_VERIFIED` (403)

**Separation maintained (§14):** Firebase `emailVerified` is NOT the same as Interactive professional/business verification. Professional and Business verification remain owned by Trust & Reputation.

---

## 10. Session / AuthContext Changes

**No changes made to `AuthContext`.** The existing `AuthContext` continues to use Base44 Authentication.

**Planned changes (blocked by §17):**
- Replace `base44.auth.me()` with Firebase `onAuthStateChanged`
- After Firebase auth, call `identityService.resolveIdentity(idToken)` to get Interactive Identity ID
- Store Interactive Identity ID in context for service-layer use
- Preserve `isLoadingAuth`, `isAuthenticated`, `logout`, `navigateToLogin`, `authError` interface
- Preserve `authReturnTo` return-to journey

**Why not changed:** Switching AuthContext to Firebase Auth would break all `base44.entities.X` operations (see §13).

---

## 11. Firebase UID → Interactive Identity Mapping Behaviour

**Entity:** `IdentityMapping` (Base44 entity, service-role only)

| Field | Type | Description |
|---|---|---|
| `auth_uid` | string | Firebase Auth UID |
| `identity_id` | string | Interactive Identity ID (Base44 User ID or `int_<uuid>`) |
| `email` | string | Canonical email (migration join key, not permanent key) |
| `email_verified` | boolean | Firebase email verification at mapping creation |
| `is_new_identity` | boolean | True if new identity was generated |
| `linked_providers` | array | Firebase auth providers linked to this account |

**RLS:** All client access denied (`read: false`, `delete: false`, `create/update: role "service"` which no user has). Only `base44.asServiceRole` can access.

**Idempotency (§7):** If a mapping exists by `auth_uid`, it is returned. No rematch by email. No overwrite.

**Email change (§5, §7):** Once `auth_uid → identity_id` exists, changing email does not change the mapping. The mapping is keyed by `auth_uid`, not email.

---

## 12. Base44 ID Preservation Confirmation

**Confirmed:** Existing Base44 User IDs are preserved as Interactive Identity IDs.

- `ResolveIdentity` looks up Base44 Users by email using `base44.asServiceRole.entities.User.filter({ email })`
- If found, uses `base44Users[0].id` (the Base44 User ID) as the `identity_id`
- No replacement ID is generated for existing users
- All domain records retain their existing identity references

---

## 13. Hybrid Base44 Data-Access Strategy — ⚠️ BLOCKER

### The Blocker (§17)

**Base44 SDK entity operations require a Base44 authenticated session.**

The Base44 SDK client (`src/api/base44Client.js`) is initialized with:
```js
export const base44 = createClient({
  appId,
  token: appParams.token,  // ← Base44 access token from localStorage
  requiresAuth: false,
  ...
});
```

`appParams.token` is sourced from `localStorage['base44_access_token']` (see `src/lib/app-params.js`), which is set exclusively by Base44's authentication flow:
- `base44.auth.loginViaEmailPassword()` → sets token
- `base44.auth.verifyOtp()` → sets token
- `base44.auth.loginWithProvider()` → sets token

**All entity operations** (`base44.entities.PersonalProfile.list()`, `base44.entities.Business.filter()`, etc.) send this token to the Base44 API for authorization. Without a valid Base44 token, these operations return 401 Unauthorized.

**Firebase Authentication produces a Firebase ID token, not a Base44 access token.** There is no mechanism to:
1. Exchange a Firebase token for a Base44 session token
2. Use a Firebase token to authorize Base44 SDK operations
3. Create a Base44 session from a Firebase session

### Impact

If `AuthContext` is switched to Firebase Auth:
- ✅ Firebase authentication works (login, register, Google, logout)
- ✅ Identity resolution works (ResolveIdentity backend function)
- ❌ **All domain data access fails** — every `base44.entities.X` call returns 401
- ❌ Dashboard, Profile, Business, Calendar, Messages, Specifications — all non-functional

### Potential Solutions (Not Implemented — Require Architecture Review)

**Option A: Dual Authentication (Parallel Sessions)**
Keep Base44 Auth running alongside Firebase Auth. After Firebase Auth, silently authenticate with Base44 using a backend function that generates a Base44 session. Use Firebase for auth authority, Base44 session for entity access.
- **Blocker:** No known Base44 API to generate a user session token from a service role. `base44.asServiceRole` provides entity access, not session-token generation.

**Option B: Service-Role Proxy**
Route all Base44 entity operations through backend functions that use `base44.asServiceRole`. The frontend sends the Firebase ID token; the backend verifies it, resolves the identity, and uses `asServiceRole` for data access.
- **Impact:** Requires rewriting every service to call backend functions instead of `base44.entities.X` directly. Massive change.
- **Security risk:** `asServiceRole` bypasses RLS. Security rules would need to be reimplemented in each backend function.

**Option C: Base44 Platform Support**
Request Base44 platform support for Firebase token exchange or a hybrid authentication mode.
- This is a platform-level capability that cannot be implemented from the application side.

### Recommendation

**Stop and escalate to Base44 platform support** to determine whether:
1. A Base44 API exists for service-role session-token generation
2. Base44 can accept Firebase tokens for entity authorization
3. A hybrid authentication mode is available on the platform

Until this is resolved, the M2 cutover cannot proceed safely.

---

## 14. Fields Written to Base44 (Not Firestore) During M2

Per §21, only the minimum identity records required for M2 are created. No domain collections are migrated.

**IdentityMapping entity (Base44):**

| Field | Written By | When |
|---|---|---|
| `auth_uid` | ResolveIdentity function | On first Firebase auth for a user |
| `identity_id` | ResolveIdentity function | On mapping creation |
| `email` | ResolveIdentity function | On mapping creation (canonical, for linking) |
| `email_verified` | ResolveIdentity function | On mapping creation |
| `is_new_identity` | ResolveIdentity function | On mapping creation |
| `linked_providers` | ResolveIdentity function | On mapping creation |

**No Firestore writes during M2.** Identity mappings are stored in the Base44 `IdentityMapping` entity for pragmatic access from the Base44 backend function. These will be migrated to Firestore `identityMappings/{authUid}` in M3.

**No domain collections touched.** PersonalProfile, ProfessionalProfile, Business, BusinessProfile, BusinessMembership, CalendarEvent, Availability, Conversation, Message, NotificationRecord, TrustRecord, VerificationRequest, Location, MediaAsset, Specification, SpecVersion — all remain on Base44, untouched.

---

## 15. Cloud Functions Deployed

**Base44 Backend Function (not Firebase Cloud Function):**

| Function | Purpose | Status |
|---|---|---|
| `ResolveIdentity` | Trusted identity resolution | ✅ Deployed and tested |

The `ResolveIdentity` function is a Base44 backend function (runs on Base44's Deno runtime), not a Firebase Cloud Function. It uses:
- Firebase REST API (`identitytoolkit.googleapis.com`) for token verification
- `base44.asServiceRole.entities.IdentityMapping` for mapping storage
- `base44.asServiceRole.entities.User` for email-based user lookup

**No Firebase Cloud Functions deployed.** The M2 scope only requires the identity-resolution path. Conversation, Notification, Trust, Booking, and Payment server functions remain outside M2 (per §18).

---

## 16. Secrets / Configuration Required

### Secrets (set via Base44 dashboard)

| Secret | Status | Used By |
|---|---|---|
| `FIREBASE_WEB_API_KEY` | ✅ Set | ResolveIdentity function (token verification) |

### Vite Environment Variables (required for frontend Firebase Auth)

These must be set in `.env` or the Base44 build environment for `firebaseClient.js`:

| Variable | Description |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain (e.g., `project.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |

**Status:** Not yet set. The `firebaseClient.js` warns if these are missing. Firebase Auth will not function until they are configured.

### Not Required (per §20)

- No Firebase service account keys in frontend code
- No Base44 service credentials in frontend code
- No secrets in Firestore documents or client-visible config

---

## 17. Automated Test Results

### M2 Identity Resolution Tests

**File:** `tests/identity-resolution.test.cjs`

9 test scenarios documented (per §27):
1. Existing Firebase UID + existing mapping
2. Firebase UID without mapping + unique existing verified email
3. Firebase UID without mapping + no existing account
4. Ambiguous email match rejected
5. Mapping reassignment rejected
6. Unverified email migration attempt handled
7. New Interactive identity creation
8. Email change after mapping does not change identity
9. Account-provider linking does not create duplicate Interactive identity

**Status:** Scenarios documented. Full automated execution requires a live Firebase project with configured VITE_FIREBASE_* env vars and valid Firebase ID tokens.

### Backend Function Tests (executed via test_backend_function)

| Test | Payload | Expected | Actual | Result |
|---|---|---|---|---|
| Missing token | `{}` | 400 MISSING_TOKEN | 400 MISSING_TOKEN | ✅ PASS |
| Invalid token | `{ idToken: "invalid" }` | 401 INVALID_TOKEN | 401 INVALID_TOKEN | ✅ PASS |
| Entity access | Service role list | Empty list, no error | 0 mappings, accessible | ✅ PASS |

---

## 18. M1.1 Security Rule Regression Results

**Test:** `npm run test:rules` (Firebase Emulator Suite)

```
Results: 33 passed, 0 failed, 33 total
```

All 33 M1.1 tests continue to pass. No regressions introduced by M2 infrastructure.

---

## 19. Manual Acceptance-Test Results

**Not executed.** Manual acceptance tests (§28) require the cutover to be active, which is blocked by §17.

The following tests are ready to execute once the blocker is resolved:
- Existing user → Firebase auth → existing Interactive Identity → existing Dashboard
- Existing Google user → Google → Firebase Auth → Identity Mapping → existing Interactive Identity
- New user → Register → Firebase Auth → new Interactive Identity → Onboarding
- Logout/re-login → existing mapping → same Interactive Identity
- Context restoration → Personal / Professional / Business → existing context

---

## 20. Rollback Strategy

**Base44 Authentication remains fully active.** No changes have been made to:
- `src/lib/AuthContext.jsx` — unchanged, uses Base44 auth
- `src/services/authService.js` — unchanged, wraps Base44 auth
- `src/api/base44Client.js` — unchanged, uses Base44 token
- `src/pages/Login.jsx` — unchanged, uses Base44 login
- `src/pages/Register.jsx` — unchanged, uses Base44 registration
- All service files — unchanged, use `base44.entities.X`

**Rollback path:** Since no cutover was performed, rollback is simply "do nothing." The M2 infrastructure (`firebaseAuthService.js`, `identityService.js`, `ResolveIdentity` function, `IdentityMapping` entity) exists alongside the active Base44 system but is not wired into the application.

If the cutover had been performed and needed rollback:
1. Revert `AuthContext` to use `authService` (Base44) instead of `firebaseAuthService`
2. Remove Firebase `onAuthStateChanged` listener
3. Clear `interactive_identity_id` from localStorage
4. Base44 auth resumes normally — all domain data is intact on Base44

**No Base44 users deleted. No Base44 auth records modified. No Base44 domain IDs changed.**

---

## 21. Base44 Limitation Discovered During Hybrid Operation

### Critical Limitation: No Firebase-to-Base44 Token Bridge

The Base44 SDK requires a Base44 access token for all entity operations. There is no API or mechanism to:
1. Generate a Base44 session token from a service role
2. Exchange a Firebase ID token for a Base44 session
3. Authorize Base44 SDK calls with a Firebase token

This makes a direct Firebase Auth cutover impossible without one of:
- Base44 platform support for token exchange
- A service-role proxy architecture (massive rewrite)
- Dual authentication (if a session-generation API exists)

### Secondary Limitation: Backend Function Auth Model

Base44 backend functions are designed to authenticate via `base44.auth.me()` (Base44 user session). The `ResolveIdentity` function deviates by using Firebase token verification instead. This works because:
1. The Firebase token is verified via REST API (not Base44 SDK)
2. Entity operations use `asServiceRole` (service credentials, not user session)
3. The function only operates on the caller's own data

But this pattern may not be supported for all backend function use cases. Future backend functions that need user-scoped Base44 operations would face the same blocker.

---

## 22. Users Requiring Manual Identity Resolution

The following scenarios may require manual/admin intervention:

| Scenario | Resolution |
|---|---|
| Multiple Base44 users with same email | Admin must deduplicate or assign canonical identity before migration matching |
| User without email access | Cannot receive Firebase password reset email — admin must create Firebase account and mapping manually |
| Mapping with same email but different identity_ids | `AMBIGUOUS_EMAIL_MAPPING` error — admin must reconcile mappings |
| Malformed Base44 User records (missing email) | Cannot match by email — admin must create mapping manually |

**No users currently require manual resolution** (no mappings have been created yet).

---

## 23. Conflicts With Approved Architecture

### Conflict 1: Identity Mappings in Base44 vs Firestore

**Spec:** `identityMappings/{authUid}` in Firestore (per M1.1 security rules)
**Implemented:** `IdentityMapping` entity in Base44

**Reason:** The `ResolveIdentity` backend function runs on Base44's Deno runtime. Accessing Firestore from a Base44 backend function would require Firebase Admin SDK (may not work in Deno) or Firestore REST API with service-account authentication (complex). Storing in a Base44 entity allows direct access via `base44.asServiceRole`.

**Resolution:** Mappings stored in Base44 during M2. Migrate to Firestore `identityMappings` in M3 when Firebase Cloud Functions are deployed and can access Firestore natively.

### Conflict 2: Backend Function Authentication

**Spec/Guide:** Backend functions should authenticate via `base44.auth.me()`
**Implemented:** `ResolveIdentity` authenticates via Firebase token verification

**Reason:** In M2, the caller is Firebase-authenticated, not Base44-authenticated. `base44.auth.me()` would fail. The Firebase token is the auth proof.

**Resolution:** This is a necessary M2 deviation. The function is secure because it verifies the Firebase token and only operates on the caller's own data. Future functions that need user-scoped Base44 operations will face the same blocker until the hybrid bridge is resolved.

### Conflict 3: Email Verification UX

**Spec:** Preserve existing Interactive registration/onboarding UX (OTP flow)
**Firebase:** Uses email-link verification, not OTP

**Reason:** Firebase Auth does not support OTP-based email verification. It sends a verification link to the user's email.

**Resolution:** The registration UX will need updating when the cutover proceeds. The OTP step in Register.jsx would be replaced with a "Check your email for verification link" step. This is a UX change, not an architecture change.

---

## M2 Acceptance State

```
Firebase Authentication          ← IMPLEMENTED, NOT ACTIVE
        ↓
identityMappings (Base44)        ← IMPLEMENTED, NOT ACTIVE
        ↓
Interactive Identity             ← RESOLUTION LOGIC READY
        ↓
Base44 Domain Data               ← BLOCKED (§17: no Firebase-to-Base44 token bridge)
```

**Authentication authority:** Base44 (unchanged — cutover blocked)
**Interactive identity authority:** Interactive stable Identity ID (resolution logic ready)
**Domain data authority:** Base44 (unchanged)

**No domain identity replaced by Firebase UID.** ✅
**No domain collections migrated.** ✅
**No Base44 domain data removed.** ✅
**No Booking or Payments begun.** ✅

---

## Next Steps

1. **Escalate §17 blocker to Base44 platform support** — determine if a Firebase-to-Base44 token bridge or hybrid auth mode exists
2. **Configure Vite environment variables** — set `VITE_FIREBASE_*` env vars for frontend Firebase Auth
3. **Once blocker resolved:** Wire `firebaseAuthService` into `AuthContext`, activate identity resolution, run manual acceptance tests
4. **Do not begin M3** — domain data migration is outside M2 scope
5. **Do not begin Booking or Payments**

**M2 infrastructure is complete. Cutover is blocked pending platform support for hybrid authentication.**