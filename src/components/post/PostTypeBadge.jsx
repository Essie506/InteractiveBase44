// PostTypeBadge — small badge showing the post type (V2 §9).
import { MessageSquare, Trophy, GraduationCap, Dumbbell, Building2, Megaphone, Calendar, CalendarDays, Link, TrendingUp, HelpCircle } from 'lucide-react';
import { getPostTypeConfig } from '@/data/postTypes';

const ICONS = {
  MessageSquare, Trophy, GraduationCap, Dumbbell, Building2,
  Megaphone, Calendar, CalendarDays, Link, TrendingUp, HelpCircle,
};

const TYPE_STYLES = {
  standard: 'bg-stone-100 text-stone-600',
  achievement: 'bg-amber-50 text-amber-700',
  educational: 'bg-blue-50 text-blue-700',
  workout: 'bg-indigo-50 text-indigo-700',
  business_update: 'bg-slate-100 text-slate-700',
  promotion: 'bg-emerald-50 text-emerald-700',
  event: 'bg-violet-50 text-violet-700',
  calendar_event: 'bg-violet-50 text-violet-700',
  blog_share: 'bg-cyan-50 text-cyan-700',
  progress_update: 'bg-teal-50 text-teal-700',
  community_question: 'bg-orange-50 text-orange-700',
};

export default function PostTypeBadge({ type }) {
  const config = getPostTypeConfig(type);
  const Icon = ICONS[config.icon] || MessageSquare;
  const style = TYPE_STYLES[type] || TYPE_STYLES.standard;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}