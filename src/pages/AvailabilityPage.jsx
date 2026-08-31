import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getAvailabilityRules, createAvailabilityRule, deleteAvailabilityRule, getLocalTimezone } from '@/lib/calendar';
import { getProfessionalProfile, updateProfessionalProfile } from '@/services/profileService';
import { Clock, Plus, Trash2, Loader2, MessageSquare, Check } from 'lucide-react';

const DAYS = [
{ num: 1, label: 'Monday' },
{ num: 2, label: 'Tuesday' },
{ num: 3, label: 'Wednesday' },
{ num: 4, label: 'Thursday' },
{ num: 5, label: 'Friday' },
{ num: 6, label: 'Saturday' },
{ num: 0, label: 'Sunday' }];


export default function AvailabilityPage() {
  const { user } = useAuth();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRule, setNewRule] = useState({ day: 1, start: '09:00', end: '17:00', type: 'working_hours' });
  const [awayEnabled, setAwayEnabled] = useState(false);
  const [awayMessage, setAwayMessage] = useState('');
  const [awaySaving, setAwaySaving] = useState(false);
  const [awaySaved, setAwaySaved] = useState(false);

  const timezone = getLocalTimezone();

  const loadRules = async () => {
    if (!user) return;
    setLoading(true);
    const r = await getAvailabilityRules(user.id, 'professional');
    setRules(r);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    loadRules();
    getProfessionalProfile(user.id).then((p) => {
      if (p) {
        setAwayEnabled(p.away_message_enabled || false);
        setAwayMessage(p.away_message || '');
      }
    });
  }, [user]);

  const handleSaveAway = async () => {
    setAwaySaving(true);
    setAwaySaved(false);
    try {
      const profile = await getProfessionalProfile(user.id);
      if (profile) {
        await updateProfessionalProfile(profile.id, {
          away_message_enabled: awayEnabled,
          away_message: awayMessage
        });
      }
      setAwaySaved(true);
      setTimeout(() => setAwaySaved(false), 3000);
    } finally {
      setAwaySaving(false);
    }
  };

  const handleAdd = async () => {
    setSaving(true);
    try {
      await createAvailabilityRule({
        owner_id: user.id,
        owner_type: 'professional',
        rule_type: newRule.type,
        day_of_week: newRule.day,
        start_time: newRule.start,
        end_time: newRule.end,
        timezone
      });
      await loadRules();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ruleId) => {
    await deleteAvailabilityRule(ruleId);
    loadRules();
  };

  const rulesByDay = (dayNum) => rules.filter((r) => r.day_of_week === dayNum && r.rule_type === 'working_hours');

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <div className="mb-6">
        
        <p className="text-stone-500">Configure your professional working hours. This is the authoritative availability state that future Booking will consume.</p>
      </div>

      {/* Add new rule */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 mb-6">
        <h2 className="font-semibold text-stone-800 mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-indigo-600" /> Add Working Hours
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Day</label>
            <select value={newRule.day} onChange={(e) => setNewRule({ ...newRule, day: Number(e.target.value) })} className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400">
              {DAYS.map((d) => <option key={d.num} value={d.num}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Start</label>
            <input type="time" value={newRule.start} onChange={(e) => setNewRule({ ...newRule, start: e.target.value })} className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">End</label>
            <input type="time" value={newRule.end} onChange={(e) => setNewRule({ end: e.target.value })} className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div className="flex items-end">
            <button onClick={handleAdd} disabled={saving} className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Add</>}
            </button>
          </div>
        </div>
      </div>

      {/* Weekly schedule */}
      {loading ?
      <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-stone-200 border-t-indigo-600 rounded-full animate-spin" /></div> :

      <div className="space-y-3">
          {DAYS.map((day) => {
          const dayRules = rulesByDay(day.num);
          return (
            <div key={day.num} className="bg-white rounded-xl border border-stone-200 p-4 flex items-start gap-4">
                <div className="w-28 shrink-0 pt-1">
                  <div className="font-medium text-stone-800 text-sm">{day.label}</div>
                </div>
                <div className="flex-1">
                  {dayRules.length === 0 ?
                <div className="text-sm text-stone-400 py-1">No working hours set</div> :

                <div className="space-y-2">
                      {dayRules.map((rule) =>
                  <div key={rule.id} className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                          <Clock className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-sm text-stone-700 font-medium">{rule.start_time} – {rule.end_time}</span>
                          <span className="text-xs text-stone-400">{rule.timezone || timezone}</span>
                          <button onClick={() => handleDelete(rule.id)} className="ml-auto text-stone-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                  )}
                    </div>
                }
                </div>
              </div>);

        })}
        </div>
      }

      {/* Away Message */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 mb-6 mt-6">
        <h2 className="font-semibold text-stone-800 mb-2 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-600" /> Away Message
        </h2>
        <p className="text-sm text-stone-500 mb-4">Automatically send a response when you're unavailable. Scoped to your professional context — does not impersonate another operating context.</p>
        <label className="flex items-center justify-between py-3 cursor-pointer border-b border-stone-100 mb-4">
          <div>
            <div className="text-sm font-medium text-stone-700">Enable Away Message</div>
            <div className="text-xs text-stone-500 mt-0.5">Auto-respond to messages when unavailable</div>
          </div>
          <button type="button" onClick={() => setAwayEnabled(!awayEnabled)} className={`relative w-11 h-6 rounded-full transition-colors ${awayEnabled ? 'bg-indigo-600' : 'bg-stone-300'}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${awayEnabled ? 'translate-x-5' : ''}`} />
          </button>
        </label>
        {awayEnabled &&
        <div>
            <textarea value={awayMessage} onChange={(e) => setAwayMessage(e.target.value)} rows={3} placeholder="e.g. I'm currently unavailable. I'll respond within 24 hours." className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none" />
          </div>
        }
        <button onClick={handleSaveAway} disabled={awaySaving} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {awaySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : awaySaved ? <Check className="w-4 h-4" /> : null}
          {awaySaving ? 'Saving...' : awaySaved ? 'Saved' : 'Save Away Message'}
        </button>
      </div>

      <div className="mt-6 bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <p className="text-sm text-indigo-700">
          <strong>Availability is authoritative.</strong> Calendar owns this scheduling state. When Booking is implemented, it will consume these availability rules — no separate availability model will be created.
        </p>
      </div>
    </div>);

}