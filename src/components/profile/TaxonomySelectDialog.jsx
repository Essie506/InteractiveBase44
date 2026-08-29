import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, X } from 'lucide-react';

/**
 * Shared structured picker for services and facilities.
 *
 * Shows a single input with autocomplete suggestions from a static
 * standardOptions list (JS config — not a backend system). Users can:
 *  - select a standard suggestion (stored with its canonical id)
 *  - type a custom value and confirm with the tick button (stored with id=null)
 *
 * If the typed text exactly matches a standard option (case-insensitive),
 * it is stored as the standard entry to encourage consistent naming.
 *
 * Props:
 *  - open, onClose, onSave
 *  - title: dialog title
 *  - items: currently selected [{ id, label }]
 *  - standardOptions: canonical options [{ id, label }] from a JS config
 *  - placeholder: input placeholder
 */
export default function TaxonomySelectDialog({
  open,
  onClose,
  onSave,
  title = 'Select items',
  items = [],
  standardOptions = [],
  placeholder = 'Add custom item',
}) {
  const [selected, setSelected] = useState([]);
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(items || []);
      setInput('');
      setShowSuggestions(false);
    }
  }, [open, items]);

  // Filter standard options by input text (case-insensitive, partial match).
  // Exclude already-selected items so they can't be suggested again.
  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    return standardOptions
      .filter((opt) => opt.label.toLowerCase().includes(q))
      .filter((opt) => !selected.some((s) => s.id === opt.id))
      .slice(0, 8);
  }, [standardOptions, input, selected]);

  const addStandard = (opt) => {
    if (selected.some((s) => s.id === opt.id)) return;
    setSelected([...selected, { id: opt.id, label: opt.label }]);
    setInput('');
    setShowSuggestions(false);
  };

  const addCustom = () => {
    const label = input.trim();
    if (!label) return;
    // If the typed text matches a standard option, add as standard
    const match = standardOptions.find(
      (opt) => opt.label.toLowerCase() === label.toLowerCase()
    );
    if (match) {
      addStandard(match);
      return;
    }
    // Avoid duplicate by label
    if (selected.some((s) => s.label.toLowerCase() === label.toLowerCase())) return;
    setSelected([...selected, { id: null, label }]);
    setInput('');
    setShowSuggestions(false);
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

        {/* Input with autocomplete suggestions */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustom();
                }
              }}
              placeholder={placeholder}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 z-10 mt-1 bg-white border border-stone-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {suggestions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addStandard(opt);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-stone-50 transition-colors"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button type="button" onClick={addCustom} size="icon" variant="secondary">
            <Check className="w-4 h-4" />
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