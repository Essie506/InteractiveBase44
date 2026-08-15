import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import {
  getBusiness, getMemberships, getInvitationsForBusiness,
  createInvitation, updateInvitation, updateMembership,
  getMembership, hasPermission, isOwner, getRolePermissions,
} from '@/services/businessService';
import { Users, Plus, X, Mail, Check, AlertCircle, ArrowLeft, Loader2, Shield } from 'lucide-react';

const AVAILABLE_PERMISSIONS = [
  { key: 'view_bookings', label: 'View Bookings' },
  { key: 'manage_bookings', label: 'Manage Bookings' },
  { key: 'manage_own_bookings', label: 'Manage Own Bookings' },
  { key: 'view_calendar', label: 'View Calendar' },
  { key: 'manage_calendar', label: 'Manage Calendar' },
  { key: 'view_financials', label: 'View Financials' },
  { key: 'manage_financials', label: 'Manage Financials' },
  { key: 'view_inbox', label: 'View Inbox' },
  { key: 'manage_inbox', label: 'Manage Inbox' },
  { key: 'manage_promotions', label: 'Manage Promotions' },
  { key: 'manage_business_profile', label: 'Manage Business Profile' },
  { key: 'invite_staff', label: 'Invite Staff' },
];

export default function BusinessStaff() {
  const { id } = useParams();
  const { user } = useAuth();
  const [business, setBusiness] = useState(null);
  const [membership, setMembership] = useState(null);
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staff');
  const [inviteMsg, setInviteMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [expandedMember, setExpandedMember] = useState(null);

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      const biz = await getBusiness(id);
      setBusiness(biz);
      const m = await getMembership(id, user.id);
      if (!m || !hasPermission(m, 'manage_staff')) { setAccessDenied(true); setLoading(false); return; }
      setMembership(m);
      await loadData();
      setLoading(false);
    })();
  }, [user, id]);

  const loadData = async () => {
    const [mbrs, invs] = await Promise.all([
      getMemberships(id),
      getInvitationsForBusiness(id),
    ]);
    setMembers(mbrs);
    setInvitations(invs);
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setSending(true);
    try {
      await createInvitation({
        business_id: id,
        business_name: business.name,
        email: inviteEmail.trim(),
        role: inviteRole,
        invited_by_id: user.id,
        invited_by_name: user.display_name || user.email,
        message: inviteMsg,
        status: 'sent',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      setInviteEmail('');
      setInviteRole('staff');
      setInviteMsg('');
      setShowInvite(false);
      await loadData();
    } finally {
      setSending(false);
    }
  };

  const cancelInvite = async (inviteId) => {
    await updateInvitation(inviteId, { status: 'cancelled' });
    await loadData();
  };

  const updateMemberRole = async (memberId, newRole) => {
    await updateMembership(memberId, { role: newRole });
    await loadData();
  };

  const togglePermission = async (member, perm) => {
    const current = member.permissions || [];
    const updated = current.includes(perm) ? current.filter(p => p !== perm) : [...current, perm];
    await updateMembership(member.id, { permissions: updated });
    await loadData();
  };

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
        <p className="text-stone-500 mb-4">You need staff management permission to access this page.</p>
        <Link to={`/business/${id}`} className="text-indigo-600 font-medium">Back to Business</Link>
      </div>
    );
  }

  const pendingInvites = invitations.filter(i => i.status === 'sent' || i.status === 'delivered');
  const inputClass = "w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400";

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <Link to={`/business/${id}`} className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> {business.name}
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-800">Staff & Invitations</h1>
          <p className="text-stone-500">Manage team members and permissions</p>
        </div>
        <button onClick={() => setShowInvite(!showInvite)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" /> Invite Staff
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="bg-white rounded-xl border border-stone-200 p-6 mb-6">
          <h3 className="font-semibold text-stone-800 mb-4">Invite a Team Member</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Email Address</label>
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="colleague@example.com" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className={inputClass}>
                <option value="staff">Staff</option>
                <option value="admin">Administrator</option>
                <option value="member">Member</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Message (optional)</label>
              <textarea value={inviteMsg} onChange={e => setInviteMsg(e.target.value)} rows={2} placeholder="Welcome to the team..." className={inputClass + " resize-none"} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowInvite(false)} className="px-4 py-2 text-stone-600 hover:bg-stone-100 rounded-lg text-sm font-medium">Cancel</button>
              <button onClick={sendInvite} disabled={!inviteEmail.trim() || sending} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Send Invitation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending invitations */}
      {pendingInvites.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold text-stone-800 mb-3">Pending Invitations ({pendingInvites.length})</h2>
          <div className="space-y-2">
            {pendingInvites.map(inv => (
              <div key={inv.id} className="bg-white rounded-xl border border-stone-200 p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-stone-800">{inv.email}</div>
                  <div className="text-xs text-stone-500">Role: {inv.role} · Invited by {inv.invited_by_name}</div>
                </div>
                <button onClick={() => cancelInvite(inv.id)} className="text-stone-400 hover:text-red-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current members */}
      <div>
        <h2 className="font-semibold text-stone-800 mb-3">Team Members ({members.length})</h2>
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          {members.map((m, i) => (
            <div key={m.id} className={i > 0 ? 'border-t border-stone-100' : ''}>
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-sm font-medium text-slate-600">
                    {m.identity_id === user.id ? (user.display_name?.[0] || 'U') : '?'}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-stone-800">
                      {m.identity_id === user.id ? `${user.display_name || user.email} (You)` : 'Team Member'}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-stone-500">
                      <Shield className="w-3 h-3" />
                      {m.role}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {m.identity_id !== user.id && !isOwner(m) && hasPermission(membership, 'manage_permissions') && (
                    <button
                      onClick={() => setExpandedMember(expandedMember === m.id ? null : m.id)}
                      className="text-xs px-2 py-1 text-indigo-600 hover:bg-indigo-50 rounded font-medium"
                    >
                      {expandedMember === m.id ? 'Hide' : 'Permissions'}
                    </button>
                  )}
                  {m.identity_id !== user.id && !isOwner(m) && (
                    <select
                      value={m.role}
                      onChange={e => updateMemberRole(m.id, e.target.value)}
                      className="text-sm px-2 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:border-indigo-400"
                    >
                      <option value="admin">Admin</option>
                      <option value="staff">Staff</option>
                      <option value="member">Member</option>
                    </select>
                  )}
                  {isOwner(m) && (
                    <span className="text-xs px-2 py-1 bg-amber-50 text-amber-700 rounded font-medium">Owner</span>
                  )}
                </div>
              </div>
              {expandedMember === m.id && !isOwner(m) && hasPermission(membership, 'manage_permissions') && (
                <div className="px-4 pb-4 pt-2 border-t border-stone-100 bg-stone-50">
                  <div className="text-xs font-medium text-stone-600 mb-2">Individual Permission Overrides</div>
                  <div className="grid grid-cols-2 gap-2">
                    {AVAILABLE_PERMISSIONS.map(perm => {
                      const active = (m.permissions || []).includes(perm.key);
                      return (
                        <label key={perm.key} className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => togglePermission(m, perm.key)}
                            className="w-4 h-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          {perm.label}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-stone-400 mt-2">Role default permissions: {getRolePermissions(m.role).join(', ')}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}