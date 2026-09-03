// Calendar view switcher — Month / Week / Day / Agenda (§18–§20).
// All views consume the shared normalized occurrence model.

import { Calendar, CalendarDays, CalendarRange, List } from 'lucide-react';

const VIEWS = [
  { key: 'month', label: 'Month', icon: Calendar },
  { key: 'week', label: 'Week', icon: CalendarRange },
  { key: 'day', label: 'Day', icon: CalendarDays },
  { key: 'agenda', label: 'Agenda', icon: List },
];

export default function CalendarViewSwitcher({ view, onChange }) {
  return (
    <div className="inline-flex items-center gap-1 bg-stone-100 rounded-lg p-1">
      {VIEWS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === key
              ? 'bg-white text-stone-900 shadow-sm'
              : 'text-stone-500 hover:text-stone-700'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}