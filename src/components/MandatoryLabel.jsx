import { Info } from 'lucide-react';

// MandatoryLabel — displays a field label with an asterisk for mandatory fields
// and an accessible tooltip explaining "* means mandatory".
// Accessible by mouse (hover), keyboard (focus), and assistive technology (aria).
export default function MandatoryLabel({ children, required = false, htmlFor, className = '' }) {
  return (
    <label htmlFor={htmlFor} className={`block text-sm font-medium text-stone-700 mb-1.5 ${className}`}>
      <span className="inline-flex items-center gap-1">
        {children}
        {required && (
          <span className="text-indigo-600 font-semibold" aria-hidden="true">*</span>
        )}
        {required && (
          <span className="relative inline-flex">
            <Info
              className="w-3.5 h-3.5 text-stone-400 cursor-help"
              tabIndex={0}
              aria-label="This field is mandatory. Asterisk means mandatory."
            />
            <span
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-stone-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20"
              role="tooltip"
              id="mandatory-tooltip"
            >
              * means mandatory
            </span>
          </span>
        )}
      </span>
    </label>
  );
}