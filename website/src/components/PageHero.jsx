import { Link, useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import Reveal from './Reveal.jsx'
import { TreeMark } from './Logo.jsx'

/** Compact hero used by every page except the landing page. */
export default function PageHero({ eyebrow, title, text }) {
  const { pathname } = useLocation()
  const crumb = pathname.replace('/', '') || 'home'

  return (
    <section className="relative overflow-hidden bg-brand-950 pb-24 pt-40 sm:pb-32 sm:pt-48">
      <div className="pointer-events-none absolute -left-24 top-10 h-96 w-96 animate-drift rounded-full bg-brand-700/35 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-32 h-80 w-80 animate-float rounded-full bg-gold-600/12 blur-3xl" />
      <TreeMark className="pointer-events-none absolute -right-16 -top-10 h-[26rem] w-[26rem] text-cream-50/[0.035]" />

      <div className="container-x relative">
        <Reveal
          as="nav"
          className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-cream-100/40"
        >
          <Link to="/" className="transition-colors hover:text-gold-300">
            Home
          </Link>
          <ChevronRight size={13} />
          <span className="text-gold-300">{crumb}</span>
        </Reveal>

        <Reveal as="p" delay={60} className="eyebrow-light mt-8">
          <span className="h-1 w-1 rounded-full bg-current" />
          {eyebrow}
        </Reveal>

        <Reveal
          as="h1"
          delay={130}
          className="mt-6 max-w-4xl text-5xl leading-[1.02] text-cream-50 sm:text-6xl lg:text-7xl"
        >
          {title}
        </Reveal>

        {text && (
          <Reveal
            as="p"
            delay={210}
            className="mt-7 max-w-2xl text-base leading-relaxed text-cream-100/60 sm:text-lg"
          >
            {text}
          </Reveal>
        )}
      </div>

      {/* hairline finish — a cream gradient over the maroon reads muddy */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold-500/40 to-transparent" />
    </section>
  )
}
