// Date-range helpers for the Directory Events "Date" filter.
// ───────────────────────────────────────────────────────────
// All ranges are computed in the user's local timezone (Europe/London
// for the current market). Each returns { start, end } as Date objects
// representing the inclusive bounds of the range.
//
// "This Week" = Monday → Sunday of the current week.
// "This Weekend" = Saturday → Sunday of the current week.

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// Monday of the week containing `d`
function startOfWeek(d) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun … 6=Sat
  const diff = (day === 0 ? 6 : day - 1); // back to Monday
  x.setDate(x.getDate() - diff);
  return x;
}

export function getTodayRange(now = new Date()) {
  return { start: startOfDay(now), end: endOfDay(now) };
}

export function getTomorrowRange(now = new Date()) {
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  return { start: startOfDay(t), end: endOfDay(t) };
}

export function getThisWeekRange(now = new Date()) {
  const start = startOfWeek(now);
  const end = endOfDay(new Date(start));
  end.setDate(end.getDate() + 6);
  return { start, end };
}

export function getThisWeekendRange(now = new Date()) {
  const weekStart = startOfWeek(now);
  // Saturday = weekStart + 5
  const sat = new Date(weekStart);
  sat.setDate(sat.getDate() + 5);
  const sun = endOfDay(new Date(sat));
  sun.setDate(sun.getDate() + 1);
  return { start: startOfDay(sat), end: sun };
}

export function getCustomRange(fromStr, toStr) {
  if (!fromStr) return null;
  const start = startOfDay(new Date(fromStr));
  const end = toStr ? endOfDay(new Date(toStr)) : endOfDay(new Date(fromStr));
  return { start, end };
}

/**
 * Resolve a date filter token to a { start, end } Date range.
 * Returns null for 'custom' without from/to, and for unknown tokens.
 */
export function resolveDateRange(dateFilter, fromStr, toStr, now = new Date()) {
  switch (dateFilter) {
    case 'today': return getTodayRange(now);
    case 'tomorrow': return getTomorrowRange(now);
    case 'week': return getThisWeekRange(now);
    case 'weekend': return getThisWeekendRange(now);
    case 'custom': return getCustomRange(fromStr, toStr);
    default: return null;
  }
}

/**
 * Check whether an event's start_time falls within the given range.
 */
export function isEventInRange(startIso, range) {
  if (!startIso || !range) return false;
  const t = new Date(startIso).getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}