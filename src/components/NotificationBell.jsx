import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, CheckCheck, Loader2 } from 'lucide-react';
import { getUnreadCount, getNotifications, markAsRead, markAllAsRead } from '@/lib/notifications';
import { useAuth } from '@/lib/AuthContext';

// Lightweight notification bell + modal.
// References the same Notification Records as the full Notification Centre.
export default function NotificationBell() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadUnread = () => {
    if (!user) return;
    getUnreadCount(user.id).then(setUnread);
  };

  useEffect(() => {
    loadUnread();
    const interval = setInterval(loadUnread, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const loadItems = () => {
    if (!user) return;
    setLoading(true);
    getNotifications(user.id, 10).then(async recs => {
      setItems(recs);
      setLoading(false);
      // Mark presented notifications as read so the badge clears immediately
      const hasUnread = recs.some(r => !r.is_read);
      if (hasUnread) {
        try {
          await markAllAsRead(user.id);
          setItems(recs.map(r => ({ ...r, is_read: true })));
        } catch (err) {
          console.error('[NotificationBell] markAllAsRead failed:', err);
        }
        loadUnread();
      }
    });
  };

  const handleOpen = () => {
    if (!open) loadItems();
    setOpen(!open);
  };

  const handleMarkRead = async (id) => {
    await markAsRead(id);
    setItems(items.map(i => i.id === id ? { ...i, is_read: true } : i));
    loadUnread();
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    await markAllAsRead(user.id);
    setItems(items.map(i => ({ ...i, is_read: true })));
    setUnread(0);
  };

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative w-9 h-9 rounded-lg hover:bg-slate-800 flex items-center justify-center transition-colors"
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
      >
        <Bell className="w-4 h-4 text-slate-400" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-indigo-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 right-0 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-20 w-80 max-w-[calc(100vw-1rem)] bg-white rounded-xl border border-stone-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
              <h3 className="font-semibold text-stone-800 text-sm">Notifications</h3>
              {unread > 0 && (
                <button onClick={handleMarkAllRead} className="text-xs text-indigo-600 font-medium hover:text-indigo-700 inline-flex items-center gap-1">
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 text-stone-400 animate-spin" /></div>
              ) : items.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-stone-500">No notifications yet</div>
              ) : (
                items.map(n => (
                  <div key={n.id} className={`px-4 py-3 border-b border-stone-50 last:border-0 ${!n.is_read ? 'bg-indigo-50/30' : ''}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-stone-800">{n.title}</div>
                        {n.body && <div className="text-xs text-stone-500 mt-0.5 line-clamp-2">{n.body}</div>}
                        <div className="flex items-center gap-2 mt-1.5">
                          {n.action_url && (
                            <Link to={n.action_url} onClick={() => { setOpen(false); if (!n.is_read) handleMarkRead(n.id); }} className="text-xs text-indigo-600 font-medium hover:underline">
                              {n.action_label || 'View'}
                            </Link>
                          )}
                          {!n.is_read && (
                            <button onClick={() => handleMarkRead(n.id)} className="text-xs text-stone-500 hover:text-stone-700 inline-flex items-center gap-0.5">
                              <Check className="w-3 h-3" /> Mark read
                            </button>
                          )}
                        </div>
                      </div>
                      {!n.is_read && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-1.5" />}
                    </div>
                  </div>
                ))
              )}
            </div>
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-center text-sm text-indigo-600 font-medium hover:bg-stone-50 border-t border-stone-100"
            >
              View all notifications
            </Link>
          </div>
        </>
      )}
    </div>
  );
}