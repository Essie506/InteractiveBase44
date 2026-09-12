// PostEditor — V2 Post System.
// Supports the 11 spec post types (§9), Universal Post Model fields (§8),
// video + image media via the Media System, and linked content references.
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { callSavePost, fetchPostById } from '@/services/postService';
import { useToast } from '@/components/ui/use-toast';
import MediaUploadButton from '@/components/MediaUploadButton';
import PostTypeSelector from '@/components/post/PostTypeSelector';
import LinkedContentPicker from '@/components/post/LinkedContentPicker';
import { getPostTypeConfig } from '@/data/postTypes';
import { Loader2, Send, Globe, Users, Lock, ImagePlus, Video, Link2, X, Tag } from 'lucide-react';

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public', desc: 'Anyone can see this post', icon: Globe },
  { value: 'connections', label: 'Connections', desc: 'Only your connections', icon: Users },
  { value: 'private', label: 'Private', desc: 'Only you can see this', icon: Lock },
];

const REFERENCE_SYSTEM_MAP = {
  workout: 'workout',
  calendar_event: 'calendar_event',
  promotion: 'promotion',
};

export default function PostEditor() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { id: editId } = useParams();
  const [loadingPost, setLoadingPost] = useState(false);
  const [postType, setPostType] = useState('standard');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [mediaAssets, setMediaAssets] = useState([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkUrlInput, setLinkUrlInput] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [visibility, setVisibility] = useState('public');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [linkedRefId, setLinkedRefId] = useState(null);
  const [saving, setSaving] = useState(false);
  // Preserve original authorship when editing — never collapse to personal
  const [existingAuthorType, setExistingAuthorType] = useState(null);
  const [existingBusinessId, setExistingBusinessId] = useState(null);
  const [existingOperatingContext, setExistingOperatingContext] = useState(null);

  const config = getPostTypeConfig(postType);
  const refSystem = config.requiresReference ? REFERENCE_SYSTEM_MAP[config.requiresReference] : null;

  // Load existing post for editing
  useEffect(() => {
    if (!editId) return;
    setLoadingPost(true);
    fetchPostById(editId)
      .then((post) => {
        if (!post) { toast({ title: 'Post not found', variant: 'destructive' }); navigate('/feed'); return; }
        setPostType(post.post_type || 'standard');
        setTitle(post.title || '');
        setSummary(post.summary || '');
        setBody(post.body || '');
        setMediaAssets((post.media_asset_ids || []).map((aid, i) => ({ id: aid, file_url: post.media_urls?.[i] || '' })).filter(a => a.file_url));
        setLinkUrl(post.link_url || '');
        setVisibility(post.visibility || 'public');
        setTags(post.tags || []);
        setExistingAuthorType(post.author_type || 'identity');
        setExistingBusinessId(post.business_id || null);
        setExistingOperatingContext(post.operating_context || 'personal');
        if (post.linked_content_references?.length > 0) setLinkedRefId(post.linked_content_references[0].id);
      })
      .catch(() => { toast({ title: 'Could not load post', variant: 'destructive' }); navigate('/feed'); })
      .finally(() => setLoadingPost(false));
  }, [editId]);

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

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const handleSave = async () => {
    if (!body.trim()) {
      toast({ title: 'Post body is empty', variant: 'destructive' });
      return;
    }
    if (config.requiresReference && !linkedRefId) {
      toast({ title: `Please link a ${config.label} reference`, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const linkedRefs = linkedRefId && refSystem
        ? [{ system: refSystem, type: config.requiresReference, id: linkedRefId }]
        : [];

      // Authorship follows the active profile context for new posts.
      // For edits, preserve the original author_type/business_id — never
      // collapse a business-authored post to personal on save.
      const activeContext = user.active_context || 'personal';
      const activeBusinessId = user.active_business_id;
      const isBusinessAuthor = editId
        ? existingAuthorType === 'business'
        : (activeContext === 'business' && !!activeBusinessId);

      const effectiveAuthorType = isBusinessAuthor ? 'business' : 'identity';
      const effectiveBusinessId = isBusinessAuthor
        ? (editId ? existingBusinessId : activeBusinessId)
        : null;
      const effectiveOperatingContext = editId
        ? (existingOperatingContext || activeContext)
        : activeContext;

      await callSavePost({
        id: editId || undefined,
        author_identity_id: user.id,
        author_type: effectiveAuthorType,
        business_id: effectiveBusinessId,
        post_type: postType,
        title: config.supportsTitle ? (title.trim() || null) : null,
        summary: config.supportsSummary ? (summary.trim() || null) : null,
        body: body.trim(),
        media_urls: mediaAssets.map((a) => a.file_url).filter(Boolean),
        media_asset_ids: mediaAssets.map((a) => a.id).filter(Boolean),
        link_url: config.supportsLink ? (linkUrl || null) : null,
        linked_content_references: linkedRefs,
        tags,
        hashtags: tags,
        visibility,
        operating_context: effectiveOperatingContext,
        lifecycle_state: 'published',
      });
      toast({ title: editId ? 'Post updated' : 'Post published' });
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

  if (loadingPost) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-stone-800">{editId ? 'Edit Post' : 'Create Post'}</h1>
        <p className="text-stone-500 text-sm">{editId ? 'Update your post' : 'Share something with the Interactive community'}</p>
        {(() => {
          const ctx = editId
            ? (existingOperatingContext || user.active_context || 'personal')
            : (user.active_context || 'personal');
          const isBiz = editId
            ? existingAuthorType === 'business'
            : (ctx === 'business' && !!user.active_business_id);
          const label = isBiz ? 'Business' : (ctx === 'professional' ? 'Professional' : 'Personal');
          return (
            <span className={`inline-block mt-2 px-2.5 py-1 rounded-full text-xs font-medium ${
              isBiz ? 'bg-indigo-100 text-indigo-700' :
              ctx === 'professional' ? 'bg-emerald-100 text-emerald-700' :
              'bg-stone-100 text-stone-600'
            }`}>
              Posting as {label}
            </span>
          );
        })()}
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5">
        {/* Post type selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-stone-700 mb-2">Post Type</label>
          <PostTypeSelector value={postType} onChange={setPostType} />
          <p className="text-xs text-stone-400 mt-1.5">{config.description}</p>
        </div>

        {/* Title (type-specific) */}
        {config.supportsTitle && (
          <div className="mb-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm font-medium focus:outline-none focus:border-indigo-400"
            />
          </div>
        )}

        {/* Summary (type-specific) */}
        {config.supportsSummary && (
          <div className="mb-3">
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Short summary..."
              className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm text-stone-600 focus:outline-none focus:border-indigo-400"
            />
          </div>
        )}

        {/* Body */}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What's on your mind?"
          rows={6}
          className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm resize-none focus:outline-none focus:border-indigo-400"
          autoFocus
        />

        {/* Linked content reference (type-specific) */}
        {refSystem && (
          <div className="mt-3">
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Linked {config.label} <span className="text-red-500">*</span>
            </label>
            <LinkedContentPicker system={refSystem} value={linkedRefId} onChange={setLinkedRefId} />
          </div>
        )}

        {/* Media upload — images + video per spec scope */}
        <div className="mt-3 flex items-center gap-2">
          <MediaUploadButton
            ownerId={user.id}
            sourceDomain="post"
            visibility={visibility}
            accept="image/*,video/*"
            multiple
            onUploaded={(assets) => {
              const arr = Array.isArray(assets) ? assets : [assets];
              setMediaAssets((prev) => [...prev, ...arr].slice(0, 4));
            }}
            onError={() => toast({ title: 'Upload failed', variant: 'destructive' })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50"
          >
            <ImagePlus className="w-4 h-4" /> Add media
          </MediaUploadButton>
        </div>

        {/* Media previews */}
        {mediaAssets.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {mediaAssets.map((asset, i) => (
              <div key={i} className="relative">
                {asset.media_type === 'video' ? (
                  <video src={asset.file_url} className="w-full h-32 object-cover rounded-lg" muted />
                ) : (
                  <img src={asset.file_url} alt="" className="w-full h-32 object-cover rounded-lg" />
                )}
                <button
                  onClick={() => setMediaAssets((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full text-xs flex items-center justify-center hover:bg-black/80"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Link attachment (type-specific) */}
        {config.supportsLink && (
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
                  onChange={(e) => setLinkUrlInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); attachLink(); } }}
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
        )}

        {/* Tags */}
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 flex-wrap">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 px-2 py-1 bg-stone-100 text-stone-600 rounded-full text-xs">
                  <Tag className="w-3 h-3" />
                  {t}
                  <button onClick={() => setTags((prev) => prev.filter((x) => x !== t))} className="text-stone-400 hover:text-stone-600">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Add tag..."
                className="flex-1 min-w-[100px] px-2 py-1 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>
          </div>
        </div>

        {/* Visibility */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-stone-700 mb-2">Visibility</label>
          <div className="grid grid-cols-3 gap-2">
            {VISIBILITY_OPTIONS.map((opt) => {
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
            disabled={saving || !body.trim() || (config.requiresReference && !linkedRefId)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {saving ? 'Saving...' : editId ? 'Save Changes' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}