import { clients } from '../data/site.js'

/** Infinite client-logo strip. Duplicated once so the loop is seamless. */
export default function Marquee({ tone = 'light' }) {
  const light = tone === 'light'
  const row = [...clients, ...clients]
  return (
    <div className="mask-fade-x overflow-hidden">
      <div className="paused flex w-max animate-marquee items-center gap-14">
        {row.map((name, i) => (
          <span
            key={`${name}-${i}`}
            className={`whitespace-nowrap font-display text-2xl tracking-[0.2em] transition-colors duration-300 sm:text-3xl ${
              light
                ? 'text-ink/25 hover:text-brand-700'
                : 'text-cream-100/25 hover:text-gold-400'
            }`}
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}
