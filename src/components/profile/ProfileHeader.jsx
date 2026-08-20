import { ShieldCheck, MapPin, Camera } from 'lucide-react';
import { mediaStyle } from './mediaStyle';
import { EditPencil } from './EditPencil';

/**
 * Shared Interactive profile header — cover + avatar/logo + identity block + actions.
 *
 * Used by Personal, Professional, and Business profile views. The header
 * preserves the social-profile appearance across all three types while
 * adapting the avatar shape and identity fields per type.
 *
 * Responsive behaviour:
 *   Mobile  — flex-col: avatar overlaps cover, identity below, actions below identity.
 *   Tablet+ — flex-row: avatar overlaps cover (self-start, -mt-20), identity and
 *             actions sit to the RIGHT of the avatar with sm:pt-8 so the name
 *             never renders underneath the avatar and never overlaps the cover.
 *
 * Props:
 *  - avatarShape: 'circle' (personal/professional) | 'rounded' (business logo)
 *  - screenName: @handle (personal/professional) — shown as @screen_name
 *  - subtitle: secondary text (business category) — shown when no screenName
 *  - verificationState: 'verified' shows the shield badge
 */
export default function ProfileHeader({
  coverUrl,
  coverPos,
  avatarUrl,
  avatarPos,
  avatarShape = 'circle',
  displayName,
  screenName,
  subtitle,
  headline,
  location,
  verificationState,
  editable = false,
  onEditCover,
  onEditAvatar,
  onEditDisplayName,
  onEditHeadline,
  actions = null,
}) {
  const avatarRoundedClass = avatarShape === 'circle' ? 'rounded-full' : 'rounded-xl';

  return (
    <div>
      {/* Cover — full width */}
      <div className="relative">
        <div className="w-full h-48 sm:h-64 md:h-80 bg-stone-200 overflow-hidden">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="w-full h-full" style={mediaStyle(coverPos)} />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-indigo-700" />
          )}
        </div>
        {editable && (
          <button
            type="button"
            onClick={onEditCover}
            className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur text-stone-800 rounded-lg text-sm font-medium hover:bg-white shadow-sm"
          >
            <Camera className="w-3.5 h-3.5" /> {coverUrl ? 'Change cover' : 'Add cover'}
          </button>
        )}
      </div>

      {/* Identity row */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:gap-6 gap-4">
          {/* Avatar / logo — overlaps cover bottom */}
          <div className="relative shrink-0 self-start -mt-16 sm:-mt-20">
            <div className={`w-32 h-32 sm:w-36 sm:h-36 ${avatarRoundedClass} ring-4 ring-stone-50 bg-stone-200 overflow-hidden`}>
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="w-full h-full" style={mediaStyle(avatarPos)} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl font-semibold text-stone-400">
                  {(displayName || '?')[0].toUpperCase()}
                </div>
              )}
            </div>
            {editable && (
              <button
                type="button"
                onClick={onEditAvatar}
                className="absolute bottom-0 right-0 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center hover:bg-indigo-700 transition-colors border-2 border-white shadow-sm"
              >
                <Camera className="w-4 h-4 text-white" />
              </button>
            )}
          </div>

          {/* Identity block — right of avatar on sm+, below cover */}
          <div className="flex-1 sm:pt-8">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900">
                {displayName || (editable ? 'Your name' : '—')}
              </h1>
              {verificationState === 'verified' && <ShieldCheck className="w-6 h-6 text-indigo-600" />}
              {editable && onEditDisplayName && <EditPencil onClick={onEditDisplayName} label={`Edit ${avatarShape === 'rounded' ? 'business' : 'display'} name`} />}
            </div>
            {screenName && <p className="text-stone-500 mt-0.5">@{screenName}</p>}
            {!screenName && subtitle && <p className="text-stone-500 mt-0.5">{subtitle}</p>}
            <div className="flex items-center gap-2">
              {headline ? (
                <p className="text-stone-700 mt-1">{headline}</p>
              ) : (
                editable && onEditHeadline && <span className="text-sm text-stone-400 mt-1">Add a headline</span>
              )}
              {editable && onEditHeadline && <EditPencil onClick={onEditHeadline} label="Edit headline" />}
            </div>
            {location && (
              <p className="flex items-center gap-1.5 text-sm text-stone-500 mt-1.5">
                <MapPin className="w-4 h-4" />
                {location}
              </p>
            )}
          </div>

          {/* Actions — right of identity on sm+, below on mobile */}
          {actions && <div className="sm:pt-8">{actions}</div>}
        </div>
      </div>
    </div>
  );
}