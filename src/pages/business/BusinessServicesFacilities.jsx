import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getBusinessProfile, saveBusinessProfile } from '@/services/businessService';
import { STANDARD_SERVICES } from '@/data/standardServices';
import { STANDARD_FACILITIES } from '@/data/standardFacilities';
import TaxonomySelectDialog from '@/components/profile/TaxonomySelectDialog';
import { Briefcase, Loader2, Plus, Building } from 'lucide-react';

export default function BusinessServicesFacilities() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showServices, setShowServices] = useState(false);
  const [showFacilities, setShowFacilities] = useState(false);

  const loadProfile = async () => {
    if (!id) return;
    const p = await getBusinessProfile(id);
    setProfile(p);
    setLoading(false);
  };

  useEffect(() => {
    loadProfile();
  }, [id]);

  const handleSaveServices = async (services) => {
    setSaving(true);
    try {
      await saveBusinessProfile(id, { services });
      await loadProfile();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFacilities = async (facilities) => {
    setSaving(true);
    try {
      await saveBusinessProfile(id, { facilities });
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
  const facilities = profile?.facilities || [];

  const TagList = ({ items }) => (
    <div className="flex flex-wrap gap-2">
      {items.length === 0 ? (
        <span className="text-sm text-stone-400">None added yet.</span>
      ) : (
        items.map((s, i) => (
          <span
            key={(s.id || s.label) + i}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm"
          >
            {s.label}
            {!s.id && <span className="text-xs text-indigo-400">(custom)</span>}
          </span>
        ))
      )}
    </div>
  );

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-800 mb-1">Services & Facilities</h1>
        <p className="text-stone-500 text-sm">What this business offers and its facilities.</p>
      </div>

      {/* Services */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-stone-800 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-indigo-600" /> Services
          </h2>
          <button
            onClick={() => setShowServices(true)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-50 transition-colors"
          >
            <Plus className="w-4 h-4" /> Edit
          </button>
        </div>
        <TagList items={services} />
      </div>

      {/* Facilities */}
      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-stone-800 flex items-center gap-2">
            <Building className="w-4 h-4 text-indigo-600" /> Facilities
          </h2>
          <button
            onClick={() => setShowFacilities(true)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-50 transition-colors"
          >
            <Plus className="w-4 h-4" /> Edit
          </button>
        </div>
        <TagList items={facilities} />
      </div>

      <TaxonomySelectDialog
        open={showServices}
        onClose={() => setShowServices(false)}
        onSave={handleSaveServices}
        title="Edit Services"
        items={services}
        standardOptions={STANDARD_SERVICES}
        placeholder="Add a service..."
      />

      <TaxonomySelectDialog
        open={showFacilities}
        onClose={() => setShowFacilities(false)}
        onSave={handleSaveFacilities}
        title="Edit Facilities"
        items={facilities}
        standardOptions={STANDARD_FACILITIES}
        placeholder="Add a facility..."
      />
    </div>
  );
}