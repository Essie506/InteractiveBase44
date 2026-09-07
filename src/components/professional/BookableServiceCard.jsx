import { useState } from 'react';
import { Clock, PoundSterling, ToggleLeft, ToggleRight, Save, X, MapPin } from 'lucide-react';

const PAYMENT_ROUTES = [
  { value: 'free', label: 'Free' },
  { value: 'arrange_directly', label: 'Arrange directly' },
  { value: 'pay_through_interactive', label: 'Pay through Interactive' },
];

const LOCATION_TYPES = [
  { value: 'physical', label: 'In person' },
  { value: 'online', label: 'Online' },
  { value: 'hybrid', label: 'Hybrid' },
];

/**
 * Card for editing a single bookable service's details.
 * The service label and id are read-only (managed by the taxonomy dialog).
 * Bookable fields: description, duration, price, payment route, location, active.
 *
 * @param {{ service: any, onSave: (updated: any) => void }} props
 */
export default function BookableServiceCard({ service, onSave }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    description: service.description || '',
    duration_minutes: service.duration_minutes || 60,
    is_free: service.is_free ?? (service.price_pence == null || service.price_pence === 0),
    price_pence: service.price_pence || 0,
    payment_route: service.payment_route || 'arrange_directly',
    location_type: service.location_type || 'physical',
    is_active: service.is_active ?? false,
    booking_type: service.booking_type || 'session',
    cancellation_policy: service.cancellation_policy || { deadline_hours: 24, refund_percentage: 100 },
  });

  const handleStartEdit = () => {
    setForm({
      description: service.description || '',
      duration_minutes: service.duration_minutes || 60,
      is_free: service.is_free ?? (service.price_pence == null || service.price_pence === 0),
      price_pence: service.price_pence || 0,
      payment_route: service.payment_route || 'arrange_directly',
      location_type: service.location_type || 'physical',
      is_active: service.is_active ?? false,
      booking_type: service.booking_type || 'session',
      cancellation_policy: service.cancellation_policy || { deadline_hours: 24, refund_percentage: 100 },
    });
    setEditing(true);
  };

  const handleSave = () => {
    onSave({
      ...service,
      description: form.description.trim() || undefined,
      duration_minutes: Number(form.duration_minutes) || 60,
      is_free: form.is_free,
      price_pence: form.is_free ? 0 : Number(form.price_pence) || 0,
      payment_route: form.is_free ? 'free' : form.payment_route,
      location_type: form.location_type,
      is_active: form.is_active,
      booking_type: form.booking_type,
      cancellation_policy: form.cancellation_policy,
    });
    setEditing(false);
  };

  const inputClass = 'w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400';

  if (!editing) {
    const isBookable = service.is_active && service.duration_minutes;
    return (
      <div className={`bg-white rounded-xl border p-4 ${isBookable ? 'border-indigo-200' : 'border-stone-200'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-stone-800 text-sm">{service.label}</span>
              {isBookable && (
                <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded font-medium">Bookable</span>
              )}
            </div>
            {service.description && <p className="text-xs text-stone-500 mt-1">{service.description}</p>}
            <div className="flex items-center gap-3 mt-2 text-xs text-stone-500">
              {service.duration_minutes && (
                <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {service.duration_minutes} min</span>
              )}
              {service.is_free ? (
                <span className="inline-flex items-center gap-1"><PoundSterling className="w-3 h-3" /> Free</span>
              ) : service.price_pence ? (
                <span className="inline-flex items-center gap-1"><PoundSterling className="w-3 h-3" /> £{(service.price_pence / 100).toFixed(2)}</span>
              ) : null}
              {service.location_type && (
                <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {LOCATION_TYPES.find(l => l.value === service.location_type)?.label || service.location_type}</span>
              )}
            </div>
          </div>
          <button
            onClick={handleStartEdit}
            className="text-xs text-indigo-600 font-medium hover:text-indigo-700 shrink-0"
          >
            {isBookable ? 'Edit' : 'Make bookable'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-indigo-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-stone-800 text-sm">{service.label}</span>
        <button onClick={() => setEditing(false)} className="text-stone-400 hover:text-stone-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          placeholder="What's included in this service?"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">Duration (minutes)</label>
          <input
            type="number"
            min="15"
            max="480"
            step="15"
            value={form.duration_minutes}
            onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">Location</label>
          <select
            value={form.location_type}
            onChange={(e) => setForm({ ...form, location_type: e.target.value })}
            className={inputClass}
          >
            {LOCATION_TYPES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <button
            type="button"
            onClick={() => setForm({ ...form, is_free: !form.is_free })}
            className="text-stone-600"
          >
            {form.is_free ? <ToggleRight className="w-6 h-6 text-indigo-600" /> : <ToggleLeft className="w-6 h-6 text-stone-400" />}
          </button>
          <span className="text-xs font-medium text-stone-600">Free service</span>
        </label>
      </div>

      {!form.is_free && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Price (£)</label>
            <input
              type="number"
              min="0"
              step="0.50"
              value={(form.price_pence / 100).toFixed(2)}
              onChange={(e) => setForm({ ...form, price_pence: Math.round(Number(e.target.value) * 100) })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Payment route</label>
            <select
              value={form.payment_route}
              onChange={(e) => setForm({ ...form, payment_route: e.target.value })}
              className={inputClass}
            >
              {PAYMENT_ROUTES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        </div>
      )}

      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <button
            type="button"
            onClick={() => setForm({ ...form, is_active: !form.is_active })}
            className="text-stone-600"
          >
            {form.is_active ? <ToggleRight className="w-6 h-6 text-emerald-600" /> : <ToggleLeft className="w-6 h-6 text-stone-400" />}
          </button>
          <span className="text-xs font-medium text-stone-600">Currently bookable by visitors</span>
        </label>
      </div>

      <button
        onClick={handleSave}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
      >
        <Save className="w-3.5 h-3.5" /> Save service
      </button>
    </div>
  );
}