// FieldError — displays a field-level validation error message.
// Used when a mandatory field is missing on Continue attempt.
export default function FieldError({ error, id }) {
  if (!error) return null;
  return (
    <p
      id={id}
      role="alert"
      className="text-sm text-red-600 mt-1.5 flex items-center gap-1"
    >
      {error}
    </p>
  );
}