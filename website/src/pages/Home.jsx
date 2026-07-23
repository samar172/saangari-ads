import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, PlayCircle, Star } from 'lucide-react'
import Reveal from '../components/Reveal.jsx'
import SectionHeading from '../components/SectionHeading.jsx'
import Stats from '../components/Stats.jsx'
import Marquee from '../components/Marquee.jsx'
import Testimonials from '../components/Testimonials.jsx'
import Accordion from '../components/Accordion.jsx'
import TiltCard from '../components/TiltCard.jsx'
import CTA from '../components/CTA.jsx'
import Icon from '../components/Icon.jsx'
import { TreeMark } from '../components/Logo.jsx'
import { faqs, process, projects, services } from '../data/site.js'

const ROTATING = ['Creativity', 'Strategy', 'Craft', 'Results']

export default function Home() {
  return (
    <>
      <Hero />
      <ClientStrip />
      <ServicesPreview />
      <WhyUs />
      <Process />
      <WorkPreview />
      <Testimonials />
      <Faq />
      <CTA />
    </>
  )
}

/* ------------------------------------------------------------------ Hero */

function Hero() {
  const [word, setWord] = useState(0)
  const heroRef = useRef(null)

  useEffect(() => {
    const t = setInterval(() => setWord((w) => (w + 1) % ROTATING.length), 2600)
    return () => clearInterval(t)
  }, [])

  // Cheap parallax: translate the ambient blobs with the pointer.
  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    const onMove = (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2
      const y = (e.clientY / window.innerHeight - 0.5) * 2
      el.style.setProperty('--px', x.toFixed(3))
      el.style.setProperty('--py', y.toFixed(3))
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  return (
    <section
      ref={heroRef}
      className="relative min-h-[100svh] overflow-hidden bg-brand-950 pb-24 pt-36 sm:pt-40"
    >
      {/* ambient field */}
      <div
        className="pointer-events-none absolute -left-32 top-0 h-[38rem] w-[38rem] rounded-full bg-brand-700/40 blur-3xl"
        style={{ transform: 'translate3d(calc(var(--px,0) * 26px), calc(var(--py,0) * 26px), 0)' }}
      />
      <div
        className="pointer-events-none absolute -right-24 top-40 h-[30rem] w-[30rem] animate-float rounded-full bg-gold-600/14 blur-3xl"
        style={{
          transform: 'translate3d(calc(var(--px,0) * -34px), calc(var(--py,0) * -22px), 0)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-grain opacity-[0.06] mix-blend-overlay" />
      <TreeMark className="pointer-events-none absolute right-[-6rem] top-24 h-[34rem] w-[34rem] text-cream-50/[0.045] lg:right-4" />

      <div className="container-x relative grid items-center gap-16 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <Reveal as="p" className="eyebrow-light">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-400" />
            Full-service creative agency · Since 2014
          </Reveal>

          <Reveal
            as="h1"
            delay={90}
            className="mt-8 text-5xl leading-[1.02] text-cream-50 sm:text-6xl lg:text-[5.2rem]"
          >
            Transforming brands
            <br />
            with{' '}
            <span className="relative inline-block align-top">
              {/* rotating word — sized by the longest option so nothing jumps */}
              <span className="invisible font-display" aria-hidden>
                Creativity
              </span>
              {ROTATING.map((w, i) => (
                <span
                  key={w}
                  // The outgoing word clears before the incoming one arrives —
                  // a straight crossfade leaves two words legible at once.
                  className={`absolute inset-0 whitespace-nowrap text-gradient-gold transition-all ${
                    i === word
                      ? 'translate-y-0 opacity-100 blur-0 delay-200 duration-500'
                      : 'pointer-events-none -translate-y-3 opacity-0 blur-[3px] duration-200'
                  }`}
                >
                  {w}
                </span>
              ))}
            </span>
          </Reveal>

          <Reveal
            as="p"
            delay={180}
            className="mt-8 max-w-xl text-base leading-relaxed text-cream-100/65 sm:text-lg"
          >
            Saangari Ads is a Bengaluru-based agency building brands from the roots up — strategy,
            identity, campaigns and performance, all under one roof.
          </Reveal>

          <Reveal delay={260} className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link to="/contact" className="btn-gold">
              Start a project <ArrowUpRight size={17} />
            </Link>
            <Link to="/work" className="btn-light">
              <PlayCircle size={17} /> See our work
            </Link>
          </Reveal>

          <Reveal delay={340} className="mt-12 flex flex-wrap items-center gap-6">
            <div className="flex -space-x-3">
              {['KP', 'MI', 'AD', 'FS'].map((initials, i) => (
                <span
                  key={initials}
                  style={{ zIndex: 10 - i }}
                  className="grid h-11 w-11 place-items-center rounded-full border-2 border-brand-950 bg-gradient-to-br from-gold-500 to-brand-600 text-[11px] font-semibold text-brand-950"
                >
                  {initials}
                </span>
              ))}
            </div>
            <div>
              <div className="flex gap-0.5 text-gold-400">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={14} fill="currentColor" strokeWidth={0} />
                ))}
              </div>
              <p className="mt-1 text-xs text-cream-100/50">
                Trusted by 90+ brands across India
              </p>
            </div>
          </Reveal>
        </div>

        {/* floating highlight cards */}
        <Reveal delay={300} className="relative hidden lg:block">
          <TiltCard className="rounded-[2rem]" max={9}>
            {/* extra bottom padding reserves the band the floating badge sits in */}
            <div className="rounded-[2rem] border border-cream-50/12 bg-cream-50/[0.05] p-8 pb-28 backdrop-blur-md">
              <p className="text-[11px] uppercase tracking-[0.22em] text-gold-300">
                Campaign snapshot
              </p>
              <p className="mt-4 font-display text-3xl text-cream-50">Rooted Organics</p>
              <p className="mt-2 text-sm text-cream-100/55">
                Identity rebuild + retail rollout, 2026
              </p>

              <div className="mt-8 space-y-5">
                {[
                  { label: 'Retail footfall', value: 92 },
                  { label: 'Brand recall', value: 78 },
                  { label: 'Social engagement', value: 86 },
                ].map((bar, i) => (
                  <div key={bar.label}>
                    <div className="flex justify-between text-xs text-cream-100/60">
                      <span>{bar.label}</span>
                      <span className="text-gold-300">+{bar.value}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream-50/10">
                      <div
                        className="h-full origin-left animate-grow rounded-full bg-gradient-to-r from-gold-500 to-brand-400"
                        style={{ width: `${bar.value}%`, animationDelay: `${500 + i * 160}ms` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TiltCard>

          <div className="absolute -bottom-10 -left-12 w-56 animate-float rounded-3xl border border-cream-50/12 bg-brand-900/80 p-6 shadow-lift backdrop-blur-md">
            <p className="font-display text-4xl text-gradient-gold">240+</p>
            <p className="mt-1 text-xs text-cream-100/55">campaigns delivered end to end</p>
          </div>
        </Reveal>
      </div>

      {/* scroll cue */}
      <div className="absolute inset-x-0 bottom-10 hidden justify-center lg:flex">
        <span className="flex flex-col items-center gap-3 text-[10px] uppercase tracking-[0.28em] text-cream-100/35">
          Scroll
          <span className="relative h-12 w-px overflow-hidden bg-cream-50/15">
            <span className="absolute inset-x-0 top-0 h-4 animate-scrollcue bg-gold-400" />
          </span>
        </span>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold-500/40 to-transparent" />
    </section>
  )
}

/* ------------------------------------------------------------ Client row */

function ClientStrip() {
  return (
    <section className="border-b border-brand-900/10 bg-cream-100 py-12">
      <p className="container-x mb-8 text-center text-[11px] uppercase tracking-[0.24em] text-ink/35">
        Brands that grew with us
      </p>
      <Marquee />
    </section>
  )
}

/* -------------------------------------------------------------- Services */

function ServicesPreview() {
  return (
    <section className="container-x py-24 sm:py-32">
      <div className="flex flex-wrap items-end justify-between gap-8">
        <SectionHeading
          eyebrow="What we do"
          title="Everything a brand needs, under one roof"
          text="Six practices that work as one team — so strategy, creative and media never argue in different rooms."
        />
        <Reveal delay={200}>
          <Link to="/services" className="btn-ghost">
            All services <ArrowRight size={16} />
          </Link>
        </Reveal>
      </div>

      <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {services.map((s, i) => (
          <Reveal key={s.title} delay={i * 80}>
            <TiltCard className="h-full rounded-3xl">
              <article className="card card-hover h-full overflow-hidden p-8">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-700 transition-all duration-500 group-hover:scale-110 group-hover:bg-brand-700 group-hover:text-cream-50">
                  <Icon name={s.icon} size={24} strokeWidth={1.6} />
                </span>
                <h3 className="mt-6 text-2xl text-ink">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink/55">{s.blurb}</p>
                <ul className="mt-6 space-y-2">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-xs text-ink/50">
                      <span className="h-1 w-1 rounded-full bg-gold-500" />
                      {p}
                    </li>
                  ))}
                </ul>
                <span className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
                  Learn more
                  <ArrowRight
                    size={15}
                    className="transition-transform duration-300 group-hover:translate-x-1"
                  />
                </span>
              </article>
            </TiltCard>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- Why us */

function WhyUs() {
  return (
    <section className="container-x pb-8">
      <Reveal>
        <Stats />
      </Reveal>
    </section>
  )
}

/* --------------------------------------------------------------- Process */

function Process() {
  return (
    <section className="container-x py-24 sm:py-32">
      <SectionHeading
        align="center"
        eyebrow="How we work"
        title="A process with no black boxes"
        text="Four stages, fixed checkpoints, and a client who always knows exactly where things stand."
      />

      <div className="relative mt-20 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        {/* connector line on wide screens */}
        <div className="pointer-events-none absolute inset-x-12 top-9 hidden h-px bg-gradient-to-r from-transparent via-brand-700/25 to-transparent lg:block" />
        {process.map((p, i) => (
          <Reveal key={p.step} delay={i * 110} className="group relative text-center">
            <span className="relative z-10 mx-auto grid h-20 w-20 place-items-center rounded-full border border-brand-700/20 bg-cream-50 font-display text-2xl text-brand-700 shadow-soft transition-all duration-500 group-hover:-translate-y-1.5 group-hover:border-transparent group-hover:bg-brand-700 group-hover:text-cream-50 group-hover:shadow-lift">
              {p.step}
            </span>
            <h3 className="mt-7 text-2xl text-ink">{p.title}</h3>
            <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-ink/55">{p.text}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ Work */

function WorkPreview() {
  return (
    <section className="bg-cream-200/60 py-24 sm:py-32">
      <div className="container-x">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <SectionHeading
            eyebrow="Selected work"
            title="Ideas that earned their keep"
            text="A few recent projects — and the numbers they moved."
          />
          <Reveal delay={200}>
            <Link to="/work" className="btn-ghost">
              View all work <ArrowRight size={16} />
            </Link>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.slice(0, 3).map((p, i) => (
            <Reveal key={p.title} delay={i * 100}>
              <Link
                to="/work"
                className="group block overflow-hidden rounded-3xl border border-brand-900/10 bg-cream-50 shadow-soft transition-all duration-500 hover:-translate-y-2 hover:shadow-lift"
              >
                <div
                  className={`relative h-56 overflow-hidden bg-gradient-to-br ${p.tone}`}
                >
                  <TreeMark className="absolute -right-6 -top-6 h-48 w-48 text-cream-50/10 transition-transform duration-700 group-hover:rotate-12 group-hover:scale-110" />
                  <span className="absolute left-5 top-5 rounded-full bg-cream-50/15 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-cream-50 backdrop-blur">
                    {p.category}
                  </span>
                  <span className="absolute bottom-5 left-5 font-display text-3xl text-cream-50">
                    {p.title}
                  </span>
                </div>
                <div className="p-7">
                  <p className="text-sm leading-relaxed text-ink/55">{p.text}</p>
                  <div className="mt-5 flex items-center justify-between border-t border-brand-900/10 pt-5">
                    <span className="text-sm font-semibold text-brand-700">{p.result}</span>
                    <ArrowUpRight
                      size={18}
                      className="text-brand-700 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1"
                    />
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------- FAQ */

function Faq() {
  return (
    <section className="container-x py-24 sm:py-32">
      <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionHeading
          eyebrow="Questions"
          title="The things clients ask first"
          text="If your question is not here, ask it directly — we answer every enquiry within a working day."
        />
        <Reveal delay={120}>
          <Accordion items={faqs} />
        </Reveal>
      </div>
    </section>
  )
}
