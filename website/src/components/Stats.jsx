import { useEffect, useRef, useState } from 'react'
import { stats } from '../data/site.js'

/** Counts up from 0 to `value` the first time it scrolls into view. */
function Counter({ value, suffix }) {
  const [n, setN] = useState(0)
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        io.disconnect()
        const duration = 1600
        let start
        const tick = (t) => {
          if (start === undefined) start = t
          const p = Math.min((t - start) / duration, 1)
          // easeOutExpo
          const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p)
          setN(Math.round(eased * value))
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      },
      { threshold: 0.4 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [value])

  return (
    // No tabular-nums here: the display serif's tabular figures are very wide
    // and read as "1 2" rather than "12".
    <span ref={ref}>
      {n}
      {suffix}
    </span>
  )
}

export default function Stats({ tone = 'light' }) {
  const light = tone === 'light'
  return (
    <div
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-3xl lg:grid-cols-4 ${
        light ? 'bg-brand-900/10' : 'bg-cream-50/15'
      }`}
    >
      {stats.map((s) => (
        <div
          key={s.label}
          className={`group px-6 py-10 text-center transition-colors duration-500 sm:px-8 ${
            light ? 'bg-cream-50 hover:bg-brand-50' : 'bg-brand-950 hover:bg-brand-900'
          }`}
        >
          <p
            className={`font-display text-5xl font-semibold transition-transform duration-500 group-hover:scale-105 sm:text-6xl ${
              light ? 'text-gradient' : 'text-gradient-gold'
            }`}
          >
            <Counter value={s.value} suffix={s.suffix} />
          </p>
          <p
            className={`mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] ${
              light ? 'text-ink/45' : 'text-cream-100/50'
            }`}
          >
            {s.label}
          </p>
        </div>
      ))}
    </div>
  )
}
