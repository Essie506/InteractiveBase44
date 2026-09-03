// Recurrence controls — RRULE builder UI for EventModal (§53–§58).
// ───────────────────────────────────────────────────────────
// UI persists canonical recurrence configuration only (the RRULE string
// stored on the CalendarEvent). Occurrence expansion remains in the
// recurrence engine (src/lib/recurrence.js) — this component never
// generates or persists individual occurrences.

import { useState } from 'react';
import { Repeat } from 'lucide-react';

const FREQ_OPTIONS = [
  { value: '', label: 'Does not repeat' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
];

const BYDAY_OPTIONS = [
  { value: 'MO', label: 'Mon' },
  { value: 'TU', label: 'Tue' },
  { value: 'WE', label: 'Wed' },
  { value: 'TH', label: 'Thu' },
  { value: 'FR', label: 'Fri' },
  { value: 'SA', label: 'Sat' },
  { value: 'SU', label: 'Sun' },
];

const END_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: 'count', label: 'After N occurrences' },
  { value: 'until', label: 'On a date' },
];

/**
 * Parse an existing RRULE string into the UI state.
 */
function parseRRuleToState(rrule) {
  if (!rrule) return { freq: '', interval: 1, byDay: [], endType: 'never', count: 5, until: '' };
  const parts = {};
  for (const seg of rrule.replace(/^RRULE:/i, '').split(';')) {
    const [k, v] = seg.split('=');
    if (k && v) parts[k.toUpperCase()] = v;
  }
  const byDay = parts.BYDAY ? parts.BYDAY.split(',').map(d => d.trim()) : [];
  let endType = 'never';
  if (parts.COUNT) endType = 'count';
  else if (parts.UNTIL) endType = 'until';
  let until = '';
  if (parts.UNTIL) {
    const u = parts.UNTIL;
    if (/^\d{8}$/.test(u)) until = `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}`;
    else if (/^\d{8}T\d{6}Z$/.test(u)) until = `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}`;
    else until = u.slice(0, 10);
  }
  return {
    freq: parts.FREQ || '',
    interval: parts.INTERVAL ? parseInt(parts.INTERVAL, 10) : 1,
    byDay,
    endType,
    count: parts.COUNT ? parseInt(parts.COUNT, 10) : 5,
    until,
  };
}

/**
 * Build an RRULE string from the UI state.
 */
function buildRRule(state) {
  if (!state.freq) return null;
  const parts = [`FREQ=${state.freq}`];
  if (state.interval && state.interval > 1) parts.push(`INTERVAL=${state.interval}`);
  if (state.freq === 'WEEKLY' && state.byDay.length > 0) parts.push(`BYDAY=${state.byDay.join(',')}`);
  if (state.endType === 'count' && state.count) parts.push(`COUNT=${state.count}`);
  if (state.endType === 'until' && state.until) {
    const compact = state.until.replace(/-/g, '');
    parts.push(`UNTIL=${compact}T235959Z`);
  }
  return parts.join(';');
}

export default function RecurrenceControls({ rrule, onChange }) {
  const [state, setState] = useState(() => parseRRuleToState(rrule));

  const update = (patch) => {
    const next = { ...state, ...patch };
    setState(next);
    const built = buildRRule(next);
    onChange(built);
  };

  const toggleByDay = (day) => {
    const has = state.byDay.includes(day);
    update({ byDay: has ? state.byDay.filter(d => d !== day) : [...state.byDay, day] });
  };

  const inputClass = "w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
        <Repeat className="w-4 h-4 text-stone-500" />
        Recurrence
      </div>

      <div>
        <label className="block text-xs font-medium text-stone-500 mb-1">Repeat</label>
        <select
          value={state.freq}
          onChange={(e) => update({ freq: e.target.value })}
          className={inputClass}
        >
          {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {state.freq && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Interval (every N {state.freq === 'DAILY' ? 'days' : state.freq === 'WEEKLY' ? 'weeks' : 'months'})</label>
              <input
                type="number"
                min="1"
                value={state.interval}
                onChange={(e) => update({ interval: Math.max(1, parseInt(e.target.value) || 1) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Ends</label>
              <select
                value={state.endType}
                onChange={(e) => update({ endType: e.target.value })}
                className={inputClass}
              >
                {END_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {state.endType === 'count' && (
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Number of occurrences</label>
              <input
                type="number"
                min="1"
                value={state.count}
                onChange={(e) => update({ count: Math.max(1, parseInt(e.target.value) || 1) })}
                className={inputClass}
              />
            </div>
          )}

          {state.endType === 'until' && (
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">End date</label>
              <input
                type="date"
                value={state.until}
                onChange={(e) => update({ until: e.target.value })}
                className={inputClass}
              />
            </div>
          )}

          {state.freq === 'WEEKLY' && (
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">Repeat on</label>
              <div className="flex gap-1.5">
                {BYDAY_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleByDay(value)}
                    className={`w-9 h-9 rounded-lg text-xs font-medium transition-colors ${
                      state.byDay.includes(value)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}