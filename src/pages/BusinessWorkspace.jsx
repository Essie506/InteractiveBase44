import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import {
  getBusiness, getBusinessProfile, getBusinessSubscription,
  getActiveMemberships, getInvitationsForBusiness,
  getMembership, hasPermission,
} from '@/services/businessService';
import { Users, ShieldCheck, CreditCard, Settings, FileText, ArrowLeft, Building2, Check, AlertCircle } from 'lucide-react';

export default function BusinessWorkspace() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [business, setBusiness] = useState(null);
  const [membership, setMembership] = useState(null);
  const [profile, setProfile] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [staffCount, setStaffCount] = useState(0);
  const [pendingInvites, setPendingInvites] = useState(0);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      try {
        const biz = await getBusiness(id);
        setBusiness(biz);
        const m = await getMembership(id, user.id);
        if (!m) { setAccessDenied(true); setLoading(false); return; }
        setMembership(m);
        const [profile, sub, members, invites] = await Promise.all([
          getBusinessProfile(id),
          getBusinessSubscription(id),
          getActiveMemberships(id),
          getInvitationsForBusiness(id),
        ]);
        if (profile) setProfile(profile);
        if (sub) setSubscription(sub);
        setStaffCount(members.length);
        setPendingInvites(invites.filter(i => i.status === 'sent').length);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <AlertCircle className="w-10 h-10 text-stone-400 mb-3" />
        <h2 className="text-xl font-semibold text-stone-800 mb-1">Access Denied</h2>
        <p className="text-stone-500 mb-4">You don't have access to this Business Workspace.</p>
        <Link to="/dashboard" className="text-indigo-600 font-medium">Back to Dashboard</Link>
      </div>
    );
  }

  const canManageStaff = hasPermission(membership, 'manage_staff');
  const canManageProfile = hasPermission(membership, 'manage_profile');

  const lifecycleLabels = {
    creating: 'Creating',
    pending_verification: 'Pending Verification',
    active: 'Active',
    restricted: 'Restricted',
    protected: 'Protected',
    inactive: 'Inactive',
    closing: 'Closing',
    archived: 'Archived',
    reactivating: 'Reactivating',
  };

  const verificationLabels = {
    not_verified: 'Not Verified',
    pending_review: 'Pending Review',
    additional_info_required: 'Additional Info Required',
    verified: 'Verified',
    failed: 'Failed',
    expired: 'Expired',
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Dashboard
      </Link>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Building2 className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-stone-800">{business.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-stone-100 text-stone-600 rounded text-xs font-medium capitalize">{business.type}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${business.lifecycle_state === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {lifecycleLabels[business.lifecycle_state] || business.lifecycle_state}
              </span>
            </div>
          </div>
        </div>
        <p className="text-stone-500">Business Workspace · You are {membership.role}</p>
      </div>

      {/* Onboarding status */}
      {business.onboarding_status !== 'active' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-amber-800">Onboarding Incomplete</h3>
          </div>
          <p className="text-sm text-amber-700">This business is not yet fully operational. Complete the remaining onboarding steps.</p>
        </div>
      )}

      {/* Status cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-stone-400" />
            <span className="text-xs text-stone-500 font-medium">Verification</span>
          </div>
          <div className="text-sm font-semibold text-stone-800">{verificationLabels[business.verification_state] || 'Not Verified'}</div>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-4 h-4 text-stone-400" />
            <span className="text-xs text-stone-500 font-medium">Plan</span>
          </div>
          <div className="text-sm font-semibold text-stone-800">{subscription?.plan_name || 'No plan selected'}</div>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-stone-400" />
            <span className="text-xs text-stone-500 font-medium">Staff</span>
          </div>
          <div className="text-sm font-semibold text-stone-800">{staffCount} members · {pendingInvites} pending</div>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-stone-400" />
            <span className="text-xs text-stone-500 font-medium">Profile</span>
          </div>
          <div className="text-sm font-semibold text-stone-800">{profile ? 'Created' : 'Not created'}</div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {canManageStaff && (
          <Link to={`/business/${id}/staff`} className="group bg-white rounded-xl border border-stone-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all">
            <div className="w-10 h-10 bg-indigo-50 group-hover:bg-indigo-100 rounded-xl flex items-center justify-center mb-3 transition-colors">
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
            <h3 className="font-semibold text-stone-800 mb-1">Staff & Invitations</h3>
            <p className="text-sm text-stone-500">Manage team members and invitations</p>
          </Link>
        )}
        {canManageProfile && (
          <Link to={`/business/${id}/profile`} className="group bg-white rounded-xl border border-stone-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all">
            <div className="w-10 h-10 bg-indigo-50 group-hover:bg-indigo-100 rounded-xl flex items-center justify-center mb-3 transition-colors">
              <FileText className="w-5 h-5 text-indigo-600" />
            </div>
            <h3 className="font-semibold text-stone-800 mb-1">Business Profile</h3>
            <p className="text-sm text-stone-500">Edit public business information</p>
          </Link>
        )}
        <div className="bg-white rounded-xl border border-stone-200 p-5 opacity-60">
          <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center mb-3">
            <Settings className="w-5 h-5 text-stone-400" />
          </div>
          <h3 className="font-semibold text-stone-800 mb-1">Workspace Settings</h3>
          <p className="text-sm text-stone-500">Coming in a future phase</p>
        </div>
      </div>
    </div>
  );
}