import { EditPencil } from './EditPencil';

/**
 * Shared profile section card — title + optional edit pencil + content.
 * Used by Personal, Professional, and Business profile views.
 */
export default function ProfileSection({ title, onEdit, children }) {
  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide">{title}</h2>
        {onEdit && <EditPencil onClick={onEdit} label={`Edit ${title.toLowerCase()}`} />}
      </div>
      {children}
    </section>
  );
}