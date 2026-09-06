// CommentSection — comment list + composer for any target (Spec 20 §21).
// Supports threaded replies via parent_comment_id.
import { useState, useEffect, useCallback } from 'react';
import { Send, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { listComments, createComment, deleteComment } from '@/services/communityService';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import CommentItem from '@/components/community/CommentItem';

export default function CommentSection({ targetSystem, targetId, targetType }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!targetSystem || !targetId) return;
    setLoading(true);
    try {
      setComments(await listComments(targetSystem, targetId));
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setLoading(false);
    }
  }, [targetSystem, targetId]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!body.trim() || submitting) return;
    if (!user) { toast({ title: 'Sign in to comment', variant: 'destructive' }); return; }
    setSubmitting(true);
    try {
      await createComment(targetSystem, targetType, targetId, body.trim());
      setBody('');
      await load();
    } catch (err) {
      toast({ title: 'Could not post comment', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (parentId, replyText) => {
    await createComment(targetSystem, targetType, targetId, replyText, parentId);
    await load();
  };

  const handleDelete = async (commentId) => {
    try {
      await deleteComment(commentId);
      await load();
    } catch (err) {
      toast({ title: 'Could not delete comment', variant: 'destructive' });
    }
  };

  const topLevel = comments.filter((c) => !c.parent_comment_id);
  const repliesOf = (parentId) => comments.filter((c) => c.parent_comment_id === parentId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
        <MessageCircle className="w-4 h-4" /> Comments ({comments.length})
      </div>

      {user && (
        <div className="flex gap-2">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a comment..." className="flex-1 min-h-[60px] resize-none" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); }} />
          <Button onClick={handleSubmit} disabled={!body.trim() || submitting} size="sm" className="self-end">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-stone-400 animate-spin" /></div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-stone-400 text-center py-4">No comments yet. Be the first to comment.</p>
      ) : (
        <div className="space-y-3">
          {topLevel.map((comment) => (
            <CommentItem key={comment.id} comment={comment} replies={repliesOf(comment.id)} user={user} onReply={handleReply} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}