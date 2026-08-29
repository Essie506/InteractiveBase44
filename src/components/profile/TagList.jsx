/**
 * Displays a list of tag pills (services, interests, etc.).
 * Shared across all Interactive profile types.
 */
/**
 * Displays a list of tag pills (services, facilities, interests, etc.).
 * Shared across all Interactive profile types.
 *
 * Handles both legacy string[] format and structured [{id, label}] format
 * for backward compatibility during the services/facilities migration.
 */
function tagLabel(item) {
  if (typeof item === 'string') return item;
  return item?.label || '';
}

function tagKey(item, i) {
  if (typeof item === 'string') return item;
  return (item?.id || item?.label) + i;
}

export default function TagList({ tags }) {
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((s, i) => (
        <span
          key={tagKey(s, i)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-700"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> {tagLabel(s)}
        </span>
      ))}
    </div>
  );
}