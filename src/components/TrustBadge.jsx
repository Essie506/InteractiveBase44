import { useState, useEffect } from 'react';
import { ShieldCheck, Clock, Sparkles } from 'lucide-react';
import { getTrustRecord } from '@/lib/trust';

// Displays authoritative public Trust indicators.
// Never exposes raw verification documents or internal Trust records.
export default function TrustBadge({ targetType, targetId, size = 'sm' }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!targetType || !targetId) { setLoading(false); return; }
    getTrustRecord(targetType, targetId).then(r => {
      setRecord(r);
      setLoading(false);
    });
  }, [targetType, targetId]);

  if (loading || !record) return null;

  const indicators = record.public_indicators || [];
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1';

  if (record.trust_level === 'verified' || indicators.includes('verified')) {
    return (
      <span className={`inline-flex items-center gap-1 ${sizeClass} bg-emerald-50 text-emerald-700 rounded-full font-medium`}>
        <ShieldCheck className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        Verified
        {indicators.includes('new') && <Sparkles className="w-3 h-3 text-emerald-500" />}
      </span>
    );
  }

  if (record.trust_level === 'pending') {
    return (
      <span className={`inline-flex items-center gap-1 ${sizeClass} bg-amber-50 text-amber-700 rounded-full font-medium`}>
        <Clock className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        Pending Verification
      </span>
    );
  }

  return null;
}