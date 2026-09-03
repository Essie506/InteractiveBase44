// Calendar Accessibility helpers (§114).
// ───────────────────────────────────────────────────────────
// Provides ARIA label builders, keyboard interaction handlers, and
// semantic helpers used across all Calendar views.
//
// §114 requires:
//   - semantic date/time information
//   - keyboard navigation
//   - screen readers
//   - visible focus
//   - text labels in addition to colour/icon indicators
//   - reduced motion
//   - clear error messaging

/**
 * Build an accessible ARIA label for a calendar event occurrence.
 * Includes title, time, source type, and lifecycle state — so screen
 * readers convey the same information sighted users get from colour +
 * icon indicators (§114: text labels in addition to colour/icon).
 */
export function buildEventAriaLabel(occ, timezone) {
  if (!occ || !occ.event) return '';
  const e = occ.event;
  const parts = [];

  parts.push(e.title || 'Untitled event');

  if (e.all_day) {
    parts.push('All day');
  } else if (occ.start) {
    const time = new Date(occ.start).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: e.timezone || timezone,
    });
    parts.push(`at ${time}`);
  }

  // Source type as text label (§114: text in addition to colour)
  if (e.source_system && e.source_system !== 'manual') {
    parts.push(`from ${e.source_system}`);
  }
  if (e.source_system === 'manual') {
    parts.push('personal event');
  }

  // Recurring indicator
  if (occ.isRecurring) {
    parts.push(occ.isException ? 'recurring, modified occurrence' : 'recurring');
  }

  // Lifecycle state as text (§114: text in addition to colour)
  if (e.lifecycle_state === 'cancelled') {
    parts.push('cancelled');
  } else if (e.lifecycle_state === 'removed') {
    parts.push('removed');
  } else if (e.lifecycle_state === 'historical') {
    parts.push('past event');
  }

  return parts.join(', ');
}

/**
 * Build an accessible date label for a <time> element.
 * Returns a human-readable date string suitable for screen readers.
 */
export function buildDateAriaLabel(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/**
 * Build an accessible time label for a <time> element's datetime attr.
 */
export function buildTimeDatetime(startIso, endIso) {
  if (!startIso) return '';
  return endIso ? `${startIso}/${endIso}` : startIso;
}

/**
 * Keyboard handler for activating a clickable element (Enter/Space).
 * Use on elements with role="button" and tabIndex={0} to make them
 * keyboard-accessible (§114: keyboard navigation).
 */
export function handleKeyboardActivate(event, onActivate) {
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
    event.preventDefault();
    event.stopPropagation();
    onActivate(event);
  }
}

/**
 * Source-type text label for display alongside colour indicators.
 * §114: text labels in addition to colour/icon indicators.
 */
export function getSourceTypeLabel(sourceSystem) {
  if (!sourceSystem || sourceSystem === 'manual') return 'Personal';
  if (sourceSystem === 'booking') return 'Booking';
  if (sourceSystem === 'workout') return 'Workout';
  if (sourceSystem === 'business_scheduling') return 'Business';
  if (sourceSystem === 'external') return 'External';
  if (sourceSystem === 'messaging') return 'Message';
  return sourceSystem.charAt(0).toUpperCase() + sourceSystem.slice(1);
}

/**
 * Lifecycle-state text label for display alongside colour indicators.
 */
export function getLifecycleStateLabel(lifecycleState) {
  if (!lifecycleState) return '';
  if (lifecycleState === 'scheduled') return '';
  if (lifecycleState === 'cancelled') return 'Cancelled';
  if (lifecycleState === 'removed') return 'Removed';
  if (lifecycleState === 'historical') return 'Past';
  if (lifecycleState === 'pending') return 'Pending';
  if (lifecycleState === 'held') return 'On hold';
  if (lifecycleState === 'upcoming') return 'Upcoming';
  if (lifecycleState === 'in_progress') return 'In progress';
  if (lifecycleState === 'superseded') return 'Rescheduled series';
  if (lifecycleState === 'completed') return 'Completed';
  if (lifecycleState === 'skipped') return 'Skipped';
  if (lifecycleState === 'rescheduled') return 'Rescheduled';
  if (lifecycleState === 'archived') return 'Archived';
  return '';
}

/**
 * Whether the user prefers reduced motion (§114: reduced motion).
 * Used to disable animations/transitions.
 */
export function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}