# Interactive Calendar System — V2 Conformance Report

**Specification:** Interactive Calendar System Specification v2.0
**Date:** 2026-09-05
**Status:** V2 conformance complete (pending Firebase deploy + index/secret config)

---

## Summary

This report maps the V2 specification sections to the implemented behaviour and
records the architectural decisions, verification status, and remaining
operational steps. All calendar mutation authority, conflict enforcement,
realtime propagation, and recurrence integrity are routed through canonical
server-side writers; the client is a presentation + UI-gating layer only.

> **Build/test execution:** the Vite build and `tsc --noEmit` could not be
> executed in this sandbox — `spawnSync` shell spawns time out (ETIMEDOUT),
> an environment limitation. Verification was performed by static review of
> imports, call signatures, emit wiring, and Firestore rules. Firebase
> emulator rule tests additionally require a Java runtime not present here.

---

## 1. Authority & Ownership (§3–§10, §14, §45, §52, §108)

| Requirement | Implementation | Status |
|---|---|---|
| One identity, multiple operating contexts | `owner_type` ∈ {identity, business}; Personal/Professional are `operating_context` provenance on a single identity-owned set | ✅ |
| Stable ID references (no email ownership) | `owner_id`, `created_by_id`, `assigned_identity_ids`, `invited_identity_ids` are stable Interactive identity IDs | ✅ |
| Immutable creator | `created_by_id` set on create, never overwritten by later editors | ✅ |
| Authority ≠ visibility ≠ participation | `canEditEvent` / `canCancelEvent` / `canSetPersonalLifecycle` / `canDeleteEvent` UI gates in `calendarAuthority.js`; server re-checks in `saveCalendarEvent` | ✅ |
| Booking-owned immutability | Booking events (`source_system: 'booking'`) excluded from drag-reschedule, inline cancel, delete; routed to Booking flow | ✅ |
| Destructive delete (§52) vs cancel | `deleteCalendarEvent` (personal manual only, history preserved §108) separate from cancel (lifecycle_state) | ✅ |
| Schedule-change history (§48, §104, §105) | `calendarEventHistory` append on every mutation; `EventHistoryTimeline` read-only UI | ✅ |

## 2. Conflict Enforcement (§38, §39, §41)

| Requirement | Implementation | Status |
|---|---|---|
| Server-side transaction + sentinel | `saveCalendarEvent` transaction + overlap sentinel for protected Professional/Business time | ✅ |
| Resource-scoped conflicts (§41) | Overlap detection scoped to shared `resource_label` for same owner | ✅ |
| Conflict UX classification | `failed-precondition` → "Time slot unavailable" toast; no divergent client conflict engine | ✅ |
| Alternative suggestions (§38) | `suggestAlternativeSlots` offers nearby non-conflicting slots from loaded events | ✅ |

## 3. Recurrence (§53–§58)

| Requirement | Implementation | Status |
|---|---|---|
| RRULE expansion | `recurrence.js` engine; occurrence identity `seriesId__originalStart` | ✅ |
| Occurrence exceptions (§55–§56) | `saveOccurrenceException` canonical writer (cancel/reschedule single occurrence) | ✅ |
| "This and future" split (§57) | `splitRecurrenceSeries` — old series `effective_until`, new series `superseded_by_id` | ✅ |
| Historical integrity | Past occurrences preserved on supersede; `effective_until` gates generation | ✅ |
| Drag single occurrence | DnD on a recurring occurrence → exception (not series-wide edit) | ✅ |

## 4. Views & Occurrence Model (§11, §18–§22, §115)

| Requirement | Implementation | Status |
|---|---|---|
| Today / Week / Day / Agenda / Month | `TodayView`, `WeekView`, `DayView`, `AgendaView`, month grid | ✅ |
| Shared occurrence model | `normalizeToOccurrences` + `filterOccurrences` + `groupOccurrencesByDate` | ✅ |
| Category + colour (§11, §22) | `EVENT_CATEGORIES`, `COLOR_PALETTE`, `getEventChipClasses`; filter by category | ✅ |
| Search + filters | `CalendarSearchBar` (visibility, source, lifecycle, category, context, period) | ✅ |
| Responsive (§115) | Week collapses to stacked list <640px; Today default on mobile | ✅ |
| Accessibility (§114) | Semantic `<time>`, ARIA labels, keyboard nav, focus rings, reduced-motion CSS | ✅ |
| Dual-timezone (§95) | `EventDetailModal` dual-TZ display | ✅ |
| ICS export (§44, §103) | `icsExport` + `AddToCalendarButton` | ✅ |

## 5. Participation & Invitations (§23–§37, §42–§43)

| Requirement | Implementation | Status |
|---|---|---|
| One authoritative event | Invitees see the same event record; no per-user copies | ✅ |
| Participation state machine | `CalendarParticipation` pending/accepted/declined/revoked | ✅ |
| Email resolution | `invited_identity_ids` (resolved) vs `invited_guest_emails` (unresolved) | ✅ |
| Invitation UX | `EventInvitationBadge` / `InvitationActions` across all views | ✅ |
| Read-only detail for invitees | `EventDetailModal` (no edit controls); `EventModal` only for editors | ✅ |
| Deep-link auto-open | `/calendar?event=X` opens correct modal (edit vs read-only) | ✅ |

## 6. Availability (§27, §28, §46–§47)

| Requirement | Implementation | Status |
|---|---|---|
| Working hours + exceptions | `AvailabilityRule` working_hours/available/unavailable/blocked; `specific_date` overrides | ✅ |
| Consumed by booking | Server-side slot resolution reads availability | ✅ |
| Public availability | Derived for directory/professional advert | ✅ |

## 7. Reminders (§59–§63, §119)

| Requirement | Implementation | Status |
|---|---|---|
| Per-participant reminders | `ReminderRule` (event_id + identity_id + offset) | ✅ |
| Channels | in_app / email / push via `delivery_channels` | ✅ |
| Idempotency (§62, §119) | `last_dispatched_occurrence` guard; `reminderSweep` | ✅ |
| Canonical writer | `saveReminderRule` / `deleteReminderRule` Cloud Functions (rules deny direct writes) | ✅ |

## 8. Lifecycle (§15, §16, §106–§111, §118)

| Requirement | Implementation | Status |
|---|---|---|
| Schedule states (§15) | pending/held/scheduled/upcoming/in_progress/historical/cancelled/removed/superseded | ✅ |
| Personal-only states (§16) | completed/skipped/rescheduled/archived via `setEventLifecycle` | ✅ |
| Source unavailable (§106–§111) | `handleSourceUnavailable` redacts + transitions; privacy-safe UI state | ✅ |
| Identity deactivation cleanup (§108) | `deactivateIdentityCalendar` | ✅ |
| Tentative hold lifecycle (§118) | `bookingCalendarEvent` hold create/release; `holdSweep` expiry | ✅ |

## 9. Realtime (§99, §112)

| Requirement | Implementation | Status |
|---|---|---|
| Secure signal channel | `calendarSignals/{identityId}` doc; single-doc `onSnapshot` (rules-evaluable) | ✅ |
| No polling | Replaced with event-driven signal subscription | ✅ |
| Server-only writes | `allow write: if false`; Cloud Functions (Admin SDK) bump version | ✅ |
| No data leakage | Signal carries only version + timestamp | ✅ |
| Emit on all mutations | event create/update/delete, participation, exception, source-unavailable, booking event + hold | ✅ |
| Offline indicator (§112) | `OfflineIndicator` component | ✅ |

## 10. Combined Business/Staff Calendar (§70–§74)

| Requirement | Implementation | Status |
|---|---|---|
| Aggregation over canonical events | `getCombinedBusinessCalendar` + `getCalendarView` (no separate store) | ✅ |
| Business + assigned + invited | Deduplicated by authoritative Event ID | ✅ |
| Staff assignment = view only | `assigned_identity_ids` grants no mutation; `manage_calendar` permission required | ✅ |

## 11. Messaging Integration (§79, §80)

| Requirement | Implementation | Status |
|---|---|---|
| Rich event cards | `MessageEventCard` in conversations | ✅ |
| SPA-native action routing | Notification actions use React Router `<Link>` | ✅ |

## 12. Dashboard (§82)

| Requirement | Implementation | Status |
|---|---|---|
| Calendar widget | `CalendarWidget` on Dashboard | ✅ |

## 13. Query Hardening

| Requirement | Implementation | Status |
|---|---|---|
| Server-side aggregate read | `getCalendarView` callable (Admin SDK) bypasses Firestore list-query limitation | ✅ |
| Failed sub-query observability | `onQueryError` callback → visible amber alert (never silent empty) | ✅ |
| Deduplication | `dedupeEventsById` defensive guard | ✅ |

---

## §49 Drag-and-Drop Reschedule (this cycle)

**Implemented:** native HTML5 drag-and-drop in `WeekView` and `DayView`.

- **Draggable gate** (`isDraggable`): edit authority (`canEditEvent`), manual
  source only (booking/source-owned excluded — §45), timed (not all-day),
  active (not cancelled/removed), not source-unavailable.
- **Drop target:** day/hour cell; computes a viewer-tz-aware new start
  preserving the original within-hour minute offset; duration preserved.
- **Canonical routing:** `rescheduleOccurrence` calls `updateEvent`
  (non-recurring) or `saveOccurrenceException` (recurring single occurrence)
  — both canonical server-side writers. No direct Firestore writes.
- **Conflict UX:** `failed-precondition` rejection → "Time slot unavailable"
  toast with `suggestAlternativeSlots` suggestions.
- **Accessibility:** DnD is a progressive enhancement; keyboard users retain
  the edit modal + `OccurrenceActions` reschedule path.

---

## Remaining Operational Steps (require user approval / external setup)

1. **Firebase deploy** — cloud functions (`calendarSignal`, emit wiring in
   `calendarEvent` / `calendarParticipation` / `occurrenceException` /
   `handleSourceUnavailable` / `bookingCalendarEvent`) + `firestore.rules`
   (calendarSignals collection). **Not deployed — awaiting approval.**
2. **Firestore composite indexes** — `firestore.indexes.json` deploy.
3. **Resend** — configure for notification email delivery.
4. **STRIPE_WEBHOOK_SECRET** — set as Firebase secret for webhook verification.
5. **Stripe webhook endpoint** — register URL.
6. **Plan fee values** — authoritative population of `SubscriptionPlan.fee_rule`.
7. **Email domain DNS** — SPF/DKIM/DMARC verification for production email.

## Known Limitations (platform-level)

- Phone verification / Apple Sign-in not in platform SDK.
- Verification review process stubbed.
- Push notification delivery stubbed.
- Geocoding uses rate-limited Nominatim (commercial provider needed for scale).
- GitHub push blocked by expired platform token.