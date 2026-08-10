import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Loader2, Save, Check } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [profileVisibility, setProfileVisibility] = useState('public');
  const [searchVisibility, setSearchVisibility] = useState(true);
  const [allowDMs, setAllowDMs] = useState(true);
  const [showActivity, setShowActivity] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [theme, setTheme] = useState('system');
  const [language, setLanguage] = useState('en');

  useEffect(() => {
    if (!user) return;
    base44.entities.UserSetting.filter({ identity_id: user.id }).then(async (existing) => {
      if (existing.length > 0) {
        const s = existing[0];
        setSettings(s);
        setProfileVisibility(s.profile_visibility || 'public');
        setSearchVisibility(s.search_visibility ?? true);
        setAllowDMs(s.allow_direct_messages ?? true);
        setShowActivity(s.show_activity ?? false);
        setEmailNotifications(s.email_notifications ?? true);
        setPushNotifications(s.push_notifications ?? true);
        setTheme(s.theme || 'system');
        setLanguage(s.language || 'en');
      } else {
        // Create default settings
        const created = await base44.entities.UserSetting.create({
          identity_id: user.id,
          profile_visibility: 'public',
          search_visibility: true,
          allow_direct_messages: true,
          show_activity: false,
          email_notifications: true,
          push_notifications: true,
          theme: 'system',
          language: 'en',
        });
        setSettings(created);
      }
      setLoading(false);
    });
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await base44.entities.UserSetting.update(settings.id, {
        profile_visibility: profileVisibility,
        search_visibility: searchVisibility,
        allow_direct_messages: allowDMs,
        show_activity: showActivity,
        email_notifications: emailNotifications,
        push_notifications: pushNotifications,
        theme,
        language,
      });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const Toggle = ({ checked, onChange, label, desc }) => (
    <label className="flex items-center justify-between py-3 cursor-pointer border-b border-stone-100 last:border-0">
      <div>
        <div className="text-sm font-medium text-stone-700">{label}</div>
        {desc && <div className="text-xs text-stone-500 mt-0.5">{desc}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-stone-300'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </label>
  );

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1">Privacy & Settings</h1>
        <p className="text-stone-500">Control your privacy and platform preferences</p>
      </div>

      {/* Privacy */}
      <div className="bg-white rounded-xl border border-stone-200 p-6 mb-4">
        <h2 className="font-semibold text-stone-800 mb-4">Privacy</h2>
        <div className="mb-4">
          <label className="block text-sm font-medium text-stone-700 mb-1.5">Profile Visibility</label>
          <select
            value={profileVisibility}
            onChange={e => setProfileVisibility(e.target.value)}
            className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
          >
            <option value="public">Public — visible to everyone</option>
            <option value="connections">Connections — visible to your connections</option>
            <option value="private">Private — visible only to you</option>
          </select>
        </div>
        <div>
          <Toggle checked={searchVisibility} onChange={setSearchVisibility} label="Search Visibility" desc="Allow others to find you in search" />
          <Toggle checked={allowDMs} onChange={setAllowDMs} label="Direct Messages" desc="Allow others to message you directly" />
          <Toggle checked={showActivity} onChange={setShowActivity} label="Show Activity" desc="Display your recent activity on your profile" />
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-xl border border-stone-200 p-6 mb-4">
        <h2 className="font-semibold text-stone-800 mb-4">Notifications</h2>
        <div>
          <Toggle checked={emailNotifications} onChange={setEmailNotifications} label="Email Notifications" desc="Receive notifications via email" />
          <Toggle checked={pushNotifications} onChange={setPushNotifications} label="Push Notifications" desc="Receive push notifications on your device" />
        </div>
      </div>

      {/* Preferences */}
      <div className="bg-white rounded-xl border border-stone-200 p-6 mb-6">
        <h2 className="font-semibold text-stone-800 mb-4">Preferences</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Theme</label>
            <select
              value={theme}
              onChange={e => setTheme(e.target.value)}
              className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Language</label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
            >
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              <option value="pt">Português</option>
            </select>
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saving ? 'Saving...' : saved ? 'Saved' : 'Save Settings'}
      </button>
    </div>
  );
}