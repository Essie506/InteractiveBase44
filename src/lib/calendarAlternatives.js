// Conflict alternatives (§38).
// ───────────────────────────────────────────────────────────
// When the server-side §39 conflict check rejects a manual Professional/
// Business event save (failed-precondition "Time slot conflicts"), the UI
// should offer alternative nearby slots the user can pick instead. This
// helper computes candidate slots that do not overlap the caller's
// already-loaded events for the same owner.
//
// This is a PRESENTATION helper — it suggests alternatives; the
// authoritative conflict check remains server-side in saveCalendarEvent.
// It only considers events already loaded on the client (the visible
// range), so it is a best-effort suggestion, not a guarantee. The server
// re-validates on save.

const MINUTES = 60 * 1000;

function overlaps(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() &&
    new Date(bStart).getTime() < new Date(aEnd).getTime();
}

/**
 * Given a desired date + duration + the owner's existing events, suggest
 * up to `maxSlots` non-conflicting alternative start times on the same day,
 * stepping in `stepMinutes` increments around the requested time.
 *
 * @param {object} opts
 * @param {string} opts.date — YYYY-MM-DD
 * @param {string} opts.startTime — HH:MM
 * @param {number} opts.durationMinutes
 * @param {Array}  opts.events — existing events for the owner (any lifecycle)
 * @param {number} [opts.stepMinutes=30]
 * @param {number} [opts.maxSlots=4]
 * @returns {Array<{ start: string, end: string }>} HH:MM start/end pairs
 */
export function suggestAlternativeSlots({
  date, startTime, durationMinutes, events, stepMinutes = 30, maxSlots = 4,
}) {
  if (!date || !startTime || !durationMinutes) return [];
  const baseStart = new Date(`${date}T${startTime}`);
  const dayStart = new Date(`${date}T06:00`);
  const dayEnd = new Date(`${date}T${date.includes('-') ? '23:00' : '23:00'}`);
  const endOfEvening = new Date(`${date}T22:00`);

  const busy = (events || [])
    .filter((e) => e && e.start_time && e.end_time && e.lifecycle_state !== 'cancelled' && e.lifecycle_state !== 'removed')
    .map((e) => ({ s: new Date(e.start_time).getTime(), e: new Date(e.end_time).getTime() }));

  const candidates = [];
  // Search outward from the requested time in both directions.
  const baseMs = baseStart.getTime();
  for (let offset = stepMinutes; candidates.length < maxSlots && offset <= 8 * 60; offset += stepMinutes) {
    for (const dir of [1, -1]) {
      if (candidates.length >= maxSlots) break;
      const candStart = new Date(baseMs + dir * offset * MINUTES);
      if (candStart.getTime() < dayStart.getTime() || candStart.getTime() > endOfEvening.getTime()) continue;
      const candEnd = new Date(candStart.getTime() + durationMinutes * MINUTES);
      if (candEnd.getTime() > dayEnd.getTime()) continue;
      const conflict = busy.some((b) => overlaps(candStart, candEnd, new Date(b.s), new Date(b.e)));
      if (!conflict) {
        const hh = String(candStart.getHours()).padStart(2, '0');
        const mm = String(candStart.getMinutes()).padStart(2, '0');
        const eh = String(candEnd.getHours()).padStart(2, '0');
        const em = String(candEnd.getMinutes()).padStart(2, '0');
        // Avoid duplicates (same slot from both directions)
        const key = `${hh}:${mm}`;
        if (!candidates.find((c) => c.start === `${hh}:${mm}`)) {
          candidates.push({ start: `${hh}:${mm}`, end: `${eh}:${em}` });
        }
      }
    }
  }
  return candidates;
}