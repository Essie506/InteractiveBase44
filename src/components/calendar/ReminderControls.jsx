// Reminder controls — participant-specific reminder configuration (§59–§63).
// ───────────────────────────────────────────────────────────
// UI persists canonical ReminderRule configuration only (offset_minutes +
// delivery_channels). The reminder sweep (reminderSweep.ts) reads these
// rules and emits calendar.reminder.due notifications with idempotency.
//
// Reminders are per-identity — the caller sets their own reminder on an
// event they participate in. Multiple participants can have independent
// reminders on the same event.

import { useState, useEffect } from 'react';
import { Bell, Plus, Trash2, Loader2 } from 'lucide-react';
import { getReminderRulesForEvent, saveReminderRule, deleteReminderRule } from '@/lib/calendar';

const OFFSET_OPTIONS = [
  { value: 0, label: 'At event start' },
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
];

const CHANNEL_OPTIONS = [
  { value: 'in_app', label: 'In-app' },
  { value: 'email', label: 'Email' },
];

export default function ReminderControls({ eventId }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newOffset, setNewOffset] = useState(30);
  const [newChannels, setNewChannels] = useState(['in_app', 'email']);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await getReminderRulesForEvent(eventId);
        if (!cancelled) setRules(r);
      } catch {
        if (!cancelled) setRules([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  const handleAdd = async () => {
    setSaving(true);
    try {
      const result = await saveReminderRule({
        event_id: eventId,
        offset_minutes: newOffset,
        delivery_channels: newChannels,
      });
      const r = await getReminderRulesForEvent(eventId);
      setRules(r);
    } catch (err) {
      // Error — keep silent (toast handled by parent if needed)
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ruleId) => {
    setSaving(true);
    try {
      await deleteReminderRule(ruleId);
      setRules(rules.filter(r => r.id !== ruleId));
    } catch {
      // Error
    } finally {
      setSaving(false);
    }
  };

  const toggleChannel = (ch) => {
    setNewChannels(newChannels.includes(ch)
      ? newChannels.filter(c => c !== ch)
      : [...newChannels, ch]);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-stone-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading reminders...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
        <Bell className="w-4 h-4 text-stone-500" />
        Reminders
      </div>

      {rules.length > 0 && (
        <div className="space-y-1.5">
          {rules.map(rule => {
            const opt = OFFSET_OPTIONS.find(o => o.value === rule.offset_minutes);
            return (
              <div key={rule.id} className="flex items-center justify-between px-3 py-2 bg-stone-50 rounded-lg">
                <div className="text-sm text-stone-700">
                  {opt ? opt.label : `${rule.offset_minutes} min before`}
                  <span className="text-xs text-stone-400 ml-2">
                    {(rule.delivery_channels || []).join(', ')}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(rule.id)}
                  disabled={saving}
                  className="text-stone-400 hover:text-red-500 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs font-medium text-stone-500 mb-1">Add reminder</label>
          <select
            value={newOffset}
            onChange={(e) => setNewOffset(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
          >
            {OFFSET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex gap-1">
          {CHANNEL_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => toggleChannel(value)}
              className={`px-2.5 py-2 text-xs rounded-lg font-medium transition-colors ${
                newChannels.includes(value)
                  ? 'bg-indigo-600 text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || newChannels.length === 0}
          className="inline-flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add
        </button>
      </div>
    </div>
  );
}