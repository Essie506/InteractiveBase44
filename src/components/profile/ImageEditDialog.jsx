import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera } from 'lucide-react';
import MediaUploadButton from '@/components/MediaUploadButton';
import ImagePositioner from '@/components/ImagePositioner';

/**
 * Shared image upload + focal-point editor for avatar/logo or cover.
 * Used by Personal, Professional, and Business profiles.
 *
 * Props:
 *  - sourceDomain: 'personal' | 'professional' | 'business' (for MediaAsset attribution)
 *  - kind: 'avatar' | 'cover'
 *  - avatarShape: 'circle' (default) | 'rounded' — affects positioner preview shape
 */
export default function ImageEditDialog({
  open,
  onClose,
  kind,
  ownerId,
  sourceDomain = 'professional',
  imageUrl,
  mediaId,
  position,
  avatarShape = 'circle',
  onSave,
}) {
  const [url, setUrl] = useState(imageUrl || '');
  const [mid, setMid] = useState(mediaId || '');
  const [pos, setPos] = useState(position || { x: 0.5, y: 0.5, zoom: 1 });

  const isAvatar = kind === 'avatar';

  const handleSave = () => {
    onSave({ url, mediaId: mid, position: pos });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isAvatar ? (avatarShape === 'rounded' ? 'Edit logo' : 'Edit profile photo') : 'Edit cover image'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <MediaUploadButton
              ownerId={ownerId}
              sourceDomain={sourceDomain}
              visibility="public"
              onUploaded={(asset) => {
                setUrl(asset.file_url);
                setMid(asset.id);
                setPos({ x: 0.5, y: 0.5, zoom: 1 });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-stone-100 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-200 cursor-pointer"
            >
              <Camera className="w-4 h-4" /> {url ? 'Change image' : 'Upload image'}
            </MediaUploadButton>
            {url && (
              <button type="button" onClick={() => { setUrl(''); setMid(''); }} className="text-sm text-stone-500 hover:text-red-500">
                Remove
              </button>
            )}
          </div>
          {url && (
            <ImagePositioner
              imageUrl={url}
              value={pos}
              onChange={setPos}
              shape={isAvatar ? avatarShape : 'rect'}
              aspect="16 / 5"
              label={isAvatar ? (avatarShape === 'rounded' ? 'Reposition logo' : 'Reposition profile photo') : 'Reposition cover'}
              preview={isAvatar ? null : { width: 120, label: 'Mobile preview' }}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!url}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}