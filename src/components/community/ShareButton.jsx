// ShareButton — reusable share + copy-link control (Spec 14.1).
// Creates a Simple Share record (internal) and provides a copy-link
// option (external). Embeds alongside ReactionBar on any content page.
import { useState } from 'react';
import { Share2, Link2, Loader2, Check } from 'lucide-react';
import { createShare } from '@/services/shareService';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';

export default function ShareButton({ targetSystem, targetId, targetType }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (!user) { toast({ title: 'Sign in to share', variant: 'destructive' }); return; }
    setSharing(true);
    try {
      await createShare(targetSystem, targetType, targetId, 'simple');
      toast({ title: 'Shared to your connections' });
    } catch (err) {
      toast({ title: 'Could not share', variant: 'destructive' });
    } finally {
      setSharing(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast({ title: 'Could not copy link', variant: 'destructive' });
    });
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleShare}
        disabled={sharing}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-stone-500 hover:bg-stone-100 disabled:opacity-50"
      >
        {sharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
        Share
      </button>
      <button
        onClick={handleCopyLink}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-stone-500 hover:bg-stone-100"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5" />}
        {copied ? 'Copied' : 'Copy Link'}
      </button>
    </div>
  );
}