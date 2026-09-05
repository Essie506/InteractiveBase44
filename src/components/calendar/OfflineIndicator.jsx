import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

// OfflineIndicator (§112). Shows a banner when the browser is offline.
// Pure presentation — the calendar poll cycle + last-loaded state keep
// the most recent events visible while disconnected, so the user sees
// cached data rather than an empty grid. Mutations are server-authoritative
// and will sync once connectivity returns.
export default function OfflineIndicator() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (online) return null;
  return (
    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2" role="alert">
      <WifiOff className="w-4 h-4 text-amber-600 flex-shrink-0" aria-hidden="true" />
      <p className="text-sm text-amber-700">You're offline. Showing cached calendar data — changes will sync when you reconnect.</p>
    </div>
  );
}