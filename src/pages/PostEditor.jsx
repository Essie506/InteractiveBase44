import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { callSavePost } from '@/services/postService';
import { useToast } from '@/components/ui/use-toast';
import MediaUploadButton from '@/components/MediaUploadButton';
import { Loader2, Send, Globe, Users, Lock, ImagePlus, Link2, X } from 'lucide-react';

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public', desc: 'Anyone can see this post', icon: Globe },
  { value: 'connections', label: 'Connections', desc: 'Only your connections', icon: Users },
  { value: 'private', label: 'Private', desc: 'Only you can see this', icon: Lock },
];

export default function PostEditor() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [body, setBody] = useState('');
  const [mediaUrls, setMediaUrls] = useState([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkUrlInput, setLinkUrlInput] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [visibility, setVisibility] = useState('public');
  const [saving, setSaving] = useState(false);

  const normalizeUrl = (url) => {
    const trimmed = url.trim();
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  };

  const attachLink = () => {
    const normalized = normalizeUrl(linkUrlInput);
    if (!normalized) return;
    setLinkUrl(normalized);
    setLinkUrlInput('');
    setShowLinkInput(false);
  };

  const handleSave = async () => {
    if (!body.trim()) {
      toast({ title: 'Post body is empty', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await callSavePost({
        author_identity_id: user.id,
        author_type: 'identity',
        body: body.trim(),
        media_urls: mediaUrls,
        link_url: linkUrl || null,
        visibility,
        operating_context: user.active_context || 'personal',
        lifecycle_state: 'published',
      });
      toast({ title: 'Post published' });
      navigate('/feed');
    } catch (err) {
      toast({
        title: 'Could not publish post',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-stone-800">Create Post</h1>
        <p className="text-stone-500 text-sm">Share something with the Interactive community</p>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5">
        {/* Body */}
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="What's on your mind?"
          rows={6}
          className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm resize-none focus:outline-none focus:border-indigo-400"
          autoFocus
        />

        {/* Media upload */}
        <div className="mt-3">
          <MediaUploadButton
            ownerId={user.id}
            sourceDomain={user.active_context || 'personal'}
            visibility={visibility}
            multiple
            onUploaded={(assets) => {
              const arr = Array.isArray(assets) ? assets : [assets];
              setMediaUrls(prev => [...prev, ...arr.map(a => a.file_url)].slice(0, 4));
            }}
            onError={() => toast({ title: 'Upload failed', variant: 'destructive' })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50"
          >
            <ImagePlus className="w-4 h-4" /> Add photos
          </MediaUploadButton>
        </div>

        {/* Media previews */}
        {mediaUrls.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {mediaUrls.map((url, i) => (
              <div key={i} className="relative">
                <img src={url} alt="" className="w-full h-32 object-cover rounded-lg" />
                <button
                  onClick={() => setMediaUrls(prev => prev.filter((_, idx) => idx !== i))}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full text-xs flex items-center justify-center hover:bg-black/80"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Link attachment */}
        <div className="mt-4">
          {linkUrl ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg">
              <Link2 className="w-4 h-4 text-stone-400 shrink-0" />
              <span className="text-sm text-stone-600 truncate flex-1">{linkUrl}</span>
              <button onClick={() => setLinkUrl('')} className="text-stone-400 hover:text-stone-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : showLinkInput ? (
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={linkUrlInput}
                onChange={e => setLinkUrlInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); attachLink(); } }}
                placeholder="https://example.com"
                className="flex-1 px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
                autoFocus
              />
              <button onClick={attachLink} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Attach</button>
              <button onClick={() => { setShowLinkInput(false); setLinkUrlInput(''); }} className="px-2 py-2 text-stone-400 hover:text-stone-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLinkInput(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50"
            >
              <Link2 className="w-4 h-4" /> Add link
            </button>
          )}
        </div>

        {/* Visibility */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-stone-700 mb-2">Visibility</label>
          <div className="grid grid-cols-3 gap-2">
            {VISIBILITY_OPTIONS.map(opt => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => setVisibility(opt.value)}
                  className={`flex flex-col items-center gap-1 p-3 border rounded-lg text-center transition-colors ${
                    visibility === opt.value
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                      : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-xs font-medium">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !body.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {saving ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}