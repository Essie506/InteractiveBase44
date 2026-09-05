import { Link } from 'react-router-dom';
import { CalendarPlus, Clock } from 'lucide-react';

// MessageEventCard — renders a calendar_invite message as a rich event
// card inside a conversation (§79/§80). The message body carries the event
// title; calendar_event_id deep-links into the Calendar with the event
// focused (SPA-native routing preserves state integrity).
export default function MessageEventCard({ message, isOwn }) {
  const eventId = message?.calendar_event_id;
  return (
    <Link
      to={eventId ? `/calendar?event=${eventId}` : '/calendar'}
      className={`block mt-2 rounded-xl border p-3 transition-colors ${isOwn ? 'bg-indigo-500/20 border-indigo-400/40 hover:bg-indigo-500/30' : 'bg-stone-50 border-stone-200 hover:bg-stone-100'}`}
    >
      <div className="flex items-center gap-2">
        <CalendarPlus className={`w-4 h-4 flex-shrink-0 ${isOwn ? 'text-indigo-200' : 'text-indigo-600'}`} />
        <span className={`text-sm font-medium truncate ${isOwn ? 'text-white' : 'text-stone-800'}`}>{message?.body || 'Calendar event'}</span>
      </div>
      <div className={`mt-1 flex items-center gap-1 text-xs ${isOwn ? 'text-indigo-200' : 'text-stone-500'}`}>
        <Clock className="w-3 h-3" /> View in Calendar
      </div>
    </Link>
  );
}