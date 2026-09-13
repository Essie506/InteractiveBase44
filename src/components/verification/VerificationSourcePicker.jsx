import { useState, useEffect } from 'react';
import { listVerificationSources } from '@/services/verificationEngineService';
import { matchSources, CLAIM_TYPE_LABELS, claimTypesForSubject } from '@/lib/verificationEngine';
import { Loader2, ExternalLink, Check } from 'lucide-react';

/**
 * Multi-select Verification Sources picker. Eligible sources are
 * retrieved from the authoritative VerificationSource registry
 * according to subject type, jurisdiction, profession and claim
 * type. Selecting a source reveals its configured required fields.
 *
 * On change, emits an array of:
 *   { claim_type, source_id, field_values, source_reference }
 *
 * No verification is performed in the client.
 *
 * @param {{ subjectType: string, country?: string, profession?: string, value?: Array, onChange: (v: Array)=>void }} props
 */
export default function VerificationSourcePicker({ subjectType, country = 'GB', profession, onChange }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState({}); // `${sourceId}__${claimType}` -> { field_values }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listVerificationSources({ subjectType, country, profession })
      .then((s) => { if (!cancelled) setSources(s); })
      .catch(() => { if (!cancelled) setSources([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [subjectType, country, profession]);

  const claimTypes = claimTypesForSubject(subjectType);
  const byClaimType = {};
  for (const ct of claimTypes) {
    byClaimType[ct] = matchSources(sources, { subjectType, country, profession, claimType: ct });
  }

  const emit = (next) => {
    const arr = Object.entries(next).map(([key, v]) => {
      const [sourceId, claimType] = key.split('__');
      const source = sources.find((s) => s.id === sourceId);
      const refField = (source?.required_fields || []).find((f) => /number|reference/i.test(f.id));
      return {
        claim_type: claimType,
        source_id: sourceId,
        field_values: v.field_values || {},
        source_reference: refField ? (v.field_values || {})[refField.id] || '' : '',
      };
    });
    onChange?.(arr);
  };

  const toggle = (source, claimType) => {
    const key = `${source.id}__${claimType}`;
    const next = { ...selected };
    if (next[key]) delete next[key];
    else next[key] = { field_values: {} };
    setSelected(next);
    emit(next);
  };

  const setField = (key, fieldId, val) => {
    const next = {
      ...selected,
      [key]: { ...selected[key], field_values: { ...(selected[key]?.field_values || {}), [fieldId]: val } },
    };
    setSelected(next);
    emit(next);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 text-stone-300 animate-spin" />
      </div>
    );
  }

  const inputClass = 'w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400';

  const hasAny = claimTypes.some((ct) => (byClaimType[ct] || []).length > 0);

  return (
    <div className="space-y-5">
      {claimTypes.map((ct) => {
        const eligible = byClaimType[ct] || [];
        if (eligible.length === 0) return null;
        return (
          <div key={ct}>
            <h3 className="text-sm font-semibold text-stone-800 mb-2">{CLAIM_TYPE_LABELS[ct]}</h3>
            <div className="space-y-2">
              {eligible.map((source) => {
                const key = `${source.id}__${ct}`;
                const isSel = !!selected[key];
                return (
                  <div key={key} className={`border rounded-lg ${isSel ? 'border-indigo-300 bg-indigo-50/30' : 'border-stone-200'}`}>
                    <button type="button" onClick={() => toggle(source, ct)} className="w-full flex items-center gap-3 p-3 text-left">
                      <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${isSel ? 'bg-indigo-600 border-indigo-600' : 'border-stone-300'}`}>
                        {isSel && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-stone-800">{source.name}</div>
                        {source.description && <div className="text-xs text-stone-500">{source.description}</div>}
                      </div>
                      {source.automated_enabled
                        ? <span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded shrink-0">Automated</span>
                        : <span className="text-xs px-2 py-0.5 bg-stone-100 text-stone-500 rounded shrink-0">Manual review</span>}
                    </button>
                    {isSel && (source.required_fields || []).length > 0 && (
                      <div className="px-3 pb-3 space-y-2">
                        {(source.required_fields || []).map((f) => (
                          <div key={f.id}>
                            <label className="block text-xs font-medium text-stone-600 mb-1">
                              {f.label}{f.required ? ' *' : ''}
                            </label>
                            <input
                              type={f.type === 'date' ? 'date' : 'text'}
                              value={selected[key].field_values?.[f.id] || ''}
                              onChange={(e) => setField(key, f.id, e.target.value)}
                              className={inputClass}
                            />
                          </div>
                        ))}
                        {source.lookup_url && (
                          <a href={source.lookup_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                            <ExternalLink className="w-3 h-3" /> Official register lookup
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {!hasAny && (
        <p className="text-sm text-stone-500">No verification sources are currently configured for this subject.</p>
      )}
    </div>
  );
}