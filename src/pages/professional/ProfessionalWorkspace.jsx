import WorkspaceShell from '@/components/workspace/WorkspaceShell';
import {
  BarChart3, TrendingUp, CalendarCheck, DollarSign, CreditCard,
  Briefcase, Clock, Megaphone, Receipt, Layers, Settings, ShieldCheck,
} from 'lucide-react';

const navItems = [
  { path: 'overview', label: 'Overview / analytics', icon: BarChart3 },
  { path: 'profile-performance', label: 'Profile performance', icon: TrendingUp, deferred: true },
  { path: 'bookings', label: 'Bookings performance', icon: CalendarCheck },
  { path: 'revenue', label: 'Revenue / earnings', icon: DollarSign, deferred: true },
  { path: 'payments', label: 'Payments / payouts', icon: CreditCard, deferred: true },
  { path: 'services', label: 'Services', icon: Briefcase },
  { path: 'availability', label: 'Availability', icon: Clock },
  { path: 'promotions', label: 'Promotions', icon: Megaphone, deferred: true },
  { path: 'receipts', label: 'Receipts', icon: Receipt, deferred: true },
  { path: 'plan', label: 'Plan', icon: Layers, deferred: true },
  { path: 'settings', label: 'Professional settings', icon: Settings, deferred: true },
  { path: 'verification', label: 'Verification', icon: ShieldCheck },
];

export default function ProfessionalWorkspace() {
  return (
    <WorkspaceShell
      title="Professional Workspace"
      navItems={navItems}
      basePath="/professional"
    />
  );
}