// CommentItem — a single comment with optional reply thread (Spec 20 §21).
import { useState } from 'react';
import { Send, Trash2, Loader2, CornerDownRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function CommentItem({ comment, replies, user, onReply, onDelete, isReply = false }) {
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isAuthor = user && comment.identity_id === user.id;

  const handleReply = async () => {
    if (!replyBody.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onReply(comment.id, replyBody.trim());
      setReplyBody('');
      setShowReplyBox(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={isReply ? 'pl-6 border-l border-stone-100' : ''}>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="text-sm text-stone-800 whitespace-pre-wrap break-words">{comment.body}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-stone-400">{timeAgo(comment._created_date)}</span>
            {comment.edit_state === 'edited' && <span className="text-xs text-stone-400">(edited)</span>}
            {user && !isReply && (
              <button onClick={() => setShowReplyBox((v) => !v)} className="text-xs text-stone-400 hover:text-indigo-600">Reply</button>
            )}
            {isAuthor && (
              <button onClick={() => onDelete(comment.id)} className="text-xs text-stone-400 hover:text-red-600 inline-flex items-center gap-0.5">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {showReplyBox && (
        <div className="flex gap-2 mt-2">
          <Textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="Write a reply..." className="flex-1 min-h-[44px] resize-none text-sm" />
          <Button onClick={handleReply} disabled={!replyBody.trim() || submitting} size="sm" className="self-end">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      )}

      {replies && replies.length > 0 && (
        <div className="mt-2 space-y-2">
          {replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} replies={[]} user={user} onReply={onReply} onDelete={onDelete} isReply />
          ))}
        </div>
      )}
    </div>
  );
}