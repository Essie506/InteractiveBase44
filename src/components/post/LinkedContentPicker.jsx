// LinkedContentPicker — V2 Post System §8 linked content references.
// Lets the author attach a structured reference to connected-system
// content (Workout, CalendarEvent, Promotion) for type-specific posts.
// References are stable IDs — never embedded copies.
import { useState, useEffect } from 'react';
import { db } from '@/firebase/firebaseClient';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { useFirebase } from '@/lib/backendConfig';
import { Loader2, X, Dumbbell, Calendar, Megaphone } from 'lucide-react';

const SYSTEM_ICONS = {
  workout: Dumbbell,
  calendar_event: Calendar,
  promotion: Megaphone,
};

const SYSTEM_LABELS = {
  workout: 'Workout',
  calendar_event: 'Event',
  promotion: 'Promotion',
};

const SYSTEM_COLLECTIONS = {
  workout: 'workouts',
  calendar_event: 'calendarEventsPublic',
  promotion: 'campaigns',
};

export default function LinkedContentPicker({ system, value, onChange }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  const Icon = SYSTEM_ICONS[system] || Dumbbell;

  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    // Resolve display info for the already-selected reference
    let cancelled = false;
    (async () => {
      try {
        if (!useFirebase) return;
        const colName = SYSTEM_COLLECTIONS[system];
        if (!colName) return;
        const { doc, getDoc } = await import('firebase/firestore');
        const snap = await getDoc(doc(db, colName, value));
        if (!cancelled && snap.exists()) {
          const data = /** @type {Record<string, any>} */ (snap.data());
          setSelected({
            id: value,
            label: data.title || data.name || data.display_name || value,
          });
        }
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [value, system]);

  const searchContent = async () => {
    if (!search.trim() || !useFirebase) return;
    setLoading(true);
    try {
      const colName = SYSTEM_COLLECTIONS[system];
      if (!colName) return;
      // Broad query — client-side text filter for matching
      const q = query(collection(db, colName), limit(20));
      const snap = await getDocs(q);
      const qLower = search.toLowerCase().trim();
      const matched = /** @type {any[]} */ (snap.docs
        .map((d) => {
          const data = /** @type {Record<string, any>} */ (d.data() || {});
          return { id: d.id, ...data };
        }))
        .filter((d) => {
          const label = (d.title || d.name || d.display_name || '').toLowerCase();
          return label.includes(qLower);
        })
        .slice(0, 10);
      setResults(matched.map((d) => ({
        id: d.id,
        label: d.title || d.name || d.display_name || d.id,
      })));
    } finally {
      setLoading(false);
    }
  };

  if (value && selected) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg">
        <Icon className="w-4 h-4 text-indigo-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-indigo-600 font-medium">{SYSTEM_LABELS[system]}</div>
          <div className="text-sm text-stone-800 truncate">{selected.label}</div>
        </div>
        <button
          type="button"
          onClick={() => { onChange(null); setSelected(null); setResults([]); }}
          className="text-stone-400 hover:text-stone-600"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchContent(); } }}
          placeholder={`Search for a ${SYSTEM_LABELS[system]?.toLowerCase() || 'content'}...`}
          className="flex-1 px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
        />
        <button
          type="button"
          onClick={searchContent}
          disabled={loading || !search.trim()}
          className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
        </button>
      </div>
      {results.length > 0 && (
        <div className="border border-stone-200 rounded-lg divide-y divide-stone-100 max-h-48 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => { onChange(r.id); setResults([]); setSearch(''); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-stone-50"
            >
              <Icon className="w-4 h-4 text-stone-400 shrink-0" />
              <span className="text-sm text-stone-700 truncate">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}