// PostTypeSelector — V2 Post Type Engine §9.
// Renders the 11 spec post types as a selectable grid.
import { MessageSquare, Trophy, GraduationCap, Dumbbell, Building2, Megaphone, Calendar, CalendarDays, Link, TrendingUp, HelpCircle } from 'lucide-react';
import { POST_TYPES } from '@/data/postTypes';

const ICONS = {
  MessageSquare, Trophy, GraduationCap, Dumbbell, Building2,
  Megaphone, Calendar, CalendarDays, Link, TrendingUp, HelpCircle,
};

export default function PostTypeSelector({ value, onChange }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {POST_TYPES.map((t) => {
        const Icon = ICONS[t.icon] || MessageSquare;
        const active = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={`flex flex-col items-center gap-1 p-3 border rounded-lg text-center transition-colors ${
              active
                ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                : 'border-stone-200 text-stone-600 hover:bg-stone-50'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-xs font-medium leading-tight">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}