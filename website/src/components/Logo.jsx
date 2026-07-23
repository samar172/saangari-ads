import { Link } from 'react-router-dom'

/**
 * Inline SVG rendition of the Saangari tree mark, so the logo stays crisp and
 * recolours with `currentColor` instead of shipping a 500KB PNG in the nav.
 */
export function TreeMark({ className = 'h-10 w-10' }) {
  // Deterministic leaf cloud — polar scatter around the canopy centre.
  const leaves = []
  const rings = [
    { count: 7, r: 9, s: 3.1 },
    { count: 13, r: 16, s: 3.0 },
    { count: 18, r: 23, s: 2.8 },
    { count: 22, r: 30, s: 2.5 },
  ]
  rings.forEach((ring, ri) => {
    for (let i = 0; i < ring.count; i++) {
      const a = (i / ring.count) * Math.PI * 2 + ri * 0.42
      const cx = 50 + Math.cos(a) * ring.r
      const cy = 36 + Math.sin(a) * ring.r * 0.86
      leaves.push(
        <ellipse
          key={`${ri}-${i}`}
          cx={cx}
          cy={cy}
          rx={ring.s}
          ry={ring.s * 1.85}
          transform={`rotate(${(a * 180) / Math.PI + 90} ${cx} ${cy})`}
        />
      )
    }
  })

  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" aria-hidden="true">
      <g>{leaves}</g>
      {/* branches */}
      <path
        d="M50 40 L50 62 M50 46 L38 34 M50 46 L62 34 M50 54 L40 44 M50 54 L60 44 M50 36 L44 26 M50 36 L56 26"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      />
      {/* trunk */}
      <path d="M46.6 52 q3.4 14 -6 30 q9.4 2.5 19 0 q-9.4 -16 -6 -30 z" />
    </svg>
  )
}

export default function Logo({ tone = 'dark', compact = false }) {
  const isDark = tone === 'dark'
  return (
    <Link
      to="/"
      className="group flex items-center gap-3"
      aria-label="Saangari Ads Private Limited — home"
    >
      <span
        className={`grid place-items-center rounded-2xl transition-all duration-500 group-hover:rotate-3 group-hover:scale-105 ${
          compact ? 'h-10 w-10' : 'h-12 w-12'
        } ${isDark ? 'bg-brand-700 text-cream-50 shadow-soft' : 'bg-cream-50/12 text-cream-50 backdrop-blur ring-1 ring-cream-50/25'}`}
      >
        <TreeMark className={compact ? 'h-6 w-6' : 'h-7 w-7'} />
      </span>
      <span className="leading-none">
        <span
          className={`block font-display text-[1.45rem] font-semibold tracking-[0.14em] ${
            isDark ? 'text-brand-800' : 'text-cream-50'
          }`}
        >
          SAANGARI
        </span>
        <span
          className={`mt-1 block text-[8.5px] font-medium uppercase tracking-[0.34em] ${
            isDark ? 'text-ink/45' : 'text-gold-300'
          }`}
        >
          Ads Private Limited
        </span>
      </span>
    </Link>
  )
}
