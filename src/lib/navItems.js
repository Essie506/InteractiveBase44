// Shared context-aware navigation configuration.
// ───────────────────────────────────────────────────────────
// Single source of truth for the authenticated sidebar/drawer nav items.
// Consumed by AppLayout (desktop sidebar + mobile drawer) and by
// AuthenticatedSidebarContent (used by the Directory nav drawer), so the
// authenticated menu can never drift between surfaces.

import {
  LayoutDashboard, User as UserIcon, Settings, FileText, Search,
  Briefcase, Building2, Users, Calendar, MessageSquare,
  Clock, ShieldCheck, Compass,
} from 'lucide-react';

export function getContextNavItems(user) {
  const activeContext = user?.active_context || 'personal';
  const activeBusinessId = user?.active_business_id;
  const isProfessionalActive = user?.professional_activated || user?.professional_onboarding_status === 'active';

  let navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/calendar', label: 'Calendar', icon: Calendar },
    { path: '/messages', label: 'Messages', icon: MessageSquare },
    { path: '/profile', label: 'Profile', icon: UserIcon },
    { path: '/settings', label: 'Settings', icon: Settings },
    { path: '/specifications', label: 'Specs', icon: FileText },
    { path: '/search', label: 'AI Search', icon: Search },
    { path: '/directory', label: 'Directory', icon: Compass },
  ];

  if (activeContext === 'professional' && isProfessionalActive) {
    navItems = [
      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/professional', label: 'Workspace', icon: Building2 },
      { path: '/messages', label: 'Messages', icon: MessageSquare },
      { path: '/calendar', label: 'Calendar', icon: Calendar },
      { path: '/availability', label: 'Availability', icon: Clock },
      { path: '/professional-profile', label: 'Pro Profile', icon: Briefcase },
      { path: '/verify-professional', label: 'Verification', icon: ShieldCheck },
      { path: '/settings', label: 'Settings', icon: Settings },
      { path: '/specifications', label: 'Specs', icon: FileText },
      { path: '/search', label: 'AI Search', icon: Search },
      { path: '/directory', label: 'Directory', icon: Compass },
    ];
  }

  if (activeContext === 'business' && activeBusinessId) {
    navItems = [
      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { path: `/business/${activeBusinessId}/workspace`, label: 'Workspace', icon: Building2 },
      { path: '/messages', label: 'Messages', icon: MessageSquare },
      { path: '/calendar', label: 'Calendar', icon: Calendar },
      { path: `/business/${activeBusinessId}/staff`, label: 'Staff', icon: Users },
      { path: `/business/${activeBusinessId}/profile`, label: 'Biz Profile', icon: FileText },
      { path: `/business/${activeBusinessId}/verify`, label: 'Verification', icon: ShieldCheck },
      { path: '/settings', label: 'Settings', icon: Settings },
      { path: '/specifications', label: 'Specs', icon: FileText },
      { path: '/search', label: 'AI Search', icon: Search },
      { path: '/directory', label: 'Directory', icon: Compass },
    ];
  }

  return navItems;
}