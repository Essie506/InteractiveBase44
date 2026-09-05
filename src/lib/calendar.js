import { base44 } from '@/api/base44Client';
import { calendarRepository } from '@/data/firebase';
import { useFirebase } from '@/lib/backendConfig';
import { callSaveCalendarEvent, callDeleteCalendarEvent, callGetCalendarView, callSaveReminderRule, callDeleteReminderRule, callListReminderRules, callSaveOccurrenceException, callSplitRecurrenceSeries, callHandleSourceUnavailable } from '@/services/firebaseFunctions';
export { subscribeToCalendarSignal, mergeAndDedupeEvents } from '@/lib/calendarRealtime';

// Calendar System — M3: routes to Firebase when configured.
// Firestore queries use owner_id/business_id filters (security-rule compatible).

export function getLocalTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function formatInTimezone(isoString, timezone, options = {}) {
  if (!isoString) return '';
  const defaults = { hour: '2-digit', minute: '2-digit', timeZone: timezone };
  return new Date(isoString).toLocaleString('en-GB', { ...defaults, ...options });
}

export function formatDate(isoString, timezone) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: timezone,
  });
}

export function formatTimeRange(startIso, endIso, timezone) {
  if (!startIso) return '';
  const start = formatInTimezone(startIso, timezone, { hour: '2-digit', minute: '2-digit' });
  const end = endIso ? formatInTimezone(endIso, timezone, { hour: '2-digit', minute: '2-digit' }) : '';
  return end ? `${start} – ${end}` : start;
}

// Create a calendar event.
// Firebase mode routes through the canonical saveCalendarEvent Cloud
// Function — the sole authoritative writer — so the calendarEventsPublic
// projection and price/free invariants are maintained server-side. The
// Base44 fallback path is retained for non-Firebase environments.
export async function createEvent(data) {
  // Spread ALL client fields (assigned_identity_ids, invited_emails,
  // location, recurrence_rule, etc.) so the canonical writer receives
  // the complete payload. Previously this destructured and rebuilt
  // eventData, silently dropping assigned_identity_ids and invited_emails.
  const eventData = {
    ...data,
    owner_type: data.owner_type || 'identity',
    operating_context: data.operating_context || 'personal',
    description: data.description || null,
    timezone: data.timezone || getLocalTimezone(),
    all_day: data.all_day || false,
    location_id: data.location_id || null,
    location_type: data.location_type || 'physical',
    meeting_url: data.meeting_url || null,
    visibility: data.visibility || 'private',
    lifecycle_state: 'scheduled',
    source_system: data.source_system || 'manual',
    source_id: data.source_id || null,
    business_id: data.business_id || null,
    recurrence_rule: data.recurrence_rule || null,
  };

  if (useFirebase) return callSaveCalendarEvent(eventData);
  return base44.entities.CalendarEvent.create(eventData);
}

export async function updateEvent(eventId, data) {
  if (useFirebase) return callSaveCalendarEvent({ ...data, id: eventId });
  return base44.entities.CalendarEvent.update(eventId, data);
}

export async function cancelEvent(eventId) {
  if (useFirebase) return callSaveCalendarEvent({ id: eventId, lifecycle_state: 'cancelled' });
  return base44.entities.CalendarEvent.update(eventId, { lifecycle_state: 'cancelled' });
}

// ── Personal Event Lifecycle (§16) ──────────────────────────
// Set a personal-only lifecycle state (completed/skipped/archived) on a
// personal manual event. Routes through the canonical saveCalendarEvent
// writer so authority + projection are enforced server-side.
export async function setEventLifecycle(eventId, lifecycleState) {
  if (useFirebase) return callSaveCalendarEvent({ id: eventId, lifecycle_state: lifecycleState });
  return base44.entities.CalendarEvent.update(eventId, { lifecycle_state: lifecycleState });
}

// ── Delete vs Cancel (§52) ───────────────────────────────────
// Destructive removal of a personal Calendar-owned event. Server-side
// deleteCalendarEvent enforces authority + the personal-manual restriction
// and preserves history (§108). Falls back to the Base44 SDK delete in
// non-Firebase mode.
export async function deleteEvent(eventId) {
  if (useFirebase) return callDeleteCalendarEvent({ event_id: eventId });
  return base44.entities.CalendarEvent.delete(eventId);
}

// ── Schedule-change history (§48, §104, §105) ───────────────
// Read-only timeline. Readable by anyone authorised to read the parent
// event (firestore.rules: canReadCalendarEvent). Writable only by Cloud
// Function (appendScheduleHistory).
export async function getEventHistory(eventId) {
  if (useFirebase) return calendarRepository.listHistoryForEvent(eventId);
  return [];
}

// Get events for an owner within a date range
export async function getEvents(ownerId, ownerType, startDate, endDate) {
  let all;
  if (useFirebase) {
    // Firestore: query by owner_id + owner_type. Personal and Professional
    // are operating contexts of ONE identity, so both render the same
    // identity-owned set (owner_type 'identity'); Business is a separate
    // owner_type. The owner_type filter keeps identity and business sets
    // disjoint.
    all = await calendarRepository.listEventsForOwner(ownerId, ownerType, startDate, endDate);
    all = all.filter(e => e.lifecycle_state !== 'cancelled' && e.lifecycle_state !== 'removed');
  } else {
    all = await base44.entities.CalendarEvent.filter({
      owner_id: ownerId,
      owner_type: ownerType,
      lifecycle_state: { $ne: 'cancelled' },
    }, 'start_time', 200);
  }

  const startMs = startDate ? new Date(startDate).getTime() : 0;
  const endMs = endDate ? new Date(endDate).getTime() : Date.now() + 365 * 24 * 60 * 60 * 1000;

  return all.filter(e => {
    const eventStart = new Date(e.start_time).getTime();
    return eventStart >= startMs && eventStart <= endMs;
  });
}

export async function getEventsForDate(ownerId, ownerType, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  return getEvents(ownerId, ownerType, startOfDay, endOfDay);
}

// De-duplicate a list of events by authoritative Event ID. A defensive
// guard: the owner_type query filter is the primary fix for duplicate
// professional events, but this ensures any residual overlap (e.g. a
// business event also matched by an identity query) collapses to one row.
export function dedupeEventsById(events) {
  const byId = new Map();
  for (const e of events) {
    if (!e) continue;
    const key = e.id;
    if (!byId.has(key)) byId.set(key, e);
  }
  return Array.from(byId.values());
}

export async function getAllEventsForIdentity(identityId, activeContext, businessId, startDate, endDate, onQueryError) {
  // ── Firebase mode: authoritative server-side read aggregator ──
  // Firestore rules resolve the caller's identity via get(identityMappings)
  // and check resource.data fields against it. The Firestore query validator
  // CANNOT evaluate get()/exists()-derived values for list requests, so direct
  // client queries (owner equality, array-contains assigned/invited) fail with
  // "Missing or insufficient permissions" — a permission denial, not a missing
  // composite index. The getCalendarView callable runs under the Admin SDK
  // and enforces the SAME authorization the rules express (owner, creator,
  // business member, assigned, invited), returning only authorised events.
  if (useFirebase) {
    try {
      const result = await callGetCalendarView({
        start_time: startDate ? new Date(startDate).toISOString() : null,
        end_time: endDate ? new Date(endDate).toISOString() : null,
        business_id: activeContext === 'business' ? businessId : null,
      });
      return Array.isArray(result.events) ? result.events : [];
    } catch (err) {
      console.error('[calendar] getCalendarView failed:', err?.message || err);
      if (onQueryError) onQueryError({ query: 'view', error: err?.message || String(err) });
      return [];
    }
  }

  // ── Non-Firebase fallback: direct SDK reads ──
  const events = [];
  try {
    events.push(...await getEvents(identityId, 'identity', startDate, endDate));
  } catch (err) {
    console.error('[calendar] Failed to load owner events:', err?.message || err);
    if (onQueryError) onQueryError({ query: 'owner', error: err?.message || String(err) });
  }
  if (activeContext === 'business' && businessId) {
    events.push(...await getEvents(businessId, 'business', startDate, endDate));
  }
  const deduped = dedupeEventsById(events);
  const startMs = startDate ? new Date(startDate).getTime() : 0;
  const endMs = endDate ? new Date(endDate).getTime() : Date.now() + 365 * 24 * 60 * 60 * 1000;
  return deduped
    .filter(e => e.lifecycle_state !== 'cancelled' && e.lifecycle_state !== 'removed')
    .filter(e => {
      const eventStart = new Date(e.start_time).getTime();
      return eventStart >= startMs && eventStart <= endMs;
    })
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
}

// ── Source Unavailable (§106–§111) ────────────────────────────
// Calendar-owned scheduling-contract endpoint. Source systems call
// this when a source record becomes unavailable (deleted, access_lost,
// deactivated, or transiently unavailable). Calendar transitions the
// event to a privacy-safe state and redacts source detail (§107).
// History is preserved (§108) — the event is never deleted.
export async function handleSourceUnavailable(data) {
  if (useFirebase) return callHandleSourceUnavailable(data);
  throw new Error('Source unavailable handling requires Firebase mode');
}

// --- Availability ---

export async function createAvailabilityRule(data) {
  const ruleData = { ...data, timezone: data.timezone || getLocalTimezone(), lifecycle_state: 'active' };
  if (useFirebase) return calendarRepository.createAvailability(ruleData);
  return base44.entities.AvailabilityRule.create(ruleData);
}

export async function getAvailabilityRules(ownerId, ownerType) {
  if (useFirebase) {
    const rules = await calendarRepository.listAvailabilityForOwner(ownerId);
    return rules.filter(r => r.lifecycle_state === 'active').sort((a, b) => a.day_of_week - b.day_of_week);
  }
  return base44.entities.AvailabilityRule.filter({
    owner_id: ownerId, owner_type: ownerType, lifecycle_state: 'active',
  }, 'day_of_week', 50);
}

export async function deleteAvailabilityRule(ruleId) {
  if (useFirebase) return calendarRepository.updateAvailability(ruleId, { lifecycle_state: 'archived' });
  return base44.entities.AvailabilityRule.update(ruleId, { lifecycle_state: 'archived' });
}

export async function getAvailabilityForDate(ownerId, ownerType, date) {
  const rules = await getAvailabilityRules(ownerId, ownerType);
  const dayOfWeek = new Date(date).getDay();
  const dateStr = date.toISOString().split('T')[0];
  const exceptions = rules.filter(r => r.specific_date === dateStr);
  const recurring = rules.filter(r => !r.specific_date && r.day_of_week === dayOfWeek);
  return [...exceptions, ...recurring].sort((a, b) => a.start_time.localeCompare(b.start_time));
}

// --- External Calendar ---

export async function createExternalConnection(data) {
  const connData = { ...data, sync_status: 'pending' };
  if (useFirebase) return calendarRepository.createConnection(connData);
  return base44.entities.ExternalCalendarConnection.create(connData);
}

export async function getExternalConnections(identityId) {
  if (useFirebase) {
    const conns = await calendarRepository.listConnections(identityId);
    return conns.filter(c => c.lifecycle_state === 'active');
  }
  return base44.entities.ExternalCalendarConnection.filter({
    identity_id: identityId, lifecycle_state: 'active',
  });
}

export async function updateConnectionStatus(connectionId, status, error = null) {
  const updateData = {
    sync_status: status,
    sync_error: error,
    last_synced_at: status === 'connected' ? new Date().toISOString() : undefined,
  };
  if (useFirebase) return calendarRepository.updateConnection(connectionId, updateData);
  return base44.entities.ExternalCalendarConnection.update(connectionId, updateData);
}

// ── Recurrence Exceptions (§55–§56) ─────────────────────────
// Fetch exceptions for all recurring events in a list. Used by the
// shared occurrence model to apply cancelled/rescheduled occurrences.

export async function getExceptionsForEvents(events) {
  if (!useFirebase) return [];
  const recurringIds = (events || [])
    .filter(e => e && e.recurrence_rule && e.lifecycle_state !== 'cancelled')
    .map(e => e.id);
  if (recurringIds.length === 0) return [];
  return calendarRepository.listExceptionsForSeriesBatch(recurringIds);
}

// ── Reminder Rules (§59–§63) ─────────────────────────────────
// Clients cannot write reminderRules directly (Firestore rules deny it).
// These wrappers call the trusted Cloud Functions that validate
// caller participation before creating/updating/deleting.

export async function saveReminderRule(data) {
  if (useFirebase) return callSaveReminderRule(data);
  return base44.entities.ReminderRule.create({
    ...data,
    last_dispatched_occurrence: null,
  });
}

export async function deleteReminderRule(ruleId) {
  if (useFirebase) return callDeleteReminderRule({ rule_id: ruleId });
  return base44.entities.ReminderRule.delete(ruleId);
}

export async function getReminderRulesForEvent(eventId) {
  if (useFirebase) {
    const result = await callListReminderRules({ event_id: eventId });
    return result.rules || [];
  }
  return base44.entities.ReminderRule.filter({
    event_id: eventId,
    is_active: true,
  });
}

// ── Occurrence Exception writer (§55–§57) ───────────────────
export async function saveOccurrenceException(data) {
  if (useFirebase) return callSaveOccurrenceException(data);
  // Non-Firebase fallback — not supported (no server-side validation)
  throw new Error('Occurrence exceptions require Firebase mode');
}

// ── Recurrence Series Split — "this and future" (§57) ─────────
// Splits a recurring series at a given occurrence: the old series becomes
// historical (effective_until), a new series takes over from the split.
export async function splitRecurrenceSeries(data) {
  if (useFirebase) return callSplitRecurrenceSeries(data);
  throw new Error('Recurrence series split requires Firebase mode');
}

// ── Combined Business/Staff Calendar (§70–§74) ──────────────
// Aggregation/projection over canonical staff + business calendar events.
// Does NOT duplicate staff events into a separate combined-calendar store.
// Fetches:
//   1. Business-owned events (owner_type 'business')
//   2. Events assigned to any active business staff member
//   3. Events invited to any active business staff member
// Deduplicated by authoritative Event ID.

export async function getCombinedBusinessCalendar(businessId, staffIdentityIds, startDate, endDate) {
  const events = [];

  // 1. Business-owned events
  events.push(...await getEvents(businessId, 'business', startDate, endDate));

  if (useFirebase && staffIdentityIds && staffIdentityIds.length > 0) {
    // 2 + 3. Events assigned to or inviting any staff member
    // Firestore array-contains checks one value per query, so batch per staff.
    for (const staffId of staffIdentityIds) {
      events.push(...await calendarRepository.listEventsAssignedToIdentity(staffId));
      events.push(...await calendarRepository.listEventsInvitedToIdentity(staffId));
    }
  }

  const deduped = dedupeEventsById(events);
  const startMs = startDate ? new Date(startDate).getTime() : 0;
  const endMs = endDate ? new Date(endDate).getTime() : Date.now() + 365 * 24 * 60 * 60 * 1000;
  return deduped
    .filter(e => e.lifecycle_state !== 'cancelled' && e.lifecycle_state !== 'removed')
    .filter(e => {
      const eventStart = new Date(e.start_time).getTime();
      return eventStart >= startMs && eventStart <= endMs;
    })
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
}