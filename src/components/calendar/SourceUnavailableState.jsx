// Source Unavailable State — privacy-safe representation (§111).
// ───────────────────────────────────────────────────────────
// Renders a Calendar Event whose source detail cannot be retrieved.
// Shows only Calendar-owned information (time, date). Does NOT
// fabricate source information (§111).
//
// Used inline within event cards/list items when isSourceUnavailable
// returns true. Replaces source-owned detail (title, description,
// meeting_url) with privacy-safe placeholders.

import { AlertCircle, Clock } from 'lucide-react';
import { getSourceUnavailableLabel } from '@/lib/sourceUnavailable';
import { formatTimeRange } from '@/lib/calendar';

export default function SourceUnavailableState({ occ, timezone }) {
  const e = occ.event;
  const label = getSourceUnavailableLabel(e);

  return (
    <div
      className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-amber-200 bg-amber-50"
      role="status"
      aria-label={`Source unavailable event at ${e.all_day ? 'all day' : formatTimeRange(occ.start, occ.end, e.timezone || timezone)}`}
    >
      <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-800">{e.title || 'Unavailable event'}</p>
        <div className="flex items-center gap-1.5 text-xs text-amber-600">
          <Clock className="w-3 h-3" aria-hidden="true" />
          <time dateTime={occ.start}>
            {e.all_day ? 'All day' : formatTimeRange(occ.start, occ.end, e.timezone || timezone)}
          </time>
          {label && <span className="text-amber-500">• {label}</span>}
        </div>
      </div>
    </div>
  );
}