import { useState, useRef } from 'react';
import { Loader2, X } from 'lucide-react';
import MandatoryLabel from '@/components/MandatoryLabel';
import FieldError from '@/components/FieldError';
import { createEvent, updateEvent, getLocalTimezone } from '@/lib/calendar';
import InviteByEmailInput from '@/components/calendar/InviteByEmailInput';
import StaffAssignPicker from '@/components/calendar/StaffAssignPicker';
import RecurrenceControls from '@/components/calendar/RecurrenceControls';
import ReminderControls from '@/components/calendar/ReminderControls';
import EventHistoryTimeline from '@/components/calendar/EventHistoryTimeline';
import { EVENT_CATEGORIES, COLOR_PALETTE } from '@/lib/calendarCategory';
import { useToast } from '@/components/ui/use-toast';

// Classify a save error as a §39 conflict rejection. The canonical
// saveCalendarEvent throws HttpsError('failed-precondition', 'Time slot
// conflicts with an existing event') when the server-side transaction +
// sentinel detects an overlap for protected Professional/Business time.
// The Firebase SDK surfaces this as code 'functions/failed-precondition'.
// We detect it (by code or the word "conflict") so the UI can show a
// clear, specific message instead of a generic save failure — without
// adding a second, divergent client-side conflict engine.
function isConflictError(err) {
  const code = err?.code || '';
  const msg = (err?.message || '').toLowerCase();
  return code.includes('failed-precondition') || msg.includes('conflict');
}

// EventModal — create or edit a calendar event.
// Calendar is authoritative for the event record. Manual creates flow
// through the canonical saveCalendarEvent Cloud Function, which uses a
// deterministic idempotency key (owner_type + owner_id + source_system +
// source_id) so concurrent retries of the same logical Add produce
// exactly one authoritative event. The source_id is generated once per
// Add operation and reused across retries.
export default function EventModal({ ownerId, ownerType, operatingContext, createdBy, businessId, existingEvent, timezone, onClose, onSaved }) {
  const isEditing = !!existingEvent;
  // One stable source_id per logical Add operation. Generated on first
  // render of a create modal and preserved across retries; a genuinely
  // new Add (reopening the modal) gets a new ref value.
  const createSourceIdRef = useRef(null);
  if (!isEditing && !createSourceIdRef.current) {
    createSourceIdRef.current = crypto.randomUUID();
  }
  const [title, setTitle] = useState(existingEvent?.title || '');
  const [description, setDescription] = useState(existingEvent?.description || '');
  const [date, setDate] = useState(
    existingEvent ? new Date(existingEvent.start_time).toISOString().split('T')[0] : ''
  );
  const [startTime, setStartTime] = useState(
    existingEvent ? new Date(existingEvent.start_time).toTimeString().substring(0, 5) : '09:00'
  );
  const [endTime, setEndTime] = useState(
    existingEvent ? new Date(existingEvent.end_time).toTimeString().substring(0, 5) : '10:00'
  );
  const [allDay, setAllDay] = useState(existingEvent?.all_day || false);
  const [locationType, setLocationType] = useState(existingEvent?.location_type || 'physical');
  const [location, setLocation] = useState(existingEvent?.location || '');
  const [meetingUrl, setMeetingUrl] = useState(existingEvent?.meeting_url || '');
  const [visibility, setVisibility] = useState(existingEvent?.visibility || 'private');
  const [category, setCategory] = useState(existingEvent?.category || '');
  const [color, setColor] = useState(existingEvent?.color || '');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [invitedEmails, setInvitedEmails] = useState(
    existingEvent?.invited_guest_emails?.join(', ') || ''
  );
  const [assignedIdentityIds, setAssignedIdentityIds] = useState(
    Array.isArray(existingEvent?.assigned_identity_ids) ? existingEvent.assigned_identity_ids : []
  );
  const [recurrenceRule, setRecurrenceRule] = useState(existingEvent?.recurrence_rule || null);
  const { toast } = useToast();

  const inputClass = "w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400";

  const validate = () => {
    const e = {};
    if (!title.trim()) e.title = 'Title is required';
    if (!date) e.date = 'Date is required';
    if (!allDay) {
      if (!startTime) e.startTime = 'Start time is required';
      if (!endTime) e.endTime = 'End time is required';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const tz = timezone || getLocalTimezone();
      // All-day events use a TZ-invariant UTC date (§97): the date is stored
      // as UTC midnight so it does not shift across viewer time zones. The
      // calendar grid groups all-day events by this UTC date, not by the
      // viewer's local date, so the event lands on the same date everywhere.
      const startIso = allDay
        ? `${date}T00:00:00.000Z`
        : new Date(`${date}T${startTime}`).toISOString();
      const endIso = allDay
        ? `${date}T23:59:59.000Z`
        : new Date(`${date}T${endTime}`).toISOString();

      const data = {
        owner_id: ownerId,
        owner_type: ownerType,
        operating_context: operatingContext,
        title,
        description: description || null,
        start_time: startIso,
        end_time: endIso,
        timezone: tz,
        all_day: allDay,
        location_type: locationType,
        // Persist the venue/address through the canonical Calendar event
        // schema. Only meaningful for physical/hybrid events.
        location: locationType !== 'online' ? (location || null) : null,
        meeting_url: locationType !== 'physical' ? meetingUrl : null,
        visibility,
        category: category || null,
        color: color || null,
        business_id: businessId,
        created_by_id: createdBy,
        source_system: 'manual',
        // Stable across retries of the same logical Add; reused by the
        // canonical writer's idempotency key so concurrent retries resolve
        // to one authoritative event.
        source_id: isEditing ? (existingEvent.source_id || existingEvent.id) : createSourceIdRef.current,
        assigned_identity_ids: ownerType === 'business' ? assignedIdentityIds : [],
        invited_emails: invitedEmails
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
        recurrence_rule: recurrenceRule,
      };

      let saved;
      if (isEditing) {
        saved = await updateEvent(existingEvent.id, data);
      } else {
        saved = await createEvent(data);
      }
      onSaved(saved);
    } catch (err) {
      if (isConflictError(err)) {
        // §39 rejection — the server's transaction/sentinel blocked the
        // save because the time overlaps an existing protected event.
        // Show a clear "time unavailable" message and keep the modal open
        // so the user can adjust the time. The authoritative check stays
        // server-side; no client-side conflict engine is added.
        toast({
          title: 'Time slot unavailable',
          description: 'This time conflicts with an existing event. Please choose a different time.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Could not save event',
          description: err?.message || 'Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-stone-100">
          <h2 className="text-xl font-bold text-stone-800">{isEditing ? 'Edit Event' : 'New Calendar Event'}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <MandatoryLabel htmlFor="evt-title" required>Title</MandatoryLabel>
            <input id="evt-title" type="text" value={title} onChange={e => setTitle(e.target.value)} className={inputClass} placeholder="Event title" />
            <FieldError error={errors.title} />
          </div>

          <div>
            <MandatoryLabel htmlFor="evt-date" required>Date</MandatoryLabel>
            <input id="evt-date" type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} />
            <FieldError error={errors.date} />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="w-4 h-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500" />
            <span className="text-sm text-stone-700">All day</span>
          </label>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <MandatoryLabel htmlFor="evt-start" required>Start Time</MandatoryLabel>
                <input id="evt-start" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputClass} />
                <FieldError error={errors.startTime} />
              </div>
              <div>
                <MandatoryLabel htmlFor="evt-end" required>End Time</MandatoryLabel>
                <input id="evt-end" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputClass} />
                <FieldError error={errors.endTime} />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={inputClass + " resize-none"} placeholder="Optional description" />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Location Type</label>
            <select value={locationType} onChange={e => setLocationType(e.target.value)} className={inputClass}>
              <option value="physical">Physical</option>
              <option value="online">Online</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>

          {locationType !== 'online' && (
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Location</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} className={inputClass} placeholder="Venue name or address" />
              <p className="text-xs text-stone-400 mt-1">The venue or address for this {locationType} event.</p>
            </div>
          )}

          {locationType !== 'physical' && (
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Meeting URL</label>
              <input type="url" value={meetingUrl} onChange={e => setMeetingUrl(e.target.value)} placeholder="https://..." className={inputClass} />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Visibility</label>
            <select value={visibility} onChange={e => setVisibility(e.target.value)} className={inputClass}>
              <option value="private">Private</option>
              <option value="connections">Connections</option>
              <option value="public">Public</option>
              {ownerType === 'business' && <option value="staff">Staff Only</option>}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Category</label>
            <select value={category} onChange={e => { setCategory(e.target.value); setColor(''); }} className={inputClass}>
              {EVENT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <p className="text-xs text-stone-400 mt-1">Personal category for this event (§11). Used for filtering and colour.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Colour</label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PALETTE.map((key) => {
                const dotClass = {
                  indigo: 'bg-indigo-500', blue: 'bg-blue-500', emerald: 'bg-emerald-500',
                  amber: 'bg-amber-500', rose: 'bg-rose-500', violet: 'bg-violet-500',
                  cyan: 'bg-cyan-500', orange: 'bg-orange-500', red: 'bg-red-500',
                  pink: 'bg-pink-500', purple: 'bg-purple-500', teal: 'bg-teal-500',
                }[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setColor(color === key ? '' : key)}
                    aria-label={key}
                    aria-pressed={color === key}
                    className={`w-7 h-7 rounded-full ${dotClass} transition-transform ${color === key ? 'ring-2 ring-offset-2 ring-stone-800 scale-110' : 'hover:scale-110'}`}
                  />
                );
              })}
            </div>
            <p className="text-xs text-stone-400 mt-1">Overrides the category colour. Leave unset to use the category default.</p>
          </div>

          <InviteByEmailInput value={invitedEmails} onChange={setInvitedEmails} />

          {ownerType === 'business' && (
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Assign to staff</label>
              <StaffAssignPicker businessId={businessId} selected={assignedIdentityIds} onChange={setAssignedIdentityIds} />
              <p className="text-xs text-stone-400 mt-1">Assigned staff can view the event. Only Calendar managers can edit it.</p>
            </div>
          )}

          <div className="border-t border-stone-100 pt-4">
            <RecurrenceControls rrule={recurrenceRule} onChange={setRecurrenceRule} />
          </div>

          {isEditing && (
            <div className="border-t border-stone-100 pt-4">
              <ReminderControls eventId={existingEvent.id} />
            </div>
          )}

          {isEditing && (
            <div className="border-t border-stone-100 pt-4">
              <EventHistoryTimeline eventId={existingEvent.id} timezone={timezone} collapsed />
            </div>
          )}
        </div>

        <div className="flex gap-3 p-6 border-t border-stone-100">
          <button onClick={onClose} className="px-5 py-2.5 text-stone-600 hover:bg-stone-100 rounded-lg font-medium transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : (isEditing ? 'Update Event' : 'Create Event')}
          </button>
        </div>
      </div>
    </div>
  );
}