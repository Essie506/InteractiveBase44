/**
 * Displays a list of tag pills (services, interests, etc.).
 * Shared across all Interactive profile types.
 */
export default function TagList({ tags }) {
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-700"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> {s}
        </span>
      ))}
    </div>
  );
}