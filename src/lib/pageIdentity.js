import {
  Compass, LayoutDashboard, User, Settings, Mail, Bell, Calendar,
  Clock, MessageSquare, ShieldCheck, Building2, Briefcase, Users,
  FileText, Upload, Search
} from 'lucide-react';

// Maps the current route to the page identity (icon + label) shown on
// the right side of the shared authenticated top navbar. Exact matches
// first, then prefix / dynamic-segment matches for parameterised routes.
export function getPageIdentity(pathname) {
  const exact = {
    '/directory': { icon: Compass, label: 'Directory' },
    '/dashboard': { icon: LayoutDashboard, label: 'Dashboard' },
    '/profile': { icon: User, label: 'Profile' },
    '/settings': { icon: Settings, label: 'Settings' },
    '/invitations': { icon: Mail, label: 'Invitations' },
    '/notifications': { icon: Bell, label: 'Notifications' },
    '/calendar': { icon: Calendar, label: 'Calendar' },
    '/availability': { icon: Clock, label: 'Availability' },
    '/messages': { icon: MessageSquare, label: 'Messages' },
    '/professional-profile': { icon: Briefcase, label: 'Professional Profile' },
    '/verify-professional': { icon: ShieldCheck, label: 'Verification' },
    '/professional': { icon: Briefcase, label: 'Professional' },
    '/professional/overview': { icon: LayoutDashboard, label: 'Overview' },
    '/professional/bookings': { icon: Calendar, label: 'Bookings' },
    '/professional/services': { icon: Briefcase, label: 'Services' },
    '/professional/availability': { icon: Clock, label: 'Availability' },
    '/professional/verification': { icon: ShieldCheck, label: 'Verification' },
    '/specifications': { icon: FileText, label: 'Specifications' },
    '/upload': { icon: Upload, label: 'Upload' },
    '/search': { icon: Search, label: 'Search' },
  };
  if (exact[pathname]) return exact[pathname];

  if (pathname.startsWith('/messages/')) return { icon: MessageSquare, label: 'Messages' };
  if (pathname.startsWith('/specifications/')) return { icon: FileText, label: 'Specification' };
  if (pathname.startsWith('/book/')) return { icon: Calendar, label: 'Book' };

  if (pathname.startsWith('/business/')) {
    const parts = pathname.replace('/business/', '').split('/');
    const sub = parts[1];
    if (sub === 'staff') return { icon: Users, label: 'Staff' };
    if (sub === 'profile') return { icon: Building2, label: 'Business Profile' };
    if (sub === 'verify') return { icon: ShieldCheck, label: 'Verification' };
    if (sub === 'workspace') {
      const wsSub = parts[2];
      if (wsSub === 'overview') return { icon: LayoutDashboard, label: 'Overview' };
      if (wsSub === 'bookings') return { icon: Calendar, label: 'Bookings' };
      if (wsSub === 'services') return { icon: Briefcase, label: 'Services' };
      if (wsSub === 'availability') return { icon: Clock, label: 'Availability' };
      if (wsSub === 'verification') return { icon: ShieldCheck, label: 'Verification' };
      if (wsSub === 'staff') return { icon: Users, label: 'Staff' };
      return { icon: Building2, label: 'Business' };
    }
    return { icon: Building2, label: 'Business' };
  }

  return { icon: LayoutDashboard, label: 'Dashboard' };
}