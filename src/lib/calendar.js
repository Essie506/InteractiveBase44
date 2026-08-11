import { base44 } from '@/api/base44Client';

// Calendar System — authoritative owner of calendar records, availability and scheduling state.
// Connected systems reference Calendar through stable IDs/contracts.

// Get the user's local timezone (IANA identifier)
export function getLocalTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// Format an ISO datetime in a specific timezone
export function formatInTimezone(isoString, timezone, options = {}) {
  if (!isoString) return '';
  const defaults = {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  };
  return new Date(isoString).toLocaleString('en-GB', { ...defaults, ...options });
}

// Format a date for display
export function formatDate(isoString, timezone) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  });
}

// Format a time range
export function formatTimeRange(startIso, endIso, timezone) {
  if (!startIso) return '';
  const start = formatInTimezone(startIso, timezone, { hour: '2-digit', minute: '2-digit' });
  const end = endIso ? formatInTimezone(endIso, timezone, { hour: '2-digit', minute: '2-digit' }) : '';
  return end ? `${start} – ${end}` : start;
}

// Create a calendar event (authoritative Calendar record)
export async function createEvent(data) {
  const {
    owner_id, owner_type, operating_context, title, description,
    start_time, end_time, timezone, all_day, location_id, location_type,
    meeting_url, visibility, source_system, source_id, business_id,
    created_by_id, recurrence_rule,
  } = data;

  return base44.entities.CalendarEvent.create({
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
  });
}

// Update a calendar event
export async function updateEvent(eventId, data) {
  return base44.entities.CalendarEvent.update(eventId, data);
}

// Cancel a calendar event (does not delete — lifecycle transition)
export async function cancelEvent(eventId) {
  return base44.entities.CalendarEvent.update(eventId, {
    lifecycle_state: 'cancelled',
  });
}

// Get events for an owner within a date range
export async function getEvents(ownerId, ownerType, startDate, endDate) {
  const all = await base44.entities.CalendarEvent.filter({
    owner_id: ownerId,
    owner_type: ownerType,
    lifecycle_state: { $ne: 'cancelled' },
  }, 'start_time', 200);

  // Filter by date range (client-side since we can't do range queries easily)
  const startMs = startDate ? new Date(startDate).getTime() : 0;
  const endMs = endDate ? new Date(endDate).getTime() : Date.now() + 365 * 24 * 60 * 60 * 1000;

  return all.filter(e => {
    const eventStart = new Date(e.start_time).getTime();
    return eventStart >= startMs && eventStart <= endMs;
  });
}

// Get events for a specific date
export async function getEventsForDate(ownerId, ownerType, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  return getEvents(ownerId, ownerType, startOfDay, endOfDay);
}

// Get all events for an identity across their contexts
export async function getAllEventsForIdentity(identityId, activeContext, businessId, startDate, endDate) {
  const events = [];

  // Personal events always available
  const personalEvents = await getEvents(identityId, 'identity', startDate, endDate);
  events.push(...personalEvents);

  // Professional events if professional is active
  if (activeContext === 'professional') {
    const profEvents = await getEvents(identityId, 'professional', startDate, endDate);
    events.push(...profEvents);
  }

  // Business events if in business context
  if (activeContext === 'business' && businessId) {
    const bizEvents = await getEvents(businessId, 'business', startDate, endDate);
    events.push(...bizEvents);
  }

  return events.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
}

// --- Availability ---

// Create an availability rule
export async function createAvailabilityRule(data) {
  return base44.entities.AvailabilityRule.create({
    ...data,
    timezone: data.timezone || getLocalTimezone(),
    lifecycle_state: 'active',
  });
}

// Get availability rules for an owner
export async function getAvailabilityRules(ownerId, ownerType) {
  return base44.entities.AvailabilityRule.filter({
    owner_id: ownerId,
    owner_type: ownerType,
    lifecycle_state: 'active',
  }, 'day_of_week', 50);
}

// Delete an availability rule
export async function deleteAvailabilityRule(ruleId) {
  return base44.entities.AvailabilityRule.update(ruleId, {
    lifecycle_state: 'archived',
  });
}

// Resolve availability for a specific date (combines recurring + exceptions)
export async function getAvailabilityForDate(ownerId, ownerType, date) {
  const rules = await getAvailabilityRules(ownerId, ownerType);
  const dayOfWeek = new Date(date).getDay();
  const dateStr = date.toISOString().split('T')[0];

  // One-off exceptions override recurring rules
  const exceptions = rules.filter(r => r.specific_date === dateStr);
  const recurring = rules.filter(r => !r.specific_date && r.day_of_week === dayOfWeek);

  // Merge: exceptions take priority
  return [...exceptions, ...recurring].sort((a, b) => a.start_time.localeCompare(b.start_time));
}

// --- External Calendar ---

// Create an external calendar connection (interface/stub for future OAuth)
export async function createExternalConnection(data) {
  return base44.entities.ExternalCalendarConnection.create({
    ...data,
    sync_status: 'pending',
  });
}

// Get external connections for an identity
export async function getExternalConnections(identityId) {
  return base44.entities.ExternalCalendarConnection.filter({
    identity_id: identityId,
    lifecycle_state: 'active',
  });
}

// Update sync status
export async function updateConnectionStatus(connectionId, status, error = null) {
  return base44.entities.ExternalCalendarConnection.update(connectionId, {
    sync_status: status,
    sync_error: error,
    last_synced_at: status === 'connected' ? new Date().toISOString() : undefined,
  });
}

// Check if a user can access a calendar event (permission gate)
export function canAccessEvent(event, identityId, businessId, businessRole) {
  if (!event) return false;
  // Owner always has access
  if (event.owner_id === identityId) return true;
  // Created by has access
  if (event.created_by_id === identityId) return true;
  // Business events — check business membership
  if (event.owner_type === 'business' && event.business_id === businessId) {
    // Staff visibility: only owner/admin can see all staff events
    if (event.visibility === 'staff' && (businessRole === 'owner' || businessRole === 'admin')) return true;
    if (event.visibility === 'public') return true;
  }
  // Public events
  if (event.visibility === 'public') return true;
  return false;
}