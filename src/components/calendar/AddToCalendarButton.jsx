import { useState } from 'react';
import { CalendarPlus, Download, Loader2 } from 'lucide-react';
import { downloadIcs, googleCalendarUrl } from '@/lib/icsExport';
import { useToast } from '@/components/ui/use-toast';

// Add-to-Calendar / .ics export (§44, §103). Renders a compact control
// letting a guest add the event to an external calendar client. The
// meeting URL is passed through only by authorised viewers (the public
// projection never carries it).
export default function AddToCalendarButton({ event, meetingUrl, organiserName, compact }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  if (!event) return null;

  const handleIcs = () => {
    downloadIcs(event, { meetingUrl, organiserName });
    setOpen(false);
    toast({ title: 'Calendar file downloaded' });
  };

  const handleGoogle = () => {
    window.open(googleCalendarUrl(event, { meetingUrl }), '_blank', 'noopener');
    setOpen(false);
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 transition-colors ${compact ? '' : 'w-full justify-center'}`}
      >
        <CalendarPlus className="w-4 h-4" /> Add to Calendar
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 mt-1 z-20 bg-white border border-stone-200 rounded-lg shadow-lg py-1 w-48">
            <button type="button" onClick={handleIcs} className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2">
              <Download className="w-3.5 h-3.5" /> Download .ics
            </button>
            <button type="button" onClick={handleGoogle} className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2">
              <CalendarPlus className="w-3.5 h-3.5" /> Google Calendar
            </button>
          </div>
        </>
      )}
    </div>
  );
}