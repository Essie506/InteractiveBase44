import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getAvailabilityRules, createAvailabilityRule, deleteAvailabilityRule, getLocalTimezone } from '@/lib/calendar';
import { Clock, Plus, Trash2, Loader2 } from 'lucide-react';

const DAYS = [
  { num: 1, label: 'Monday' },
  { num: 2, label: 'Tuesday' },
  { num: 3, label: 'Wednesday' },
  { num: 4, label: 'Thursday' },
  { num: 5, label: 'Friday' },
  { num: 6, label: 'Saturday' },
  { num: 0, label: 'Sunday' },
];

export default function BusinessAvailability() {
  const { id } = useParams();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRule, setNewRule] = useState({ day: 1, start: '09:00', end: '17:00' });

  const timezone = getLocalTimezone();

  const loadRules = async () => {
    if (!id) return;
    setLoading(true);
    const r = await getAvailabilityRules(id, 'business');
    setRules(r);
    setLoading(false);
  };

  useEffect(() => {
    loadRules();
  }, [id]);

  const handleAdd = async () => {
    setSaving(true);
    try {
      await createAvailabilityRule({
        owner_id: id,
        owner_type: 'business',
        rule_type: 'working_hours',
        day_of_week: newRule.day,
        start_time: newRule.start,
        end_time: newRule.end,
        timezone,
        business_id: id,
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
        <h1 className="text-2xl font-bold text-stone-800 mb-1">Business Availability</h1>
        <p className="text-stone-500 text-sm">Configure operating hours for this business.</p>
      </div>

      {/* Add new rule */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 mb-6">
        <h2 className="font-semibold text-stone-800 mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-indigo-600" /> Add Working Hours
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Day</label>
            <select
              value={newRule.day}
              onChange={(e) => setNewRule({ ...newRule, day: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
            >
              {DAYS.map((d) => <option key={d.num} value={d.num}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Start</label>
            <input
              type="time"
              value={newRule.start}
              onChange={(e) => setNewRule({ ...newRule, start: e.target.value })}
              className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">End</label>
            <input
              type="time"
              value={newRule.end}
              onChange={(e) => setNewRule({ ...newRule, end: e.target.value })}
              className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Add</>}
            </button>
          </div>
        </div>
      </div>

      {/* Weekly schedule */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {DAYS.map((day) => {
            const dayRules = rulesByDay(day.num);
            return (
              <div key={day.num} className="bg-white rounded-xl border border-stone-200 p-4 flex items-start gap-4">
                <div className="w-28 shrink-0 pt-1">
                  <div className="font-medium text-stone-800 text-sm">{day.label}</div>
                </div>
                <div className="flex-1">
                  {dayRules.length === 0 ? (
                    <div className="text-sm text-stone-400 py-1">No working hours set</div>
                  ) : (
                    <div className="space-y-2">
                      {dayRules.map((rule) => (
                        <div key={rule.id} className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                          <Clock className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-sm text-stone-700 font-medium">{rule.start_time} – {rule.end_time}</span>
                          <span className="text-xs text-stone-400">{rule.timezone || timezone}</span>
                          <button onClick={() => handleDelete(rule.id)} className="ml-auto text-stone-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}