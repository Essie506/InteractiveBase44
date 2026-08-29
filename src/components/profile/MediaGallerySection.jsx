import { useState, useEffect } from 'react';
import { X, Loader2, Camera } from 'lucide-react';
import ProfileSection from './ProfileSection';
import MediaUploadButton from '@/components/MediaUploadButton';
import { getMedia, getMediaUrl } from '@/lib/media';

/**
 * Shared media gallery section — displays a grid of gallery images
 * for Professional and Business profiles. Uses the existing Media
 * System (MediaAsset records with source_domain 'professional' or
 * 'business'). Does not create a separate media storage system.
 *
 * Owner mode (editable=true): shows upload button + remove buttons.
 * Visitor mode (editable=false): render-only.
 *
 * Props:
 *  - mediaIds: string[] — MediaAsset IDs
 *  - editable: boolean
 *  - ownerId, sourceDomain — for media upload attribution
 *  - onEdit, onSave(newMediaIds)
 */
export default function MediaGallerySection({
  mediaIds = [],
  editable = false,
  ownerId,
  sourceDomain,
  onEdit,
  onSave,
}) {
  const [urls, setUrls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!mediaIds || mediaIds.length === 0) {
        setUrls([]);
        return;
      }
      setLoading(true);
      const resolved = await Promise.all(
        mediaIds.map(async (id) => {
          try {
            const asset = await getMedia(id);
            if (!asset) return null;
            const url = await getMediaUrl(asset);
            return { id, url, alt: asset.alt_text || asset.file_name || '' };
          } catch {
            return null;
          }
        })
      );
      if (!cancelled) {
        setUrls(resolved.filter(Boolean));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mediaIds]);

  const handleUploaded = (asset) => {
    setUploading(false);
    onSave([...mediaIds, asset.id]);
  };

  const handleRemove = (id) => {
    onSave(mediaIds.filter((mid) => mid !== id));
  };

  return (
    <ProfileSection title="Media" onEdit={editable ? onEdit : null}>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-stone-400 animate-spin" />
        </div>
      ) : urls.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {urls.map((item) => (
            <div key={item.id} className="relative group aspect-square rounded-lg overflow-hidden border border-stone-200 bg-stone-100">
              {item.url ? (
                <img src={item.url} alt={item.alt} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-stone-400 text-sm">Unavailable</div>
              )}
              {editable && (
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          {editable && (
            <MediaUploadButton
              ownerId={ownerId}
              sourceDomain={sourceDomain}
              visibility="public"
              onUploaded={handleUploaded}
              onError={() => setUploading(false)}
              className="aspect-square border-2 border-dashed border-stone-300 rounded-lg flex items-center justify-center text-stone-400 hover:bg-stone-50 hover:text-stone-600"
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Camera className="w-5 h-5" />
                  <span className="text-xs">Add</span>
                </div>
              )}
            </MediaUploadButton>
          )}
        </div>
      ) : (
        editable && (
          <div className="flex items-center justify-center py-8">
            <MediaUploadButton
              ownerId={ownerId}
              sourceDomain={sourceDomain}
              visibility="public"
              onUploaded={handleUploaded}
              onError={() => setUploading(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-dashed border-stone-300 rounded-lg text-sm text-stone-500 hover:bg-stone-50 hover:text-stone-700"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Camera className="w-4 h-4" /> Add media
                </>
              )}
            </MediaUploadButton>
          </div>
        )
      )}
      {!editable && urls.length === 0 && !loading && null}
    </ProfileSection>
  );
}