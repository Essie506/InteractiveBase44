import { useState, useRef } from 'react';
import { uploadMedia } from '@/lib/media';
import { Loader2 } from 'lucide-react';

// Reusable media upload trigger.
// Wraps a visual trigger (children) with a hidden file input.
// Creates a MediaAsset through the authoritative Media pipeline.
export default function MediaUploadButton({
  ownerId,
  sourceDomain,
  visibility = 'private',
  accept = 'image/*',
  multiple = false,
  onUploaded,
  onError,
  children,
  className = '',
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = async (files) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;
    setUploading(true);
    try {
      if (multiple) {
        const assets = [];
        for (const file of fileArr) {
          const asset = await uploadMedia(file, ownerId, sourceDomain, visibility);
          assets.push(asset);
        }
        onUploaded?.(assets);
      } else {
        const asset = await uploadMedia(fileArr[0], ownerId, sourceDomain, visibility);
        onUploaded?.(asset);
      }
    } catch (err) {
      onError?.(err);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <label className={className + ' cursor-pointer'}>
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : children}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
      </label>
    </>
  );
}