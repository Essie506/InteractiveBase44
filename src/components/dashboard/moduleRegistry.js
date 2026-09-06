// Dashboard Module Registry — V2 Dashboard §4.
// Module-based composition: Personal/Professional/Business contexts
// reuse workspace functionality via a registry. Each module is a small,
// focused component that renders a dashboard panel.
//
// A module definition: { key, label, component, contexts: string[] }
// The Dashboard renders all modules whose contexts include the active
// operating context.

import ProfileCompletenessModule from '@/components/dashboard/modules/ProfileCompletenessModule';
import UpcomingEventsModule from '@/components/dashboard/modules/UpcomingEventsModule';
import GrowthHubTeaserModule from '@/components/dashboard/modules/GrowthHubTeaserModule';
import QuickActionsModule from '@/components/dashboard/modules/QuickActionsModule';
import BusinessesModule from '@/components/dashboard/modules/BusinessesModule';

const REGISTRY = [
  {
    key: 'profile-completeness',
    label: 'Profile',
    component: ProfileCompletenessModule,
    contexts: ['personal', 'professional', 'business'],
  },
  {
    key: 'upcoming-events',
    label: 'Upcoming',
    component: UpcomingEventsModule,
    contexts: ['personal', 'professional', 'business'],
  },
  {
    key: 'growth-hub-teaser',
    label: 'Growth',
    component: GrowthHubTeaserModule,
    contexts: ['professional', 'business'],
  },
  {
    key: 'businesses',
    label: 'Businesses',
    component: BusinessesModule,
    contexts: ['personal', 'professional'],
  },
  {
    key: 'quick-actions',
    label: 'Actions',
    component: QuickActionsModule,
    contexts: ['personal', 'professional', 'business'],
  },
];

/**
 * Get the modules to render for a given operating context.
 * @param {string} context - personal | professional | business
 * @returns {Array} module definitions
 */
export function getModulesForContext(context) {
  return REGISTRY.filter((m) => m.contexts.includes(context));
}

export default REGISTRY;