import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, Search, Check } from 'lucide-react';

/**
 * Shared structured taxonomy picker — replaces free-text TagListEditDialog
 * for services and facilities. Lets users select from canonical taxonomy
 * terms (fetched from Firestore) and optionally add custom free-text
 * entries as a fallback.
 *
 * Selections are stored as [{ id, label }] where:
 *   - id = canonical slug (for search/filter matching), or null for custom entries
 *   - label = display text
 *
 * This ensures searchable classification does not depend on free-text spelling
 * while still allowing descriptive custom entries.
 *
 * Props:
 *  - open, onClose, onSave
 *  - title: dialog title
 *  - items: currently selected [{ id, label }]
 *  - terms: canonical taxonomy terms [{ id, slug, label, category }]
 *  - placeholder: free-text input placeholder
 */
export default function TaxonomySelectDialog({
  open,
  onClose,
  onSave,
  title = 'Select items',
  items = [],
  terms = [],
  placeholder = 'Add custom item',
}) {
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [customLabel, setCustomLabel] = useState('');

  useEffect(() => {
    if (open) {
      setSelected(items || []);
      setSearch('');
      setCustomLabel('');
    }
  }, [open, items]);

  const filteredTerms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return terms;
    return terms.filter((t) => (t.label || '').toLowerCase().includes(q));
  }, [terms, search]);

  const isSelected = (slug) => selected.some((s) => s.id === slug);

  const toggleTerm = (term) => {
    if (isSelected(term.slug)) {
      setSelected(selected.filter((s) => s.id !== term.slug));
    } else {
      setSelected([...selected, { id: term.slug, label: term.label }]);
    }
  };

  const addCustom = () => {
    const label = customLabel.trim();
    if (!label) return;
    if (selected.some((s) => s.label.toLowerCase() === label.toLowerCase())) return;
    setSelected([...selected, { id: null, label }]);
    setCustomLabel('');
  };

  const removeSelected = (item) => {
    setSelected(selected.filter((s) => s !== item));
  };

  const handleSave = () => {
    onSave(selected);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Search */}
        {terms.length > 0 && (
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-9"
            />
          </div>
        )}

        {/* Canonical terms */}
        {filteredTerms.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 max-h-48 overflow-y-auto">
            {filteredTerms.map((term) => (
              <button
                key={term.slug || term.id}
                type="button"
                onClick={() => toggleTerm(term)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  isSelected(term.slug)
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                }`}
              >
                {isSelected(term.slug) && <Check className="w-3 h-3" />}
                {term.label}
              </button>
            ))}
          </div>
        )}

        {/* Custom free-text entry */}
        <div className="flex gap-2 mb-3">
          <Input
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
            placeholder={placeholder}
          />
          <Button type="button" onClick={addCustom} size="icon" variant="secondary">
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {/* Selected items */}
        <div className="flex flex-wrap gap-2 min-h-8 mb-2">
          {selected.map((s, i) => (
            <span
              key={(s.id || s.label) + i}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm"
            >
              {s.label}
              {!s.id && <span className="text-xs text-indigo-400">(custom)</span>}
              <button type="button" onClick={() => removeSelected(s)}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {selected.length === 0 && (
            <p className="text-sm text-stone-400">Nothing selected yet.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}