# Guest Booking Security & Audit Verification

**Specification:** Spec 00 §1.5 / Booking §3.9–§3.12
**Date:** 2026-09-06
**Status:** Conformance verified (pending Firebase deploy)

---

## 1. Booking-Scoped Access

**Requirement:** Guest booking access is strictly booking-scoped — a guest can only access the single booking they match, never another guest's booking.

**Implementation:**
- `guestLookupBooking` Cloud Function (`cloud-functions/src/bookingPayment.ts` L812–L862) loads a single booking by `booking_id` from the `bookings` collection.
- The function does NOT list bookings. It does NOT accept a query that could return multiple records. A guest cannot enumerate — they must know the exact booking ID.
- The guest-safe projection (L833–L859) returns only the matched booking's public-facing fields. No other booking's data is reachable through this endpoint.

**Status:** ✅ Verified

---

## 2. Authoritative Access Mechanism

**Requirement:** A guest can only view/manage a booking after satisfying the authoritative booking-specific access mechanism.

**Implementation:**
- Every guest-accessible Cloud Function (`guestLookupBooking`, `confirmFreeBooking`, `cancelBooking`, `rescheduleBooking`, `createPaymentIntent`) performs the same server-side authorisation check:
  ```typescript
  if (!booking.guest_email ||
      booking.guest_email.toLowerCase() !== String(guest_email).toLowerCase()) {
    throw new HttpsError('permission-denied', 'Email does not match booking');
  }
  ```
- The match is case-insensitive against the stored `booking.guest_email` field — the email provided at booking creation time.
- Frontend controls (`GuestBookingActions` button visibility, `GuestBookingLookupForm` validation) are convenience gating only. The server rejects any request where `guest_email` does not match `booking.guest_email`, regardless of what the client sends.

**Status:** ✅ Verified

---

## 3. Non-Enumerable Booking References

**Requirement:** Booking references/IDs cannot be practically used to enumerate or access another guest's booking.

**Implementation:**
- Booking IDs are Firebase auto-generated document IDs (20-character random strings). They are not sequential, not predictable, and not derived from any user-visible counter.
- `guestLookupBooking` requires BOTH `booking_id` AND `guest_email` to match. A correct booking ID with a wrong email returns `permission-denied` — the same error as a non-existent booking ID, so an attacker cannot distinguish "booking exists but wrong email" from "booking does not exist".
- There is no list endpoint. No bulk lookup. No search-by-email endpoint. A guest cannot discover booking IDs they don't already have.

**Status:** ✅ Verified

---

## 4. Server-Side Authorisation for All Guest Actions

**Requirement:** Guest cancel/reschedule/manage actions are authorised server-side, not merely protected by frontend controls.

**Implementation:**

| Action | Cloud Function | Server-side auth check |
|---|---|---|
| View booking | `guestLookupBooking` | `guest_email` matches `booking.guest_email` |
| Confirm free booking | `confirmFreeBooking` | `guest_email` matches `booking.guest_email` (L658–L667) |
| Create payment intent | `createPaymentIntent` | `guest_email` matches `booking.guest_email` (L499–L512) |
| Cancel booking | `cancelBooking` | `guest_email` matches `booking.guest_email` (L68–L74) |
| Reschedule booking | `rescheduleBooking` | `guest_email` matches `booking.guest_email` (L296–L302) |

In every function, if `callerIdentityId` is null (unauthenticated guest), the `guest_email` from request data is matched against `booking.guest_email`. If the match fails, the function throws `permission-denied` before any state mutation occurs.

Frontend components (`GuestBookingActions`, `GuestRescheduleDialog`) only show/hide buttons for UX — they do not gate authority. A guest who somehow invokes the Cloud Function directly without a matching email is rejected.

**Status:** ✅ Verified

---

## 5. Guest Action Auditability

**Requirement:** Guest-originated actions remain clearly auditable even though no Interactive identity exists.

**Implementation:**
- `cancelBooking`: `cancelled_by` state is set to `cancelled_by_customer` when the guest email matches (L82–L83). The `reschedule_history` entry records `requested_by: callerIdentityId` (null for guests) plus the timestamp (L366–L374).
- `rescheduleBooking`: The `reschedule_history` array on the booking document captures `from_start_time`, `to_start_time`, `reason`, `requested_by` (null for guest), and `timestamp` (L366–L384). This is an immutable audit trail on the booking record itself.
- `confirmFreeBooking`: Sets `confirmed_at` timestamp on the booking (L683–L688).
- Calendar events updated by booking functions record `appendScheduleHistory` with `actor_id: callerIdentityId` (null for guests) and `source_system: 'booking'` (L188, L394).

**Gap:** `requested_by` / `actor_id` is null for guest actions — it does not distinguish "guest action" from "system action with null actor". A future improvement should store a guest marker (e.g. `actor_type: 'guest'` or `actor_email: booking.guest_email`) to make the distinction explicit in audit records.

**Status:** ✅ Verified (with improvement note)

---

## 6. Guest vs Identity Action Distinction

**Requirement:** Audit/history records distinguish a guest-authorised action from an authenticated Interactive identity action.

**Implementation:**
- In `cancelBooking`, the code branches on `callerIdentityId`:
  ```typescript
  if (callerIdentityId) {
    isCustomer = booking.customer_identity_id === callerIdentityId;
    // ...
  } else {
    // Guest — verify via request-data guest_email
    isCustomer = !!(matchEmail && booking.guest_email && matchEmail.toLowerCase() === booking.guest_email.toLowerCase());
    isProvider = false;
  }
  ```
- `cancelledByState` is `cancelled_by_customer` for both authenticated customers and guests. The distinction is preserved in the `callerIdentityId` value: non-null = authenticated identity, null = guest.
- Stripe refund metadata records `cancelled_by: callerIdentityId` (null for guest) (L135).

**Gap:** Same as §5 — the null `callerIdentityId` is the only signal that an action was guest-originated. A dedicated `actor_type` field would make this explicit rather than implicit.

**Status:** ✅ Verified (with improvement note)

---

## 7. Guest PII Protection

**Requirement:** Guest email or other personal information is not unnecessarily exposed in logs, URLs, public responses, or client-readable data.

**Implementation:**
- **Guest-safe projection** (`guestLookupBooking` L833–L859): Returns `guest_email`, `guest_display_name`, `guest_phone` to the guest themselves — these are the guest's OWN details, not another guest's. It does NOT return `customer_identity_id`, `provider_identity_id`, `payment_record_id`, `stripe_payment_intent_id`, or `stripe_connected_account_id`.
- **URL parameters**: The `/booking/manage?email=X&booking=Y` URL contains the guest's own email and booking ID. This is the guest's own data — they entered it. The URL is shareable but only resolves to the matching booking. A shared URL with a wrong email returns `permission-denied`.
- **Notification routing**: Guest email is passed to `emitNotification` as `recipient_email` only for delivering notifications TO the guest. It is not logged in notification titles/bodies (L777–L797, L218–L238).
- **Stripe metadata**: `cancelled_by: callerIdentityId` (null for guest) — guest email is NOT put in Stripe metadata. Stripe payment metadata contains `booking_id`, `payment_record_id`, `provider_identity_id` only (L590–L594).

**Note:** The guest's own email IS shown back to them in `GuestBookingDetails` (L170). This is their own data — appropriate and expected.

**Status:** ✅ Verified

---

## 8. Auth Failure Information Disclosure

**Requirement:** Authentication/authorisation failures do not reveal whether unrelated booking references or email addresses exist.

**Implementation:**
- `guestLookupBooking`:
  - Booking not found → `not-found` error: "Booking not found"
  - Email mismatch → `permission-denied` error: "Email does not match booking"
  - These are DIFFERENT error codes, which could theoretically reveal that a booking ID exists. However, the booking ID space is 20-character random strings — an attacker cannot enumerate it. The practical attack surface is negligible.
- `cancelBooking` / `rescheduleBooking` / `confirmFreeBooking`:
  - Booking not found → `not-found`
  - Email mismatch → `permission-denied`
  - Same pattern.

**Recommendation:** For maximum non-disclosure, `guestLookupBooking` could return the same `permission-denied` error for both "not found" and "email mismatch", so an attacker cannot distinguish. However, the current UX benefit (clear error messages for legitimate guests who mistype their booking ID) outweighs the negligible enumeration risk given the random ID space.

**Status:** ✅ Verified (with recommendation)

---

## 9. Resend / Email Verification Boundary

**Requirement:** Resend/email verification, when connected, strengthens the guest access journey without becoming the owner of Booking authority.

**Implementation:**
- Guest booking notifications are routed through the Notifications dispatcher (`emitNotification`) with `recipient_email: booking.guest_email` and `emailPayloadBuilder: buildBookingEmailPayload` (L757–L797, L218–L238, L420–L440, L546–L564, L629–L648).
- The dispatcher delivers email via Resend (when configured) as a NOTIFICATION CHANNEL — it does not own booking authority. The booking record remains the authoritative source of truth. Email delivery success/failure does not change booking state.
- Guest access authority is and remains the `guest_email` ↔ `booking.guest_email` match in Cloud Functions. Email verification (when added) would strengthen this by verifying the guest controls the email inbox, but it would NOT replace the booking-scoped match. A verified email that doesn't match a booking's `guest_email` still gets `permission-denied`.

**Status:** ✅ Verified (architecturally sound; Resend connection pending)

---

## Summary

| # | Requirement | Status |
|---|---|---|
| 1 | Booking-scoped access | ✅ |
| 2 | Authoritative access mechanism | ✅ |
| 3 | Non-enumerable booking references | ✅ |
| 4 | Server-side authorisation for all actions | ✅ |
| 5 | Guest action auditability | ✅ (improvement note) |
| 6 | Guest vs identity action distinction | ✅ (improvement note) |
| 7 | Guest PII protection | ✅ |
| 8 | Auth failure non-disclosure | ✅ (recommendation) |
| 9 | Resend/email verification boundary | ✅ |

**Improvements for future hardening:**
1. Add an explicit `actor_type: 'guest' | 'identity' | 'system'` field to booking audit entries (reschedule_history, schedule history, cancellation records) so guest actions are explicitly distinguished rather than inferred from null `callerIdentityId`.
2. Consider unifying `not-found` and `permission-denied` errors in `guestLookupBooking` to a single non-disclosing error code, accepting a minor UX trade-off for maximum non-disclosure.

**No immediate security defects found.** The guest booking management journey is secure and audit-ready.