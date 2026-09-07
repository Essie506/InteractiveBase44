import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getProfessionalProfile, saveProfessionalProfile } from '@/services/profileService';
import { STANDARD_SERVICES } from '@/data/standardServices';
import TaxonomySelectDialog from '@/components/profile/TaxonomySelectDialog';
import BookableServiceCard from '@/components/professional/BookableServiceCard';
import { Briefcase, Loader2, Plus, CalendarCheck } from 'lucide-react';

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

  // Save taxonomy tags — preserve bookable fields for services that still exist
  const handleSaveTags = async (newServices) => {
    setSaving(true);
    try {
      const existingMap = new Map((profile?.services || []).map(s => [s.id || s.label, s]));
      const merged = newServices.map(s => {
        const existing = existingMap.get(s.id || s.label);
        return existing ? { ...existing, ...s } : s;
      });
      await saveProfessionalProfile(user.id, { services: merged });
      await loadProfile();
    } finally {
      setSaving(false);
    }
  };

  // Save a single bookable service's details
  const handleSaveBookable = async (updatedService) => {
    setSaving(true);
    try {
      const services = (profile?.services || []).map(s =>
        (s.id || s.label) === (updatedService.id || updatedService.label) ? updatedService : s
      );
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
  const bookableServices = services.filter(s => s.is_active && s.duration_minutes);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 mb-1">Services</h1>
          <p className="text-stone-500 text-sm">The services you offer and their booking configuration.</p>
        </div>
        <button
          onClick={() => setShowDialog(true)}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Plus className="w-4 h-4" /> Edit Services
        </button>
      </div>

      {/* Service tags */}
      {services.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center mb-6">
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
        <div className="bg-white rounded-xl border border-stone-200 p-5 mb-6">
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

      {/* Bookable services configuration */}
      {services.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-stone-800 mb-1 flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-indigo-600" />
            Bookable Services
          </h2>
          <p className="text-sm text-stone-500 mb-4">
            Configure which services visitors can book, including duration, price, and availability.
          </p>
          <div className="space-y-3">
            {services.map((s, i) => (
              <BookableServiceCard
                key={(s.id || s.label) + i}
                service={s}
                onSave={handleSaveBookable}
              />
            ))}
          </div>
          {bookableServices.length === 0 && (
            <p className="text-sm text-stone-400 mt-3">
              No services are currently bookable. Use "Make bookable" above to enable booking for a service.
            </p>
          )}
        </div>
      )}

      <TaxonomySelectDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onSave={handleSaveTags}
        title="Edit Services"
        items={services}
        standardOptions={STANDARD_SERVICES}
        placeholder="Add a service..."
      />
    </div>
  );
}