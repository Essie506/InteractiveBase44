// UpcomingEventsModule — shows the next few calendar events.
import CalendarWidget from '@/components/dashboard/CalendarWidget';
import { Calendar } from 'lucide-react';

export default function UpcomingEventsModule() {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-stone-500" />
        <h3 className="font-semibold text-stone-800 text-sm">Upcoming Events</h3>
      </div>
      <CalendarWidget />
    </div>
  );
}