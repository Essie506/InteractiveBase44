import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import WorkspaceShell from '@/components/workspace/WorkspaceShell';
import { getBusiness, getMembership } from '@/services/businessService';
import { useAuth } from '@/lib/AuthContext';
import {
  BarChart3, TrendingUp, CalendarCheck, DollarSign, CreditCard,
  Briefcase, Clock, Megaphone, Receipt, Layers, Settings, ShieldCheck,
  Users, Mail, Calendar, Inbox, Loader2, AlertCircle,
} from 'lucide-react';

const navItems = [
  { path: 'overview', label: 'Overview / analytics', icon: BarChart3 },
  { path: 'profile-performance', label: 'Profile performance', icon: TrendingUp, deferred: true },
  { path: 'bookings', label: 'Business bookings', icon: CalendarCheck },
  { path: 'sales', label: 'Sales & cash flow', icon: DollarSign, deferred: true },
  { path: 'payments', label: 'Payments / payouts', icon: CreditCard, deferred: true },
  { path: 'services', label: 'Services & facilities', icon: Briefcase },
  { path: 'availability', label: 'Business availability', icon: Clock },
  { path: 'promotions', label: 'Promotions', icon: Megaphone, deferred: true },
  { path: 'receipts', label: 'Receipts', icon: Receipt, deferred: true },
  { path: 'plan', label: 'Business plan', icon: Layers, deferred: true },
  { path: 'settings', label: 'Business settings', icon: Settings, deferred: true },
  { path: 'verification', label: 'Verification', icon: ShieldCheck },
  { path: 'staff', label: 'Staff & permissions', icon: Users },
  { path: 'staff-invitations', label: 'Staff invitations', icon: Mail, deferred: true },
  { path: 'calendars', label: 'Combined calendars', icon: Calendar, deferred: true },
  { path: 'inbox', label: 'Business inbox controls', icon: Inbox, deferred: true },
];

export default function BusinessWorkspaceShell() {
  const { id } = useParams();
  const { user } = useAuth();
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      try {
        const biz = await getBusiness(id);
        setBusiness(biz);
        const m = await getMembership(id, user.id);
        if (!m) {
          setAccessDenied(true);
        }
      } catch {
        setAccessDenied(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-stone-300 animate-spin" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <AlertCircle className="w-10 h-10 text-stone-400 mb-3" />
        <h2 className="text-xl font-semibold text-stone-800 mb-1">Access Denied</h2>
        <p className="text-stone-500">You are not a member of this business.</p>
      </div>
    );
  }

  return (
    <WorkspaceShell
      title={business?.name || 'Business Workspace'}
      navItems={navItems}
      basePath={`/business/${id}/workspace`}
    />
  );
}