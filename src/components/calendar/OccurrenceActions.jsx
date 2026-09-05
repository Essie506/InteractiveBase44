import { useState } from 'react';
import { CalendarX, CalendarClock, Loader2 } from 'lucide-react';
import { saveOccurrenceException, splitRecurrenceSeries } from '@/lib/calendar';
import { canEditEvent } from '@/lib/calendarAuthority';
import { useToast } from '@/components/ui/use-toast';
import MandatoryLabel from '@/components/MandatoryLabel';
import FieldError from '@/components/FieldError';

// Occurrence-level edit / cancel / reschedule for recurring series (§55/§56).
// ───────────────────────────────────────────────────────────
// Renders controls for a single occurrence of a recurring series:
//   - Cancel this occurrence (exception_type 'cancelled')
//   - Reschedule this occurrence (exception_type 'rescheduled')
//   - Edit this and future (series split — §57)
//
// Authority: only the creator / identity owner / business calendar manager
// can mutate a series (canEditEvent). Invitees/assignees do not see these
// controls. The server-side saveOccurrenceException / splitRecurrenceSeries
// re-checks authority.
//
// The occurrence is identified by its stable original_start_time (the
// occurrenceId is seriesId__originalStart).
export default function OccurrenceActions({ occurrence, user, onChanged }) {
  const event = occurrence?.event || occurrence;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null); // 'cancel' | 'reschedule' | 'split'
  const [newDate, setNewDate] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  if (!occurrence || !occurrence.isRecurring) return null;
  if (!canEditEvent(event, user)) return null;
  if (event.source_system && event.source_system !== 'manual') return null;

  const originalStart = occurrence.start; // ISO of this occurrence

  const openReschedule = () => {
    const d = new Date(originalStart);
    setNewDate(d.toISOString().split('T')[0]);
    setNewStart(d.toTimeString().substring(0, 5));
    const endD = new Date(occurrence.end);
    setNewEnd(endD.toTimeString().substring(0, 5));
    setMode('reschedule');
    setOpen(true);
  };

  const handleCancel = async () => {
    setSaving(true);
    try {
      await saveOccurrenceException({
        series_event_id: event.id,
        original_start_time: originalStart,
        exception_type: 'cancelled',
      });
      toast({ title: 'Occurrence cancelled' });
      setOpen(false);
      onChanged?.();
    } catch (err) {
      toast({ title: 'Could not cancel occurrence', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleReschedule = async () => {
    if (!newDate || !newStart || !newEnd) return;
    setSaving(true);
    try {
      const newStartIso = new Date(`${newDate}T${newStart}`).toISOString();
      const newEndIso = new Date(`${newDate}T${newEnd}`).toISOString();
      await saveOccurrenceException({
        series_event_id: event.id,
        original_start_time: originalStart,
        exception_type: 'rescheduled',
        new_start_time: newStartIso,
        new_end_time: newEndIso,
      });
      toast({ title: 'Occurrence rescheduled' });
      setOpen(false);
      onChanged?.();
    } catch (err) {
      toast({ title: 'Could not reschedule occurrence', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSplit = async () => {
    setSaving(true);
    try {
      await splitRecurrenceSeries({
        series_event_id: event.id,
        split_start_time: originalStart,
      });
      toast({ title: 'Series split from this occurrence' });
      setOpen(false);
      onChanged?.();
    } catch (err) {
      toast({ title: 'Could not split series', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400';

  return (
    <div className="border-t border-stone-100 pt-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={handleCancel} disabled={saving} className="text-xs text-red-500 font-medium hover:text-red-600 flex items-center gap-1 disabled:opacity-50">
          {saving && mode === 'cancel' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarX className="w-3 h-3" />} Cancel this occurrence
        </button>
        <button type="button" onClick={openReschedule} disabled={saving} className="text-xs text-indigo-600 font-medium hover:text-indigo-700 flex items-center gap-1 disabled:opacity-50">
          <CalendarClock className="w-3 h-3" /> Reschedule this occurrence
        </button>
        <button type="button" onClick={() => { setMode('split'); setOpen(true); }} disabled={saving} className="text-xs text-stone-600 font-medium hover:text-stone-900 flex items-center gap-1 disabled:opacity-50">
          Edit this &amp; future
        </button>
      </div>

      {open && mode === 'reschedule' && (
        <div className="mt-3 p-3 bg-stone-50 rounded-lg space-y-3">
          <p className="text-xs text-stone-500">Move only this occurrence to a new time.</p>
          <div>
            <MandatoryLabel htmlFor="occ-date" required>Date</MandatoryLabel>
            <input id="occ-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <MandatoryLabel htmlFor="occ-start" required>Start</MandatoryLabel>
              <input id="occ-start" type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className={inputClass} />
            </div>
            <div>
              <MandatoryLabel htmlFor="occ-end" required>End</MandatoryLabel>
              <input id="occ-end" type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 rounded-lg">Cancel</button>
            <button type="button" onClick={handleReschedule} disabled={saving} className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save
            </button>
          </div>
        </div>
      )}

      {open && mode === 'split' && (
        <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-100 space-y-2">
          <p className="text-xs text-amber-700">
            This splits the series: past occurrences stay on the current series; this occurrence and all future ones move to a new series you can edit independently.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 rounded-lg">Cancel</button>
            <button type="button" onClick={handleSplit} disabled={saving} className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Split series
            </button>
          </div>
        </div>
      )}
    </div>
  );
}