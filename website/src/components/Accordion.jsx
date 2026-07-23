import { useState } from 'react'
import { Plus } from 'lucide-react'

export default function Accordion({ items }) {
  const [open, setOpen] = useState(0)

  return (
    <div className="divide-y divide-brand-900/10 overflow-hidden rounded-3xl border border-brand-900/10 bg-cream-50">
      {items.map((item, i) => {
        const isOpen = open === i
        return (
          <div key={item.q}>
            <button
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-6 px-6 py-6 text-left transition-colors duration-300 hover:bg-brand-50/60 sm:px-8"
            >
              <span
                className={`font-display text-xl transition-colors sm:text-2xl ${
                  isOpen ? 'text-brand-700' : 'text-ink'
                }`}
              >
                {item.q}
              </span>
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-all duration-400 ${
                  isOpen
                    ? 'rotate-[135deg] border-brand-700 bg-brand-700 text-cream-50'
                    : 'border-brand-900/20 text-brand-700'
                }`}
              >
                <Plus size={17} />
              </span>
            </button>
            <div
              className="grid transition-all duration-500 ease-out"
              style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <p className="px-6 pb-7 text-sm leading-relaxed text-ink/60 sm:px-8 sm:text-base">
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
