import { Info } from 'lucide-react';

// MandatoryLabel — displays a field label with an asterisk for mandatory fields
// and an accessible tooltip explaining "* means mandatory".
// Accessible by mouse (hover), keyboard (focus), and assistive technology (aria).
// MandatoryLabel — field label with an asterisk for mandatory fields and
// an accessible information tooltip. Pass `tooltip` to populate the tooltip
// with field-specific guidance (e.g. the meaning of a name field); when
// omitted it defaults to the generic "* means mandatory" explanation.
export default function MandatoryLabel({ children, required = false, htmlFor, className = '', tooltip }) {
  const tooltipText = tooltip || '* means mandatory';
  const ariaText = tooltip || 'This field is mandatory. Asterisk means mandatory.';
  return (
    <label htmlFor={htmlFor} className={`block text-sm font-medium text-stone-700 mb-1.5 ${className}`}>
      <span className="group inline-flex items-center gap-1">
        {children}
        {required && (
          <span className="text-indigo-600 font-semibold" aria-hidden="true">*</span>
        )}
        {required && (
          <span className="relative inline-flex">
            <Info
              className="w-3.5 h-3.5 text-stone-400 cursor-help"
              tabIndex={0}
              aria-label={ariaText}
            />
            <span
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-stone-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none whitespace-normal w-48 text-left z-20"
              role="tooltip"
            >
              {tooltipText}
            </span>
          </span>
        )}
      </span>
    </label>
  );
}