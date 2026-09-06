// ShareDialog — creates a Simple or Commentary share (§14.4).
// Simple Share = internal reference record. Commentary Share = new
// post (commentary_body) + reference, which appears in the Feed.
import { useState } from 'react';
import { Loader2, Share2, MessageSquarePlus } from 'lucide-react';
import { createShare } from '@/services/shareService';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function ShareDialog({ targetSystem, targetId, targetType, onClose }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [commentary, setCommentary] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSimpleShare = async () => {
    if (!user) { toast({ title: 'Sign in to share', variant: 'destructive' }); return; }
    setSubmitting(true);
    try {
      await createShare(targetSystem, targetType, targetId, 'simple');
      toast({ title: 'Shared to your connections' });
      onClose();
    } catch (err) {
      toast({ title: 'Could not share', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCommentaryShare = async () => {
    if (!user) { toast({ title: 'Sign in to share', variant: 'destructive' }); return; }
    if (!commentary.trim()) { toast({ title: 'Add your commentary first', variant: 'destructive' }); return; }
    setSubmitting(true);
    try {
      await createShare(targetSystem, targetType, targetId, 'commentary', commentary.trim());
      toast({ title: 'Shared to the Feed with your commentary' });
      onClose();
    } catch (err) {
      toast({ title: 'Could not share', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-stone-100">
          <h2 className="text-lg font-bold text-stone-800">Share</h2>
          <p className="text-sm text-stone-500 mt-0.5">Share this {targetSystem} with the community</p>
        </div>

        <div className="p-5 space-y-4">
          {/* Commentary share — appears in the Feed */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">
              Share to Feed with commentary
            </label>
            <Textarea
              value={commentary}
              onChange={(e) => setCommentary(e.target.value)}
              rows={3}
              placeholder="Add your thoughts about this..."
              className="resize-none"
              disabled={submitting}
            />
            <p className="text-xs text-stone-400 mt-1">
              Your commentary and a link to this {targetSystem} will appear in the public Feed.
            </p>
            <Button
              onClick={handleCommentaryShare}
              disabled={submitting || !commentary.trim()}
              className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <MessageSquarePlus className="w-4 h-4 mr-2" />}
              Share to Feed
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-stone-100" /></div>
            <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-stone-400">or</span></div>
          </div>

          {/* Simple share — internal record */}
          <Button
            onClick={handleSimpleShare}
            disabled={submitting}
            variant="outline"
            className="w-full"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
            Share to connections (no commentary)
          </Button>
        </div>

        <div className="p-5 border-t border-stone-100">
          <button onClick={onClose} className="w-full py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-lg font-medium transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}