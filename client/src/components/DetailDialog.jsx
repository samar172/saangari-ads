import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft } from 'lucide-react';

// The ~90% detail dialog: 90vw × 90vh centred from `md` up, a full-screen sheet
// on a phone. Sticky header (title, headline figure, what it includes) and an
// optional footer, with only the middle scrolling. Lay the body out with
// DETAIL_GRID so it sits in columns on desktop and stacks on a phone.
// grid-cols-1 + min-w-0 keep wide tables scrolling inside their card, not the page.
export const DETAIL_GRID = 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0';

// `onBack` + `backLabel` add a "← Back to …" link above the title (drill-down stacks).
export default function DetailDialog({ open, onClose, title, headline, explain, footer, onBack, backLabel, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    // Lock the page behind the dialog so only the dialog body scrolls.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;

  // Portalled to <body> so the app shell's sidebar/header stacking can't sit above it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-white md:h-[90vh] md:w-[90vw] md:rounded-xl md:border md:border-slate-200 md:shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-slate-200 px-4 py-3 md:px-6 md:py-4">
          <div className="min-w-0 flex-1">
            {onBack && (
              <button onClick={onBack} data-drill-back className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                <ArrowLeft size={13} /> Back to {backLabel}
              </button>
            )}
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
            {headline != null && <div className="mt-0.5 text-2xl font-bold text-slate-800 md:text-3xl">{headline}</div>}
            {explain && <div className="mt-1 text-xs text-slate-500 md:text-sm">{explain}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 p-4 md:p-6">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 md:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
