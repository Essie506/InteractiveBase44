// Event price sort comparator.
// ───────────────────────────────────────────────────────────
// Only events carry a comparable public price (CalendarEvent.price_pence).
// Free is defined strictly as price_pence === 0. Unknown / null / missing
// price is NEVER interpreted as free — it sorts last in both directions.
//
// Ascending (price-asc):
//   1. known prices ascending
//   2. equal price → soonest start_time
//   3. deterministic title / event_id tie-break
//   4. unknown / unavailable price last
// Descending (price-desc):
//   1. known prices descending
//   2. equal price → soonest start_time
//   3. deterministic title / event_id tie-break
//   4. unknown / unavailable price last
//
// Non-event results passed here have no price_pence, so they are
// "unknown" and sort last — preserving the rule that price sort is
// only meaningful for events.

function priceValue(item) {
  const p = item && item.price_pence;
  return typeof p === 'number' && Number.isFinite(p) ? p : null;
}

function startTimeValue(item) {
  const t = item && item.start_time;
  if (!t) return null;
  const ms = new Date(t).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function titleKey(item) {
  return String((item && (item.title || item.event_id)) || '').toLowerCase();
}

function idKey(item) {
  return String((item && item.event_id) || '');
}

// Deterministic tie-break used after price (and among both-unknown):
// soonest start_time, then title, then event_id.
function tieBreak(a, b) {
  const ta = startTimeValue(a);
  const tb = startTimeValue(b);
  if (ta != null && tb != null) {
    if (ta !== tb) return ta - tb;
  } else if (ta != null) {
    return -1;
  } else if (tb != null) {
    return 1;
  }
  const ka = titleKey(a);
  const kb = titleKey(b);
  if (ka !== kb) return ka < kb ? -1 : 1;
  const ia = idKey(a);
  const ib = idKey(b);
  if (ia !== ib) return ia < ib ? -1 : 1;
  return 0;
}

// compareEventsByPrice(a, b, direction)
// direction: 'asc' | 'desc'. Returns negative when a should come before b.
export function compareEventsByPrice(a, b, direction = 'asc') {
  const pa = priceValue(a);
  const pb = priceValue(b);
  const aKnown = pa != null;
  const bKnown = pb != null;

  // Unknown prices always sort last in BOTH directions.
  if (!aKnown && !bKnown) return tieBreak(a, b);
  if (!aKnown) return 1;
  if (!bKnown) return -1;

  if (pa !== pb) {
    return direction === 'asc' ? pa - pb : pb - pa;
  }
  return tieBreak(a, b);
}