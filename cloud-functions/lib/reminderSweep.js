"use strict";
// Reminder sweep — scheduled Cloud Function (§59–§63).
// ───────────────────────────────────────────────────────────
// Runs every minute, queries events starting soon, evaluates ReminderRule
// offsets, and emits calendar.reminder.due notifications via the dispatcher.
//
// Idempotency: each reminder rule records last_dispatched_occurrence so a
// retry or sweep re-run never duplicates a reminder for the same occurrence
// (§62, §119). Reminder failure (e.g. email provider outage) does NOT
// remove the event — the delivery worker retries independently (§62).
//
// Expiry: reminders whose fire time has passed AND whose event started
// more than 5 minutes ago are expired and NOT delivered (§63).
//
// Recurring events: occurrences are expanded via the recurrence engine and
// exceptions applied; each occurrence is reminded independently.
Object.defineProperty(exports, "__esModule", { value: true });
exports.sweepReminders = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const shared_1 = require("./shared");
const dispatcher_1 = require("./notifications/dispatcher");
const calendar_1 = require("./notifications/email/payloads/calendar");
const recurrence_1 = require("./recurrence");
const calendarEventExceptions_1 = require("./calendarEventExceptions");
const SWEEP_WINDOW_MINUTES = 60;
const EXPIRY_GRACE_MINUTES = 5;
exports.sweepReminders = (0, scheduler_1.onSchedule)({ region: 'europe-west2', schedule: 'every 1 minutes' }, async () => {
    const now = new Date();
    const windowStart = new Date(now.getTime() - EXPIRY_GRACE_MINUTES * 60 * 1000);
    const windowEnd = new Date(now.getTime() + SWEEP_WINDOW_MINUTES * 60 * 1000);
    // Query events whose start_time falls within the sweep window.
    const eventSnap = await shared_1.db.collection('calendarEvents')
        .where('start_time', '>=', windowStart.toISOString())
        .where('start_time', '<=', windowEnd.toISOString())
        .get();
    for (const doc of eventSnap.docs) {
        const event = doc.data();
        if (event.lifecycle_state === 'cancelled' || event.lifecycle_state === 'completed')
            continue;
        // Build occurrences within the window
        let occurrences = [];
        if (event.recurrence_rule) {
            const effectiveUntil = event.effective_until || windowEnd.toISOString();
            occurrences = (0, recurrence_1.expandOccurrences)(doc.id, event.recurrence_rule, event.start_time, event.end_time, windowStart.toISOString(), effectiveUntil);
            const exceptions = await (0, calendarEventExceptions_1.listExceptions)(doc.id);
            occurrences = (0, calendarEventExceptions_1.applyExceptions)(occurrences, exceptions);
        }
        else {
            occurrences = [{ occurrenceId: doc.id, start: event.start_time, end: event.end_time }];
        }
        // Query reminder rules for this event
        const ruleSnap = await shared_1.db.collection('reminderRules')
            .where('event_id', '==', doc.id)
            .where('is_active', '==', true)
            .get();
        if (ruleSnap.empty)
            continue;
        for (const occ of occurrences) {
            const occStart = new Date(occ.start);
            for (const ruleDoc of ruleSnap.docs) {
                const rule = ruleDoc.data();
                const reminderTime = new Date(occStart.getTime() - (rule.offset_minutes || 30) * 60 * 1000);
                // Fire if due (reminderTime <= now) and not expired (event not too far past)
                if (reminderTime > now)
                    continue; // not yet
                if (occStart < new Date(now.getTime() - EXPIRY_GRACE_MINUTES * 60 * 1000))
                    continue; // expired (§63)
                // Idempotency: skip if already dispatched for this occurrence
                if (rule.last_dispatched_occurrence === occ.start)
                    continue;
                // Build the email context (safe fields only)
                const tz = event.timezone || 'UTC';
                const start = new Date(occ.start);
                const dateLabel = start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: tz });
                const timeLabel = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
                const emailCtx = {
                    eventTitle: event.title || 'Event',
                    hostDisplayName: null,
                    dateLabel,
                    timeLabel,
                    timezone: tz,
                    safeLocationLabel: event.location_type === 'online' ? 'Online' : null,
                    eventLink: `/calendar?event=${doc.id}`,
                    eventType: 'calendar_event_invited', // reuse invited template for reminder body
                };
                await (0, dispatcher_1.emitNotification)({
                    source_system: 'calendar',
                    event_type: 'calendar_reminder',
                    source_id: `cal_reminder:${doc.id}:${rule.identity_id}:${occ.start}`,
                    version: '1',
                    category: 'calendar',
                    title: `Reminder: ${event.title || 'Event'}`,
                    body: `Your event "${event.title || 'Event'}" starts in ${rule.offset_minutes || 30} minutes.`,
                    action_url: `/calendar?event=${doc.id}`,
                    action_label: 'View Event',
                    priority: 'normal',
                    recipient_id: rule.identity_id,
                    recipient_email: null,
                    emailContext: emailCtx,
                    emailPayloadBuilder: calendar_1.buildCalendarEmailPayload,
                });
                // Mark as dispatched (idempotency — §62, §119)
                await ruleDoc.ref.update({ last_dispatched_occurrence: occ.start });
            }
        }
    }
});
//# sourceMappingURL=reminderSweep.js.map