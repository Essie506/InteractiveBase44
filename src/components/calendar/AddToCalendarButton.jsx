import { useState } from 'react';
import { CalendarPlus, Download, Globe, Smartphone } from 'lucide-react';
import { downloadIcs, googleCalendarUrl, outlookCalendarUrl } from '@/lib/icsExport';
import { useToast } from '@/components/ui/use-toast';

// Add-to-external-calendar action (§44, §103). Presents an explicit
// menu of external calendar targets rather than triggering an unexpected
// .ics download. The .ics download remains as a labelled fallback option.
// The meeting URL is passed through only by authorised viewers (the
// public projection never carries it). Event data/timezone information
// supplied to external calendars is preserved unchanged.
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

  const handleOutlook = () => {
    window.open(outlookCalendarUrl(event, { meetingUrl }), '_blank', 'noopener');
    setOpen(false);
  };

  // Apple Calendar has no web "add event" URL. The .ics download is the
  // canonical mechanism — on macOS/iOS it opens Calendar.app and prompts
  // to add the event; on other platforms it downloads the file.
  const handleApple = () => {
    downloadIcs(event, { meetingUrl, organiserName });
    setOpen(false);
    toast({ title: 'Opening in Apple Calendar…' });
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${compact ? '' : 'w-full justify-center'}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <CalendarPlus className="w-4 h-4" /> Add to external calendar
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="menu" className="absolute right-0 mt-1 z-20 bg-white border border-stone-200 rounded-lg shadow-lg py-1 w-52">
            <button type="button" role="menuitem" onClick={handleGoogle} className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2 focus:outline-none focus-visible:bg-stone-50">
              <CalendarPlus className="w-3.5 h-3.5" /> Google Calendar
            </button>
            <button type="button" role="menuitem" onClick={handleOutlook} className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2 focus:outline-none focus-visible:bg-stone-50">
              <Globe className="w-3.5 h-3.5" /> Outlook
            </button>
            <button type="button" role="menuitem" onClick={handleApple} className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2 focus:outline-none focus-visible:bg-stone-50">
              <Smartphone className="w-3.5 h-3.5" /> Apple Calendar
            </button>
            <div className="border-t border-stone-100 my-1" />
            <button type="button" role="menuitem" onClick={handleIcs} className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2 focus:outline-none focus-visible:bg-stone-50">
              <Download className="w-3.5 h-3.5" /> Download .ics file
            </button>
          </div>
        </>
      )}
    </div>
  );
}