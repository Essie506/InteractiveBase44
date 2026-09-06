// ShareButton — reusable share + copy-link control (Spec 14.1).
// Opens a ShareDialog that supports both Simple shares (internal) and
// Commentary shares (§14.4 — new post + reference, appears in the Feed).
// Embeds alongside ReactionBar on any content page.
import { useState } from 'react';
import { Share2, Link2, Check } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import ShareDialog from '@/components/community/ShareDialog';

export default function ShareButton({ targetSystem, targetId, targetType }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    if (!user) { toast({ title: 'Sign in to share', variant: 'destructive' }); return; }
    setDialogOpen(true);
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
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={handleShare}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-stone-500 hover:bg-stone-100"
        >
          <Share2 className="w-3.5 h-3.5" />
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
      {dialogOpen && (
        <ShareDialog
          targetSystem={targetSystem}
          targetType={targetType}
          targetId={targetId}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}