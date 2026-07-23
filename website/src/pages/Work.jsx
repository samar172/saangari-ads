import { useMemo, useState } from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import PageHero from '../components/PageHero.jsx'
import SectionHeading from '../components/SectionHeading.jsx'
import Reveal from '../components/Reveal.jsx'
import Stats from '../components/Stats.jsx'
import Testimonials from '../components/Testimonials.jsx'
import CTA from '../components/CTA.jsx'
import { TreeMark } from '../components/Logo.jsx'
import { projects } from '../data/site.js'

const FILTERS = ['All', 'Branding', 'Campaign', 'Digital']

export default function Work() {
  const [filter, setFilter] = useState('All')
  const [open, setOpen] = useState(null)

  const shown = useMemo(
    () => (filter === 'All' ? projects : projects.filter((p) => p.category === filter)),
    [filter]
  )

  return (
    <>
      <PageHero
        eyebrow="Our work"
        title="Campaigns we would put our name on. So we did."
        text="Identity systems, launch campaigns and always-on digital — a cross-section of what the last two years looked like."
      />

      <section className="container-x py-24 sm:py-32">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <SectionHeading eyebrow="Portfolio" title="Filter by what you need" />
          <Reveal delay={140} className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] transition-all duration-300 ${
                  filter === f
                    ? 'border-brand-700 bg-brand-700 text-cream-50 shadow-soft'
                    : 'border-brand-900/15 bg-cream-50 text-ink/55 hover:-translate-y-0.5 hover:border-brand-700/40 hover:text-brand-700'
                }`}
              >
                {f}
              </button>
            ))}
          </Reveal>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {shown.map((p, i) => (
            <Reveal key={p.title} delay={i * 70}>
              <button
                onClick={() => setOpen(p)}
                className="group block w-full overflow-hidden rounded-3xl border border-brand-900/10 bg-cream-50 text-left shadow-soft transition-all duration-500 hover:-translate-y-2 hover:shadow-lift"
              >
                <div className={`relative h-64 overflow-hidden bg-gradient-to-br ${p.tone}`}>
                  <TreeMark className="absolute -right-8 -top-8 h-56 w-56 text-cream-50/10 transition-transform duration-700 group-hover:rotate-12 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-ink/0 transition-colors duration-500 group-hover:bg-ink/25" />
                  <span className="absolute left-5 top-5 rounded-full bg-cream-50/15 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-cream-50 backdrop-blur">
                    {p.category} · {p.year}
                  </span>
                  <span className="absolute bottom-5 left-5 font-display text-3xl text-cream-50">
                    {p.title}
                  </span>
                  <span className="absolute bottom-5 right-5 grid h-10 w-10 translate-y-3 place-items-center rounded-full bg-cream-50 text-brand-800 opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                    <ArrowUpRight size={18} />
                  </span>
                </div>
                <div className="p-7">
                  <p className="text-sm leading-relaxed text-ink/55">{p.text}</p>
                  <p className="mt-5 border-t border-brand-900/10 pt-5 text-sm font-semibold text-brand-700">
                    {p.result}
                  </p>
                </div>
              </button>
            </Reveal>
          ))}
        </div>

        {shown.length === 0 && (
          <p className="mt-16 text-center text-ink/40">Nothing in this category yet.</p>
        )}
      </section>

      <section className="container-x pb-24 sm:pb-32">
        <Reveal>
          <Stats />
        </Reveal>
      </section>

      <Testimonials />
      <CTA />

      <CaseModal project={open} onClose={() => setOpen(null)} />
    </>
  )
}

/** Lightweight case-study lightbox — content is static, purely a UI showcase. */
function CaseModal({ project, onClose }) {
  if (!project) return null
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-ink/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-up max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-cream-50 shadow-lift"
      >
        <div className={`relative h-56 bg-gradient-to-br ${project.tone}`}>
          <TreeMark className="absolute -right-6 -top-6 h-52 w-52 text-cream-50/10" />
          <button
            onClick={onClose}
            aria-label="Close case study"
            className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-cream-50/15 text-cream-50 backdrop-blur transition-colors hover:bg-cream-50 hover:text-brand-800"
          >
            <X size={18} />
          </button>
          <span className="absolute bottom-6 left-7 font-display text-4xl text-cream-50">
            {project.title}
          </span>
        </div>
        <div className="p-8 sm:p-10">
          <div className="flex flex-wrap gap-2">
            {[project.category, project.year, project.result].map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-700"
              >
                {tag}
              </span>
            ))}
          </div>
          <p className="mt-6 text-base leading-relaxed text-ink/65">{project.text}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { k: 'Scope', v: 'Strategy, identity, campaign' },
              { k: 'Duration', v: '10 weeks' },
              { k: 'Outcome', v: project.result },
            ].map((row) => (
              <div key={row.k} className="rounded-2xl border border-brand-900/10 p-5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-ink/40">{row.k}</p>
                <p className="mt-2 text-sm font-medium text-ink">{row.v}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-xs text-ink/35">
            Full case study available on request during your first call.
          </p>
        </div>
      </div>
    </div>
  )
}
