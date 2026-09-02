"use strict";
// Delivery policy — server-side authoritative channel resolution.
// ───────────────────────────────────────────────────────────
// Policy values:
//   required    → deliver regardless of recipient opt-out
//   conditional → respect NotificationPreference (default delivered
//                 when preferences are unavailable, e.g. guests)
//   prohibited  → never deliver
//
// This is the single source of truth for Firebase-mode delivery. The
// client lib (src/lib/notifications.js) retains a copy only for the
// Base44 fallback path; in Firebase mode the server decision is
// authoritative.
//
// Channel scope for this pass: in_app + email. Push/FCM is wired into
// the architecture (Channel type includes 'push') but is NOT activated
// — push is 'prohibited' for every event type here, and resolveChannels
// only considers ['in_app','email'] by default.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DELIVERY_POLICY = void 0;
exports.resolveDeliveryPolicy = resolveDeliveryPolicy;
exports.resolveChannels = resolveChannels;
exports.DELIVERY_POLICY = {
    // Verification
    verification_submitted: { in_app: 'conditional', email: 'conditional', push: 'prohibited' },
    verification_approved: { in_app: 'required', email: 'required', push: 'conditional' },
    verification_rejected: { in_app: 'required', email: 'required', push: 'conditional' },
    verification_expired: { in_app: 'conditional', email: 'conditional', push: 'prohibited' },
    // Media
    media_processing_failed: { in_app: 'conditional', email: 'conditional', push: 'prohibited' },
    // Business
    business_invitation: { in_app: 'required', email: 'required', push: 'conditional' },
    // Security (critical platform communications — required on all channels)
    security_event: { in_app: 'required', email: 'required', push: 'required' },
    // Calendar
    calendar_event_invited: { in_app: 'required', email: 'conditional', push: 'prohibited' },
    calendar_event_updated: { in_app: 'required', email: 'conditional', push: 'prohibited' },
    calendar_event_rescheduled: { in_app: 'required', email: 'conditional', push: 'prohibited' },
    calendar_event_cancelled: { in_app: 'required', email: 'conditional', push: 'prohibited' },
    calendar_invitation_removed: { in_app: 'required', email: 'conditional', push: 'prohibited' },
    calendar_event_created: { in_app: 'required', email: 'conditional', push: 'prohibited' },
    calendar_reminder: { in_app: 'conditional', email: 'conditional', push: 'prohibited' },
    // Messaging
    message_received: { in_app: 'required', email: 'conditional', push: 'prohibited' },
    message_request_received: { in_app: 'required', email: 'conditional', push: 'prohibited' },
    message_request_accepted: { in_app: 'conditional', email: 'conditional', push: 'prohibited' },
    message_request_declined: { in_app: 'conditional', email: 'conditional', push: 'prohibited' },
    // Booking (existing inline writers — policy defined for the future
    // dispatcher migration; NOT used in this task)
    booking_confirmed: { in_app: 'required', email: 'conditional', push: 'prohibited' },
    booking_cancelled: { in_app: 'required', email: 'conditional', push: 'prohibited' },
    booking_rescheduled: { in_app: 'required', email: 'conditional', push: 'prohibited' },
};
function resolveDeliveryPolicy(eventType, channel) {
    const policy = exports.DELIVERY_POLICY[eventType];
    if (!policy)
        return 'prohibited';
    return policy[channel] || 'prohibited';
}
/**
 * Resolve the set of channels to deliver for an event type + recipient
 * preferences. Conditional channels default to delivered when preferences
 * are unavailable (guests, or prefs not yet created).
 *
 * `channelsToConsider` defaults to ['in_app','email'] — push is not
 * activated in this pass.
 */
function resolveChannels(eventType, category, prefs, channelsToConsider = ['in_app', 'email']) {
    const out = [];
    for (const ch of channelsToConsider) {
        const policy = resolveDeliveryPolicy(eventType, ch);
        if (policy === 'required') {
            out.push(ch);
        }
        else if (policy === 'conditional') {
            if (!prefs) {
                out.push(ch);
            }
            else {
                const prefKey = `${category || 'system'}_${ch}`;
                if (prefs[prefKey] !== false)
                    out.push(ch);
            }
        }
        // prohibited → skip
    }
    return out;
}
//# sourceMappingURL=policy.js.map