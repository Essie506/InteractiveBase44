import { base44 } from '@/api/base44Client';
import { calendarRepository } from '@/data/firebase';
import { useFirebase } from '@/lib/backendConfig';
import { callSaveCalendarEvent } from '@/services/firebaseFunctions';

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
  const {
    owner_id, owner_type, operating_context, title, description,
    start_time, end_time, timezone, all_day, location_id, location_type,
    meeting_url, visibility, source_system, source_id, business_id,
    created_by_id, recurrence_rule,
  } = data;

  const eventData = {
    owner_id,
    owner_type: owner_type || 'identity',
    operating_context: operating_context || 'personal',
    title,
    description: description || null,
    start_time,
    end_time,
    timezone: timezone || getLocalTimezone(),
    all_day: all_day || false,
    location_id: location_id || null,
    location_type: location_type || 'physical',
    meeting_url: meeting_url || null,
    visibility: visibility || 'private',
    lifecycle_state: 'scheduled',
    source_system: source_system || 'manual',
    source_id: source_id || null,
    business_id: business_id || null,
    created_by_id,
    recurrence_rule: recurrence_rule || null,
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

// Get events for an owner within a date range
export async function getEvents(ownerId, ownerType, startDate, endDate) {
  let all;
  if (useFirebase) {
    // Firestore: query by owner_id + owner_type so Personal ('identity')
    // and Professional ('professional') calendars return disjoint sets
    // even when they share the same identity ID as owner_id.
    all = await calendarRepository.listEventsForOwner(ownerId, ownerType);
    all = all.filter(e => e.lifecycle_state !== 'cancelled');
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

export async function getAllEventsForIdentity(identityId, activeContext, businessId, startDate, endDate) {
  const events = [];

  // ONE identity-owned event set — queried once. Personal and Professional
  // are operating contexts of the same identity, NOT separate owners, so
  // both contexts render the same identity-owned events.
  events.push(...await getEvents(identityId, 'identity', startDate, endDate));

  if (useFirebase) {
    // Events assigned to this identity (e.g. Business staff assignments) —
    // view/participation only, never edit authority.
    events.push(...await calendarRepository.listEventsAssignedToIdentity(identityId));
    // Events this identity was invited to via email resolution.
    events.push(...await calendarRepository.listEventsInvitedToIdentity(identityId));
  }

  // Business context adds the active Business's owned events. Business-owned
  // events remain owned by businessId (a separate organisational owner).
  if (activeContext === 'business' && businessId) {
    events.push(...await getEvents(businessId, 'business', startDate, endDate));
  }

  const deduped = dedupeEventsById(events);
  const startMs = startDate ? new Date(startDate).getTime() : 0;
  const endMs = endDate ? new Date(endDate).getTime() : Date.now() + 365 * 24 * 60 * 60 * 1000;
  return deduped
    .filter(e => e.lifecycle_state !== 'cancelled')
    .filter(e => {
      const eventStart = new Date(e.start_time).getTime();
      return eventStart >= startMs && eventStart <= endMs;
    })
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
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