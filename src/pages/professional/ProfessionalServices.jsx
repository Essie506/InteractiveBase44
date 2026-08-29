import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getProfessionalProfile, saveProfessionalProfile } from '@/services/profileService';
import { STANDARD_SERVICES } from '@/data/standardServices';
import TaxonomySelectDialog from '@/components/profile/TaxonomySelectDialog';
import { Briefcase, Loader2, Plus } from 'lucide-react';

export default function ProfessionalServices() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  const loadProfile = async () => {
    if (!user) return;
    const p = await getProfessionalProfile(user.id);
    setProfile(p);
    setLoading(false);
  };

  useEffect(() => {
    loadProfile();
  }, [user]);

  const handleSave = async (services) => {
    setSaving(true);
    try {
      await saveProfessionalProfile(user.id, { services });
      await loadProfile();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-stone-300 animate-spin" />
      </div>
    );
  }

  const services = profile?.services || [];

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 mb-1">Services</h1>
          <p className="text-stone-500 text-sm">The services and specialisms you offer.</p>
        </div>
        <button
          onClick={() => setShowDialog(true)}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Plus className="w-4 h-4" /> Edit Services
        </button>
      </div>

      {services.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
          <Briefcase className="w-8 h-8 text-stone-300 mx-auto mb-2" />
          <p className="text-sm text-stone-500 mb-3">No services added yet.</p>
          <button
            onClick={() => setShowDialog(true)}
            className="text-sm text-indigo-600 font-medium hover:text-indigo-700"
          >
            Add your first service
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <div className="flex flex-wrap gap-2">
            {services.map((s, i) => (
              <span
                key={(s.id || s.label) + i}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm"
              >
                {s.label}
                {!s.id && <span className="text-xs text-indigo-400">(custom)</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      <TaxonomySelectDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onSave={handleSave}
        title="Edit Services"
        items={services}
        standardOptions={STANDARD_SERVICES}
        placeholder="Add a service..."
      />
    </div>
  );
}