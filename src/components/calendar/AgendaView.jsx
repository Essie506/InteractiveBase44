// Agenda view — chronological scrolling list (§20).
// Consumes the shared normalized occurrence model. Paginates by
// loading more occurrences as the user scrolls (§113: pagination for
// large Agenda history).
//
// Accessibility (§114): semantic <time>, ARIA labels, keyboard nav,
// visible focus, text labels alongside colour.
// Source Unavailable (§111): privacy-safe representation for redacted events.

import { useState, useMemo, useRef, useEffect } from 'react';
import { Clock, MapPin, CalendarOff, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import { formatTimeRange, formatDate } from '@/lib/calendar';
import {
  buildEventAriaLabel, getSourceTypeLabel, getLifecycleStateLabel,
} from '@/lib/calendarAccessibility';
import { isSourceUnavailable, getSafeDisplayValues, getSourceUnavailableLabel } from '@/lib/sourceUnavailable';
import { getEventBarClasses } from '@/lib/calendarCategory';
import EventInvitationBadge from './EventInvitationBadge';

const PAGE_SIZE = 50;

export default function AgendaView({ occurrences, timezone, onSelectEvent, selectedDate, hasMore = false, onLoadMore, participationMap, onParticipationResponse }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

  // Reset pagination when the occurrence set changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [occurrences]);

  // Group by date
  const byDate = useMemo(() => {
    const map = new Map();
    for (const occ of occurrences) {
      const event = occ.event;
      let dateKey;
      let dateLabel;
      if (event.all_day) {
        dateKey = occ.start.slice(0, 10);
        dateLabel = formatDate(occ.start, timezone);
      } else {
        const d = new Date(occ.start);
        dateKey = d.toDateString();
        dateLabel = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      }
      if (!map.has(dateKey)) map.set(dateKey, { label: dateLabel, items: [] });
      map.get(dateKey).items.push(occ);
    }
    return Array.from(map.entries()).sort((a, b) => {
      return new Date(a[1].items[0].start) - new Date(b[1].items[0].start);
    });
  }, [occurrences, timezone]);

  // Flatten for pagination
  const allItems = useMemo(() => {
    return byDate.flatMap(([dateKey, group]) =>
      group.items.map(occ => ({ dateKey, dateLabel: group.label, occ }))
    );
  }, [byDate]);

  const visibleItems = allItems.slice(0, visibleCount);
  const hasMoreLocal = allItems.length > visibleCount || hasMore;

  // Infinite scroll sentinel
  useEffect(() => {
    if (!hasMoreLocal || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((c) => c + PAGE_SIZE);
          if (onLoadMore) onLoadMore();
        }
      },
      { rootMargin: '100px' },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMoreLocal, onLoadMore]);

  // Re-group visible items by date for rendering
  const visibleByDate = useMemo(() => {
    const map = new Map();
    for (const item of visibleItems) {
      if (!map.has(item.dateKey)) map.set(item.dateKey, { label: item.dateLabel, items: [] });
      map.get(item.dateKey).items.push(item.occ);
    }
    return Array.from(map.entries());
  }, [visibleItems]);

  if (allItems.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-8">
        <div className="flex flex-col items-center justify-center py-8">
          <CalendarOff className="w-8 h-8 text-stone-300 mb-2" aria-hidden="true" />
          <p className="text-sm text-stone-400">No upcoming events</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-xl border border-stone-200 overflow-hidden"
      role="list"
      aria-label="Agenda"
    >
      {visibleByDate.map(([dateKey, group]) => (
        <div key={dateKey}>
          <div className="px-4 py-2 bg-stone-50 border-b border-stone-100">
            <h4 className="text-sm font-semibold text-stone-700">
              <time dateTime={dateKey}>{group.label}</time>
            </h4>
          </div>
          <div className="divide-y divide-stone-50">
            {group.items.map(occ => {
              const e = occ.event;
              const safe = getSafeDisplayValues(e);
              const sourceLabel = getSourceTypeLabel(e.source_system);
              const stateLabel = getLifecycleStateLabel(e.lifecycle_state);
              const unavailableLabel = getSourceUnavailableLabel(e);
              const unavailable = isSourceUnavailable(e);
              return (
                <div
                  key={occ.occurrenceId}
                  role="listitem"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectEvent(occ)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); onSelectEvent(occ); } }}
                    aria-label={buildEventAriaLabel(occ, timezone)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                  >
                    <div
                      className={`w-1 h-10 rounded-full flex-shrink-0 ${
                        unavailable ? 'bg-amber-400' : getEventBarClasses(e, occ)
                      }`}
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5 gap-1">
                        <span className="text-sm font-medium text-stone-800 truncate">{safe.title}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[10px] px-1 py-0.5 rounded bg-stone-100 text-stone-600">{sourceLabel}</span>
                          {stateLabel && <span className="text-xs text-red-500">{stateLabel}</span>}
                          {unavailable && <AlertCircle className="w-3 h-3 text-amber-500" aria-hidden="true" />}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-stone-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          <time dateTime={occ.start}>
                            {e.all_day ? 'All day' : formatTimeRange(occ.start, occ.end, e.timezone || timezone)}
                          </time>
                        </span>
                        {safe.meetingUrl && (
                          <span className="flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3" aria-hidden="true" />
                            <span className="truncate">{safe.meetingUrl}</span>
                          </span>
                        )}
                        {occ.isRecurring && !unavailable && (
                          <span className="text-purple-500">Recurring{occ.isException ? ' (modified)' : ''}</span>
                        )}
                        {unavailableLabel && (
                          <span className="text-amber-600">{unavailableLabel}</span>
                        )}
                      </div>
                      <EventInvitationBadge event={e} participationMap={participationMap} onResponse={onParticipationResponse} compact />
                    </div>
                    <ChevronRight className="w-4 h-4 text-stone-300" aria-hidden="true" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {/* Pagination sentinel (§113) */}
      {hasMoreLocal && (
        <div ref={sentinelRef} className="flex items-center justify-center py-4 border-t border-stone-100">
          <Loader2 className="w-4 h-4 text-stone-400 animate-spin" aria-hidden="true" />
          <span className="ml-2 text-xs text-stone-400">Loading more…</span>
        </div>
      )}
    </div>
  );
}