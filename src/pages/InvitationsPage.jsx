import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { getInvitationsForEmail, createMembership, updateInvitation } from '@/services/businessService';
import { Loader2, Mail, Check, X, Building2, ArrowRight } from 'lucide-react';

export default function InvitationsPage() {
  const { user, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);

  useEffect(() => {
    if (!user) return;
    getInvitationsForEmail(user.email).then(async (invs) => {
      const pending = invs.filter(i => i.status === 'sent' || i.status === 'delivered');
      setInvitations(pending);
      setLoading(false);
    });
  }, [user]);

  const acceptInvite = async (invite) => {
    setProcessing(invite.id);
    try {
      // Create business membership
      await createMembership({
        business_id: invite.business_id,
        identity_id: user.id,
        role: invite.role,
        invited_by_id: invite.invited_by_id,
        lifecycle_state: 'active',
      });
      // Update invitation status
      await updateInvitation(invite.id, { status: 'accepted', identity_id: user.id });
      // Refresh
      const updated = invitations.filter(i => i.id !== invite.id);
      setInvitations(updated);
      // Navigate to the business
      navigate(`/business/${invite.business_id}`);
    } finally {
      setProcessing(null);
    }
  };

  const declineInvite = async (invite) => {
    setProcessing(invite.id);
    try {
      await updateInvitation(invite.id, { status: 'declined' });
      setInvitations(invitations.filter(i => i.id !== invite.id));
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1">Invitations</h1>
        <p className="text-stone-500">Business workspace invitations awaiting your response</p>
      </div>

      {invitations.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
          <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Mail className="w-6 h-6 text-stone-400" />
          </div>
          <h3 className="font-semibold text-stone-800 mb-1">No pending invitations</h3>
          <p className="text-sm text-stone-500 mb-4">You don't have any business invitations right now.</p>
          <button onClick={() => navigate('/dashboard')} className="text-indigo-600 font-medium text-sm">Back to Dashboard</button>
        </div>
      ) : (
        <div className="space-y-3">
          {invitations.map(inv => (
            <div key={inv.id} className="bg-white rounded-xl border border-stone-200 p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-stone-800">{inv.business_name}</h3>
                  <p className="text-sm text-stone-500">Invited by {inv.invited_by_name} · Role: {inv.role}</p>
                  {inv.message && <p className="text-sm text-stone-600 mt-2 bg-stone-50 rounded-lg p-3">"{inv.message}"</p>}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => declineInvite(inv)}
                  disabled={processing === inv.id}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-stone-600 hover:bg-stone-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" /> Decline
                </button>
                <button
                  onClick={() => acceptInvite(inv)}
                  disabled={processing === inv.id}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {processing === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Accept & Join</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}