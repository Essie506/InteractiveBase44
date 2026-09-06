// Shared Interactive domain typedefs for JSDoc type checking (checkJs: true).
// Reuse these throughout the frontend instead of duplicating type definitions.
// Import in a file via: /** @typedef {import('@/types/domain').CalendarEvent} CalendarEvent */
//
// All shapes are derived from the authoritative entity schemas in
// base44/entities/*.jsonc and the Firebase Firestore document contracts.
// Built-in fields (id, created_date, updated_date, created_by_id) are
// included where they are part of the runtime document shape.

// ── Identity / User ──────────────────────────────────────────
/**
 * @typedef {object} Identity
 * @property {string} id - Stable Interactive identity ID.
 * @property {string} [email] - Email address (from Firebase Auth).
 * @property {string} [full_name] - Display name.
 * @property {'admin'|'user'} [role] - App role.
 * @property {'personal'|'professional'|'business'} [active_context] - Current operating context.
 * @property {string} [active_business_id] - Active business context ID.
 */

// ── Calendar ─────────────────────────────────────────────────
/**
 * @typedef {object} CalendarEvent
 * @property {string} id
 * @property {string} owner_id
 * @property {'identity'|'business'} owner_type
 * @property {'personal'|'professional'|'business'} [operating_context]
 * @property {string} title
 * @property {string} [description]
 * @property {string} start_time - ISO 8601 datetime (UTC).
 * @property {string} end_time - ISO 8601 datetime (UTC).
 * @property {string} [timezone] - IANA timezone identifier.
 * @property {boolean} [all_day]
 * @property {string} [location_id]
 * @property {string} [location]
 * @property {'physical'|'online'|'hybrid'} [location_type]
 * @property {string} [meeting_url]
 * @property {string} [resource_label]
 * @property {string} [resource_id]
 * @property {'public'|'connections'|'private'|'staff'} [visibility]
 * @property {string} [category]
 * @property {string} [color]
 * @property {string} [lifecycle_state]
 * @property {'manual'|'booking'|'workout'|'business_scheduling'|'external'|'messaging'} [source_system]
 * @property {string} [source_id]
 * @property {string} [external_calendar_id]
 * @property {string} [external_event_id]
 * @property {string} [created_by_id]
 * @property {string} [business_id]
 * @property {string} [recurrence_rule] - RRULE string (RFC 5545).
 * @property {string} [effective_until]
 * @property {string} [superseded_by_id]
 * @property {Array<{id?: string, label: string}>} [services]
 * @property {string} [cover_media_id]
 * @property {string} [cover_url]
 * @property {number} [price_pence]
 * @property {string} [currency]
 * @property {boolean} [is_free]
 * @property {number} [capacity]
 * @property {string[]} [assigned_identity_ids]
 * @property {string[]} [invited_identity_ids]
 * @property {string[]} [invited_guest_emails]
 * @property {string} [created_date]
 * @property {string} [updated_date]
 */

/**
 * @typedef {object} CalendarParticipation
 * @property {string} id
 * @property {string} event_id
 * @property {string} identity_id
 * @property {'pending'|'accepted'|'declined'|'revoked'} response_state
 * @property {string} [invited_at]
 * @property {string} [responded_at]
 * @property {string} [revoked_at]
 * @property {string} [revoked_by]
 * @property {string} [source_system]
 * @property {'completed'|'skipped'|'archived'} [personal_lifecycle_state]
 * @property {boolean} [hidden_from_timeline]
 */

/**
 * @typedef {object} ReminderRule
 * @property {string} id
 * @property {string} event_id
 * @property {string} identity_id
 * @property {number} offset_minutes
 * @property {Array<'in_app'|'email'|'push'>} [delivery_channels]
 * @property {boolean} [is_active]
 * @property {string} [last_dispatched_occurrence]
 */

/**
 * @typedef {object} AvailabilityRule
 * @property {string} id
 * @property {string} owner_id
 * @property {'identity'|'business'} owner_type
 * @property {'professional'|'business'} [operating_context]
 * @property {'working_hours'|'available'|'unavailable'|'blocked'} rule_type
 * @property {number} [day_of_week] - 0=Sunday … 6=Saturday.
 * @property {string} start_time - HH:MM.
 * @property {string} end_time - HH:MM.
 * @property {string} [timezone]
 * @property {string} [effective_from]
 * @property {string} [effective_until]
 * @property {string} [specific_date]
 * @property {string} [business_id]
 * @property {string} [notes]
 * @property {'active'|'archived'} [lifecycle_state]
 */

// ── Calendar Occurrence (expanded from recurring series) ────
/**
 * @typedef {object} CalendarOccurrence
 * @property {CalendarEvent} [event] - The parent event (or the event itself for non-recurring).
 * @property {string} [occurrenceId] - Stable occurrence identity (seriesId__originalStart).
 * @property {string} [start] - ISO 8601 start of this occurrence.
 * @property {string} [end] - ISO 8601 end of this occurrence.
 * @property {boolean} [isRecurring]
 * @property {boolean} [isException]
 * @property {boolean} [isCancelled]
 */

// ── Workout ──────────────────────────────────────────────────
/**
 * @typedef {object} Workout
 * @property {string} id
 * @property {string} creator_identity_id
 * @property {'identity'|'business'} owner_type
 * @property {string} owner_id
 * @property {'personal'|'professional'|'business'} [operating_context]
 * @property {string} [business_id]
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [workout_type]
 * @property {'beginner'|'intermediate'|'advanced'|'all_levels'} [difficulty]
 * @property {number} [duration_minutes]
 * @property {Array<{name: string, description?: string, sets?: number, reps?: number, duration_seconds?: number, rest_seconds?: number}>} [exercises]
 * @property {string} [media_url]
 * @property {string} [cover_url]
 * @property {'draft'|'published'|'archived'|'retired'} [lifecycle_state]
 * @property {'public'|'connections'|'private'} [visibility]
 * @property {boolean} [is_free]
 * @property {number} [price_pence]
 * @property {string} [created_date]
 * @property {string} [updated_date]
 */

// ── Post ─────────────────────────────────────────────────────
/**
 * @typedef {object} Post
 * @property {string} id
 * @property {string} author_identity_id
 * @property {'identity'|'business'} author_type
 * @property {string} [business_id]
 * @property {'personal'|'professional'|'business'} [operating_context]
 * @property {string} [post_type]
 * @property {string} [title]
 * @property {string} [summary]
 * @property {string} [body]
 * @property {string} [rich_text]
 * @property {string[]} [media_urls]
 * @property {string[]} [media_asset_ids]
 * @property {string} [link_url]
 * @property {Array<{system: string, type?: string, id: string}>} [linked_content_references]
 * @property {string[]} [tags]
 * @property {string[]} [hashtags]
 * @property {'public'|'connections'|'private'} [visibility]
 * @property {'draft'|'published'|'archived'|'deleted'|'under_review'} [lifecycle_state]
 * @property {boolean} [discovery_eligibility]
 * @property {number} [view_count]
 * @property {number} [reaction_count]
 * @property {number} [comment_count]
 * @property {number} [share_count]
 * @property {number} [save_count]
 * @property {string} [created_date]
 * @property {string} [updated_date]
 */

// ── Booking ──────────────────────────────────────────────────
/**
 * @typedef {object} Booking
 * @property {string} id
 * @property {string} [event_id]
 * @property {string} [customer_identity_id]
 * @property {string} [customer_email]
 * @property {string} [customer_name]
 * @property {string} [business_id]
 * @property {string} [professional_identity_id]
 * @property {string} [service_id]
 * @property {string} [service_label]
 * @property {string} [start_time]
 * @property {string} [end_time]
 * @property {'pending'|'held'|'confirmed'|'completed'|'cancelled'|'no_show'} [status]
 * @property {number} [price_pence]
 * @property {string} [currency]
 * @property {boolean} [is_free]
 * @property {string} [payment_intent_id]
 * @property {string} [stripe_session_id]
 * @property {string} [booking_reference]
 * @property {string} [created_date]
 * @property {string} [updated_date]
 */

// ── Notification ─────────────────────────────────────────────
/**
 * @typedef {object} NotificationRecord
 * @property {string} id
 * @property {string} [recipient_identity_id]
 * @property {string} [type] - Semantic notification type.
 * @property {string} [title]
 * @property {string} [body]
 * @property {string} [action_url]
 * @property {string} [action_label]
 * @property {string} [source_system]
 * @property {string} [source_id]
 * @property {'unread'|'read'|'archived'} [status]
 * @property {string} [created_date]
 * @property {string} [updated_date]
 */

// ── Community Interaction ────────────────────────────────────
/**
 * @typedef {object} Reaction
 * @property {string} id
 * @property {string} identity_id
 * @property {string} target_system
 * @property {string} target_type
 * @property {string} target_id
 * @property {'support'|'celebrate'|'strong'|'nice_work'|'helpful'|'inspiring'} reaction_type
 * @property {'active'|'removed'} [state]
 */

/**
 * @typedef {object} Comment
 * @property {string} id
 * @property {string} identity_id
 * @property {string} target_system
 * @property {string} target_type
 * @property {string} target_id
 * @property {string} [parent_comment_id]
 * @property {string} [body]
 * @property {'original'|'edited'} [edit_state]
 * @property {'pending'|'approved'|'removed'|'hidden'} [moderation_state]
 * @property {boolean} [pinned]
 * @property {number} [reaction_count]
 * @property {number} [reply_count]
 * @property {string} [created_date]
 * @property {string} [updated_date]
 */

/**
 * @typedef {object} Save
 * @property {string} id
 * @property {string} identity_id
 * @property {string} target_system
 * @property {string} target_type
 * @property {string} target_id
 * @property {string} [collection_ref]
 * @property {'active'|'removed'} [state]
 */

// ── Promotion / Growth ────────────────────────────────────────
/**
 * @typedef {object} Promotion
 * @property {string} id
 * @property {string} [name]
 * @property {string} owner_id
 * @property {'identity'|'business'} owner_type
 * @property {string} [business_id]
 * @property {string} [growth_package_id]
 * @property {'service_boost'|'event_boost'|'workout_boost'|'post_boost'|'profile_boost'|'business_boost'} [campaign_type]
 * @property {Array<{system: string, type?: string, id: string}>} [target_content_references]
 * @property {'draft'|'pending_review'|'active'|'paused'|'completed'|'rejected'|'expired'} [status]
 * @property {number} [budget_pence]
 * @property {number} [spent_pence]
 * @property {string} [currency]
 * @property {string} [start_date]
 * @property {string} [end_date]
 * @property {number} [impressions]
 * @property {number} [clicks]
 * @property {number} [conversions]
 * @property {string} [headline]
 * @property {string} [description]
 * @property {string} [created_date]
 * @property {string} [updated_date]
 */

// ── Subscription ──────────────────────────────────────────────
/**
 * @typedef {object} SubscriptionPlan
 * @property {string} id
 * @property {string} [name]
 * @property {'basic'|'plus'|'pro'} [tier]
 * @property {'professional'|'business'} [family]
 * @property {string} [description]
 * @property {string[]} [features]
 * @property {number} [price_pence]
 * @property {string} [currency]
 * @property {'monthly'|'annual'} [billing_interval]
 * @property {string} [stripe_price_id]
 * @property {'active'|'retired'} [status]
 * @property {number} [sort_order]
 * @property {string} [growth_package_id]
 */

/**
 * @typedef {object} UserSubscription
 * @property {string} [plan_id]
 * @property {string} [plan_name]
 * @property {'basic'|'plus'|'pro'} [plan_tier]
 * @property {'professional'|'business'} [plan_family]
 * @property {'active'|'canceled'|'past_due'|'trialing'} [status]
 * @property {string} [stripe_customer_id]
 * @property {string} [stripe_subscription_id]
 * @property {string} [current_period_end]
 */

// ── Media ────────────────────────────────────────────────────
/**
 * @typedef {object} MediaAsset
 * @property {string} id
 * @property {string} owner_id
 * @property {string} [file_url]
 * @property {string} [storage_path]
 * @property {string} [file_name]
 * @property {string} [mime_type]
 * @property {number} [size_bytes]
 * @property {'image'|'video'|'audio'|'document'} media_type
 * @property {number} [width]
 * @property {number} [height]
 * @property {string} [lifecycle_state]
 * @property {Array<{type: string, url: string, width?: number, height?: number}>} [derivatives]
 * @property {string} [alt_text]
 * @property {string} [source_domain]
 * @property {string} [source_ref_id]
 * @property {string[]} [authorized_identity_ids]
 * @property {'public'|'connections'|'private'|'protected'} [visibility]
 */

// ── Connection / Relationship ─────────────────────────────────
/**
 * @typedef {object} Connection
 * @property {string} id
 * @property {string} identity_a_id
 * @property {string} identity_b_id
 * @property {'accepted'|'pending'|'declined'|'blocked'} [status]
 * @property {string} [created_date]
 */

/**
 * @typedef {object} ConnectionRequest
 * @property {string} id
 * @property {string} requester_id
 * @property {string} target_id
 * @property {'pending'|'accepted'|'declined'|'expired'} status
 * @property {'personal'|'professional'|'business'} [requester_context]
 * @property {string} [requested_at]
 * @property {string} [responded_at]
 * @property {string} [request_message]
 */

// ── Business ────────────────────────────────────────────────
/**
 * @typedef {object} Business
 * @property {string} id
 * @property {string} [name]
 * @property {string} [display_name]
 * @property {'verified'|'pending_review'|'not_verified'|'failed'} [verification_state]
 * @property {string} [owner_identity_id]
 * @property {string} [created_date]
 */

/**
 * @typedef {object} BusinessMembership
 * @property {string} id
 * @property {string} business_id
 * @property {string} identity_id
 * @property {'owner'|'admin'|'manager'|'staff'} [role]
 * @property {string[]} [permissions]
 */

// ── Profile ──────────────────────────────────────────────────
/**
 * @typedef {object} ProfessionalProfile
 * @property {string} id
 * @property {string} identity_id
 * @property {string} [legal_name]
 * @property {string} [business_name]
 * @property {string} [display_name]
 * @property {string} [screen_name]
 * @property {string} [avatar_url]
 * @property {string} [cover_url]
 * @property {string} [bio]
 * @property {string} [headline]
 * @property {string} [profession]
 * @property {string} [location]
 * @property {string} [location_id]
 * @property {string} [service_area]
 * @property {string} [website]
 * @property {string} [contact_email]
 * @property {string} [contact_phone]
 * @property {'public'|'connections'|'private'} [visibility]
 * @property {'listed'|'unlisted'} [directory_visibility]
 * @property {'not_started'|'in_progress'|'awaiting_verification'|'active'} [onboarding_status]
 * @property {'not_verified'|'pending_review'|'additional_info_required'|'verified'|'failed'|'expired'} [verification_state]
 * @property {'draft'|'active'|'archived'} [lifecycle_state]
 * @property {Array<{id?: string, label: string}>} [specialisms]
 * @property {Array<{id?: string, label: string}>} [session_types]
 * @property {Array<{id?: string, label: string}>} [services]
 */

/**
 * @typedef {object} PersonalProfile
 * @property {string} id
 * @property {string} identity_id
 * @property {string} [display_name]
 * @property {string} [screen_name]
 * @property {string} [avatar_url]
 * @property {string} [bio]
 * @property {string} [headline]
 * @property {'public'|'connections'|'private'} [visibility]
 * @property {'listed'|'unlisted'} [directory_visibility]
 */

// ── Search ───────────────────────────────────────────────────
/**
 * @typedef {object} SearchIndexDocument
 * @property {string} content_id
 * @property {string} content_type
 * @property {string} system
 * @property {string} [title]
 * @property {string} [description]
 * @property {string[]} [tags]
 * @property {string[]} [tokens]
 * @property {string} [location]
 * @property {string} [owner_id]
 * @property {string} [visibility]
 * @property {boolean} [sponsored]
 * @property {string} [promotion_id]
 * @property {number} [_score]
 * @property {string} [_updated_date]
 */

// ── Form / UI state ──────────────────────────────────────────
/**
 * @typedef {object} FormErrorState
 * @property {Record<string, string>} [errors] - Field name → error message.
 * @property {boolean} [saving] - Whether a save operation is in flight.
 * @property {boolean} [loading] - Whether data is loading.
 */

// ── Toast ────────────────────────────────────────────────────
/**
 * @typedef {object} ToastPayload
 * @property {string} [title]
 * @property {string} [description]
 * @property {'default'|'destructive'|'success'} [variant]
 */

export {};