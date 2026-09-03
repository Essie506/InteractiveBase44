// Calendar view switcher — Today / Month / Week / Day / Agenda (§18–§20).
// All views consume the shared normalized occurrence model.
// Today View (§19) is a focused current-day summary, distinct from Day View.

import { Calendar, CalendarDays, CalendarRange, List, Sun } from 'lucide-react';

const VIEWS = [
  { key: 'today', label: 'Today', icon: Sun },
  { key: 'month', label: 'Month', icon: Calendar },
  { key: 'week', label: 'Week', icon: CalendarRange },
  { key: 'day', label: 'Day', icon: CalendarDays },
  { key: 'agenda', label: 'Agenda', icon: List },
];

export default function CalendarViewSwitcher({ view, onChange }) {
  return (
    <div
      className="inline-flex items-center gap-1 bg-stone-100 rounded-lg p-1"
      role="tablist"
      aria-label="Calendar view"
    >
      {VIEWS.map(({ key, label, icon: Icon }) => {
        const isActive = view === key;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={isActive}
            aria-label={`${label} view`}
            onClick={() => onChange(key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              isActive
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}