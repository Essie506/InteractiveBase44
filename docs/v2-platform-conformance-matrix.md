# Interactive Platform — V2 Full Ecosystem Conformance Matrix

**Date:** 2026-09-06
**Scope:** 24-specification inventory — cross-system ecosystem build
**Status:** Source-level implementation complete (pending production infrastructure: Stripe Price IDs, DNS/SPF/DKIM, Firestore indexes, cloud function deployment)

---

## Build Verification (this session)

| Check | Result |
|---|---|
| Cloud Functions `tsc --noEmit` | ✅ 0 errors |
| Frontend `vite build` | ✅ success |
| V2 module tests (23 tests) | ✅ 23 passed, 0 failed |
| Directory URL state tests (26 tests) | ✅ 26 passed, 0 failed |
| Directory price sort tests (16 tests) | ✅ 16 passed, 0 failed |
| Match scoring tests (16 tests) | ✅ 16 passed, 0 failed |
| Distance logic tests (32 tests) | ✅ 32 passed, 0 failed |
| Directory events tests (50 tests) | ✅ 50 passed, 0 failed |

---

## Spec 15 — Search & Discovery

| Requirement | Implementation | Status |
|---|---|---|
| Provider-independent index adapter | `searchIndexAdapter.js` (Firestore default; Algolia/Typesense pluggable) | ✅ |
| Server-side index maintenance | `indexContent` / `unindexContent` callables + `indexContentInline` / `unindexContentInline` helpers | ✅ |
| Posts indexed on publish | `post.ts` → `indexContentInline(id, 'post', {contentType:'post', ...})` | ✅ |
| Workouts indexed on publish | `workout.ts` → `indexContentInline(id, 'workout', {contentType:'workout', ...})` | ✅ |
| Calendar events indexed on publish | `calendarEvent.ts` → `indexContentInline(eventId, 'calendar_event', {contentType:'calendar_event', ...})` | ✅ |
| Professional profiles indexed on directory-list | `professionalProfile.ts` → `indexContentInline(identityId, 'professional', ...)` | ✅ |
| Business profiles indexed on public-list | `businessProfile.ts` → `indexContentInline(businessId, 'business', ...)` | ✅ |
| Promotions indexed on create/activate | `promotion.ts` → `indexContentInline(id, 'promotion', {contentType:'promotion', ...})` | ✅ |
| Unindex on delete/archive/unlist | All writers call `unindexContentInline` on lifecycle exit | ✅ |
| Content type + system correctly set | All 7 content types pass `contentType` matching `system` in `buildIndexDocument` | ✅ |
| Sponsored placement (§19.7) | `loadSponsoredTargets` + `annotateSponsored` tags matching results; sort boosts sponsored to top in 'recommended' | ✅ |
| Sponsored does not suppress organic | Sponsored items ordered first, organic results follow in normal match-score order — no replacement/fabrication | ✅ |
| Cross-system search (SearchPage) | `searchIndexedContent` queries all 6 content types via adapter | ✅ |
| Autocomplete suggestions | `getSuggestions` prefix-matches index titles | ✅ |

---

## Spec 17 — Plans & Monetisation (Subscriptions)

| Requirement | Implementation | Status |
|---|---|---|
| V2 6-plan model (Pro Basic/Plus/Pro, Biz Basic/Plus/Pro) | `SubscriptionPlan` entity with `tier` (basic/plus/pro) × `family` (professional/business) | ✅ |
| Subscription return shape uses `plan_tier` | `getMySubscription` cloud function returns `{ plan_id, plan_name, plan_tier, status, ... }` | ✅ |
| Frontend reads `plan_tier` (not `tier`) | `Promotions.jsx`, `GrowthHub.jsx`, `Plans.jsx` all use `sub?.plan_tier` | ✅ |
| Family derived from operating context | Promotions/GrowthHub derive `family` from `active_context`, not from subscription return shape | ✅ |
| Stripe Checkout subscription | `createSubscriptionCheckout` creates Stripe session + 'selected' record | ✅ |
| Stripe webhook = source of truth | `stripeWebhook.ts` activates/cancels subscriptions on verified signature | ✅ |
| Customer Portal | `createCustomerPortal` for billing management | ✅ |
| Free tier = no subscription record | Missing subscription = Tier 1 free (no checkout needed) | ✅ |
| Growth Package linkage | `SubscriptionPlan.growth_package_id` → `GrowthPackage` entitlements | ✅ |

---

## Spec 18 — Dashboard

| Requirement | Implementation | Status |
|---|---|---|
| Module-based composition | `moduleRegistry.js` with context-aware module selection | ✅ |
| Personal / Professional / Business modules | `getModulesForContext` returns context-appropriate modules | ✅ |
| Quick Actions module | `QuickActionsModule` surfaces Growth Hub + Promotions for pro/business contexts | ✅ |
| Growth Hub teaser module | `GrowthHubTeaserModule` links to full Growth Hub page | ✅ |
| Profile completeness module | `ProfileCompletenessModule` | ✅ |
| Upcoming events module | `UpcomingEventsModule` | ✅ |
| Businesses module | `BusinessesModule` for business context | ✅ |
| Calendar widget | `CalendarWidget` | ✅ |
| Dashboard consumes corrected data | Modules link to Growth Hub/Promotions which use `plan_tier` | ✅ |

---

## Spec 19 — Promotions & Business Growth Hub

| Requirement | Implementation | Status |
|---|---|---|
| GrowthPackage entity (§19.3/§19.5) | `GrowthPackage` with tier, family, capabilities, campaign_types, max_active_campaigns | ✅ |
| GrowthPackage ↔ SubscriptionPlan link | `SubscriptionPlan.growth_package_id` references GrowthPackage | ✅ |
| Promotion entity (§19.5) | `Promotion` with campaign_type, target_content_references, budget, status lifecycle | ✅ |
| Server-side campaign writer | `saveCampaign` cloud function — enforces owner authority + entitlements | ✅ |
| Campaign type entitlement check | `saveCampaign` validates `campaign_type` against Growth Package `campaign_types` | ✅ |
| Max active campaigns check | `saveCampaign` + `updateCampaignStatus` enforce `max_active_campaigns` on create/activate | ✅ |
| Business admin authority | `saveCampaign` / `updateCampaignStatus` require `hasBusinessRole(owner/admin)` for business campaigns | ✅ |
| Identity authority | `saveCampaign` / `updateCampaignStatus` verify `owner_id === callerIdentityId` for identity campaigns | ✅ |
| Campaign status lifecycle | `updateCampaignStatus` supports draft/pending_review/active/paused/completed/rejected/expired | ✅ |
| Campaign create wired to frontend | `CampaignEditorDialog` → `callSaveCampaign` → `saveCampaign` cloud function | ✅ |
| Campaign pause/activate wired | `CampaignCard` → `callUpdateCampaignStatus` → `updateCampaignStatus` cloud function | ✅ |
| Active campaigns indexed for search | `saveCampaign` / `updateCampaignStatus` index/unindex based on active state | ✅ |
| Sponsored placement in Directory | `loadSponsoredTargets` + `annotateSponsored` + sort boost in `filterResults` | ✅ |
| Growth Opportunity entity (§5) | `GrowthOpportunity` with stage (build/grow/scale), opportunity_type, subscription_tier_required | ✅ |
| Growth Hub guidance adapter | `guidanceAdapter.js` (provider-independent; static curated default; LLM pluggable) | ✅ |
| Growth Hub page | `GrowthHub.jsx` — context-aware opportunities + guidance panel + journey stages | ✅ |
| Growth Hub ↔ subscription resolution | `GrowthHub.jsx` uses `getMySubscription(businessId)` → `plan_tier` for tier-gated opportunities | ✅ |
| Growth stage determination | `determineStage` from profile completeness + booking/campaign signals | ✅ |
| Promotions page | `Promotions.jsx` — campaign list, Growth Package summary, create/pause actions | ✅ |

---

## Spec 12 — Workout System

| Requirement | Implementation | Status |
|---|---|---|
| Workout Identity Engine (§9) | `creator_identity_id` immutable after creation | ✅ |
| Owner type (identity/business) | `owner_type`, `owner_id`, `operating_context` | ✅ |
| Workout Type Engine (§10) | 15 valid types validated server-side | ✅ |
| Publication lifecycle (§15) | draft → published → archived → retired | ✅ |
| Visibility (public/connections/private) | `visibility` field enforced | ✅ |
| Pricing (free/paid) | `is_free` + `price_pence` with invariant | ✅ |
| Search indexing on publish | `indexContentInline` for published+public workouts | ✅ |
| Search unindex on archive | `unindexContentInline` on delete/archive | ✅ |
| Server-side writer | `saveWorkout` / `deleteWorkout` cloud functions | ✅ |
| Frontend editor | `WorkoutEditor.jsx` + `workoutService.js` | ✅ |
| Workout detail + creator backlink | `WorkoutDetail.jsx` with `WorkoutCreatorBadge` | ✅ |
| Community interaction | `ReactionBar`, `CommentSection`, `ShareButton` on workout detail | ✅ |

---

## Post System V2

| Requirement | Implementation | Status |
|---|---|---|
| 11-type Post Type Engine (§9) | standard, achievement, educational, workout, business_update, promotion, event, calendar_event, blog_share, progress_update, community_question | ✅ |
| Universal Post Model (§8) | `linked_content_references` (stable IDs, not copies), `mentions`, `hashtags`, `locality_settings` | ✅ |
| Author type (identity/business) | `author_type`, `author_identity_id`, `business_id`, `publishing_account_id` | ✅ |
| Visibility + lifecycle | `visibility` (public/connections/private), `lifecycle_state` (draft/published/archived/deleted/under_review) | ✅ |
| Discovery eligibility | `discovery_eligibility` flag + indexing on publish | ✅ |
| Search indexing on publish | `post.ts` → `indexContentInline` for published+public+eligible posts | ✅ |
| Search unindex on delete | `deletePost` → `unindexContentInline` | ✅ |
| Server-side writer | `savePost` / `deletePost` cloud functions with authority checks | ✅ |
| Frontend editor | `PostEditor.jsx` with post type selector, linked content picker, media | ✅ |
| Feed | `Feed.jsx` — cross-system feed of posts + commentary shares | ✅ |
| Post card | `PostCard.jsx` with media gallery, linked references, community interaction | ✅ |

---

## Spec 14 — Share Engine / Community Interaction

| Requirement | Implementation | Status |
|---|---|---|
| Simple vs Commentary share (§14.4) | `Share` entity with `share_type` (simple/commentary) + `commentary_body` | ✅ |
| Reference, not duplicate (§14.3) | `target_system`, `target_type`, `target_id` — stable references | ✅ |
| Share lifecycle (§14.9) | active/edited/hidden/archived/deleted/restored/under_review | ✅ |
| Visibility inheritance (§14.7) | Share inherits original visibility unless more restrictive | ✅ |
| Reaction types (§14) | support, celebrate, strong, nice_work, helpful, inspiring | ✅ |
| Comment threading (§21) | `Comment` with `parent_comment_id`, `reply_count` | ✅ |
| Save / collections (§36, §38) | `Save` entity with `collection_ref` | ✅ |
| Server-side writers | `toggleReaction`, `createComment`, `deleteComment`, `toggleSave`, `createShare`, `deleteShare` | ✅ |
| Frontend components | `ReactionBar`, `CommentSection`, `ShareButton`, `ShareDialog`, `SavedItemCard` | ✅ |

---

## Calendar System v2.0

| Requirement | Implementation | Status |
|---|---|---|
| Authority & ownership (§3–§10) | `owner_type` (identity/business), `operating_context` provenance, immutable `created_by_id` | ✅ |
| Conflict enforcement (§38–§41) | Server-side transaction + overlap sentinel + resource-scoped conflicts | ✅ |
| Recurrence (§53–§58) | RRULE expansion, occurrence exceptions, series split, historical integrity | ✅ |
| Views (§11, §18–§22) | Today/Week/Day/Agenda/Month + occurrence model | ✅ |
| Participation (V2 Phase 3) | `CalendarParticipation` separate from event lifecycle; accept/decline/revoke | ✅ |
| Personal timeline state | `personal_lifecycle_state` + `hidden_from_timeline` (participant-only) | ✅ |
| Reminders (§59–§63) | `ReminderRule` with offset, channels, idempotency guard | ✅ |
| Source unavailable (§106–§111) | `handleSourceUnavailable` — privacy-safe state, redacted detail, history preserved | ✅ |
| Public projection | `calendarEventsPublic` — no meeting_url, no attendee identities | ✅ |
| Search indexing | Public listable events indexed on publish, unindexed on cancel/delete | ✅ |
| Notifications | Server-side dispatcher + email payloads + idempotency | ✅ |

---

## Media System

| Requirement | Implementation | Status |
|---|---|---|
| Authoritative media records | `MediaAsset` entity in Firestore | ✅ |
| Provider-independent architecture | `mediaProcessingAdapter.js` + `mediaDeliveryAdapter.js` (Vimeo pluggable) | ✅ |
| Lifecycle (§10) | pending_upload → uploading → validating → processing → active | ✅ |
| Security screening (§11) | `processing_intent.screen` flag; quarantined state | ✅ |
| Source domain authorization | `source_domain` + `source_ref_id` + `authorized_identity_ids` | ✅ |
| Storage rules | Source-domain authorization enforced server-side | ✅ |
| Derivatives | Thumbnails, previews, transcoded renditions | ✅ |

---

## Profile System (Professional / Business / Personal)

| Requirement | Implementation | Status |
|---|---|---|
| Separate full profile vs directory advert | `professionalProfiles` (full) vs `professionalDirectoryEntries` (discovery-safe) | ✅ |
| Private contact never in advert | `contact_email`/`contact_phone` private; `public_contact` with visibility flags for advert | ✅ |
| Screen name uniqueness | Projection doc ID = lowercased screen_name (Firestore guarantees uniqueness) | ✅ |
| Verification state | `verification_state` (not_verified → pending_review → verified) | ✅ |
| Directory visibility | `directory_visibility` (listed/unlisted) independent of profile visibility | ✅ |
| Business profile projection | `businessProfilesPublic` merges BusinessProfile + Business.verification_state | ✅ |
| Personal profile projection | `personalProfilesPublic` with screen_name uniqueness | ✅ |
| Search indexing | Professionals + businesses indexed on directory-list / public-list | ✅ |

---

## Identity, Auth, Connections, Messaging

| Requirement | Implementation | Status |
|---|---|---|
| One identity, multiple contexts | `IdentityMapping` (Firebase UID → stable identity ID) | ✅ |
| Connection relationship | `Connection` (canonical pair ID), `ConnectionRequest` lifecycle | ✅ |
| Relationship status read | `resolveConnectionStatus` / `resolveConnectionStatuses` callables (not inferred from conversations) | ✅ |
| Messaging | `Conversation`, `Message` with participant resolution | ✅ |
| Block records | `BlockRecord` overrides Connection access | ✅ |

---

## Booking, Trust, Notifications, Business, Taxonomy

| Requirement | Implementation | Status |
|---|---|---|
| Booking lifecycle | `bookingLifecycle.ts` — hold → confirm → complete/cancel/reschedule | ✅ |
| Booking payment | `bookingPayment.ts` — Stripe PaymentIntent + free booking confirmation | ✅ |
| Guest booking | `/book/:screenName` + `/booking/manage` (email + reference) | ✅ |
| Trust & Safety | `TrustRecord`, `TrustSignal`, `VerificationRequest` | ✅ |
| Notifications | Server-side dispatcher + email + idempotency + delivery worker | ✅ |
| Business management | `Business`, `BusinessMembership`, `BusinessInvitation` | ✅ |
| Business permissions | `businessPermissions.js` taxonomy (manage_calendar, etc.) | ✅ |
| Taxonomy | ServiceDefinition, SpecialismDefinition, SessionTypeDefinition, FacilityDefinition, EquipmentDefinition, ProfessionalType | ✅ |
| Location | `Location` entity + geocoding (Nominatim default, pluggable) | ✅ |

---

## Cross-System Connections (Specs 15, 18, 19)

| Connection | Implementation | Status |
|---|---|---|
| Post → Search index | `savePost` indexes on publish | ✅ |
| Workout → Search index | `saveWorkout` indexes on publish | ✅ |
| Calendar Event → Search index | `saveCalendarEvent` indexes on public-list | ✅ |
| Professional Profile → Search index | `saveProfessionalProfile` indexes on directory-list | ✅ |
| Business Profile → Search index | `saveBusinessProfile` indexes on public-list | ✅ |
| Promotion → Search index | `saveCampaign` / `updateCampaignStatus` index on active | ✅ |
| Promotion → Sponsored placement | `loadSponsoredTargets` → `annotateSponsored` → sort boost | ✅ |
| SubscriptionPlan → GrowthPackage | `growth_package_id` reference | ✅ |
| GrowthPackage → Promotion entitlement | `saveCampaign` resolves Growth Package from subscription tier+family | ✅ |
| Growth Hub → Subscription context | `GrowthHub.jsx` uses `plan_tier` for tier-gated opportunities | ✅ |
| Dashboard → Growth Hub/Promotions | `QuickActionsModule` + `GrowthHubTeaserModule` link to both | ✅ |
| Post → linked content (Workout/Event/Promotion) | `linked_content_references` stable IDs | ✅ |
| Workout detail → creator profile | `WorkoutCreatorBadge` backlink | ✅ |
| Profile → public events surface | `listPublicEventsByOwner` on profile pages | ✅ |

---

## Remaining Operational Steps (not source-level)

| Item | Status |
|---|---|
| Stripe Price IDs for 5 paid plans | Pending — populate `stripe_price_id` in SubscriptionPlan records |
| Cloud function deployment | Pending — `indexContent`, `unindexContent`, `saveCampaign`, `updateCampaignStatus` |
| Firestore composite indexes | Pending — `firestore.indexes.json` deployment |
| DNS/SPF/DKIM/DMARC for email | Pending — production email delivery verification |
| Vimeo media provider configuration | Pending — video transcoding/delivery provider selection |
| LLM backend for Growth Hub guidance | Pending — `guidanceAdapter` uses static curated content by default |
| Geocoding provider upgrade | Pending — Nominatim rate-limited; pluggable adapter ready |