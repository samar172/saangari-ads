import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Check } from 'lucide-react'
import PageHero from '../components/PageHero.jsx'
import SectionHeading from '../components/SectionHeading.jsx'
import Reveal from '../components/Reveal.jsx'
import TiltCard from '../components/TiltCard.jsx'
import Accordion from '../components/Accordion.jsx'
import Marquee from '../components/Marquee.jsx'
import CTA from '../components/CTA.jsx'
import Icon from '../components/Icon.jsx'
import { faqs, process, services } from '../data/site.js'

const packages = [
  {
    name: 'Launch',
    price: '₹1.2L',
    cadence: 'per project',
    for: 'New brands finding their feet',
    features: [
      'Brand positioning workshop',
      'Logo & identity system',
      'Brand guidelines PDF',
      'Launch campaign concept',
      '4 weeks delivery',
    ],
  },
  {
    name: 'Growth',
    price: '₹85K',
    cadence: 'per month',
    for: 'Brands ready to scale spend',
    featured: true,
    features: [
      'Everything in Launch, ongoing',
      'Paid social & search management',
      '12 creative assets a month',
      'Landing pages & CRO',
      'Live dashboard + monthly review',
      'Dedicated strategist',
    ],
  },
  {
    name: 'Partner',
    price: 'Custom',
    cadence: 'retainer',
    for: 'Established brands, full remit',
    features: [
      'Everything in Growth',
      'Film & photography production',
      'OOH, print and media buying',
      'Quarterly growth sprints',
      'Embedded on-site team days',
    ],
  },
]

export default function Services() {
  return (
    <>
      <PageHero
        eyebrow="Services"
        title="Six practices. One team. Zero handoffs."
        text="Pick one capability or hand us the whole remit — either way, the same people stay accountable from the first workshop to the monthly report."
      />

      <ServiceList />

      <section className="border-y border-brand-900/10 bg-cream-200/50 py-14">
        <Marquee />
      </section>

      <ProcessStrip />
      <Packages />

      <section className="container-x pb-24 sm:pb-32">
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHeading
            eyebrow="Questions"
            title="Before you get in touch"
            text="The answers we give most often — plainly, without the agency jargon."
          />
          <Reveal delay={120}>
            <Accordion items={faqs} />
          </Reveal>
        </div>
      </section>

      <CTA />
    </>
  )
}

function ServiceList() {
  const [active, setActive] = useState(0)

  return (
    <section className="container-x py-24 sm:py-32">
      <SectionHeading
        eyebrow="Capabilities"
        title="What we can take off your plate"
        text="Hover a card to see the detail — or jump straight to the one you came for."
      />

      {/* quick-jump chips */}
      <Reveal delay={120} className="mt-10 flex flex-wrap gap-2">
        {services.map((s, i) => (
          <button
            key={s.title}
            onClick={() => setActive(i)}
            className={`rounded-full border px-5 py-2.5 text-xs font-semibold transition-all duration-300 ${
              active === i
                ? 'border-brand-700 bg-brand-700 text-cream-50 shadow-soft'
                : 'border-brand-900/15 bg-cream-50 text-ink/60 hover:-translate-y-0.5 hover:border-brand-700/40 hover:text-brand-700'
            }`}
          >
            {s.title}
          </button>
        ))}
      </Reveal>

      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {services.map((s, i) => (
          <Reveal key={s.title} delay={i * 70}>
            <TiltCard className="h-full rounded-3xl">
              <article
                onMouseEnter={() => setActive(i)}
                className={`card card-hover h-full p-8 ${
                  active === i ? 'border-brand-700/35 shadow-lift ring-1 ring-brand-700/10' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={`grid h-14 w-14 place-items-center rounded-2xl transition-all duration-500 ${
                      active === i
                        ? 'scale-110 bg-brand-700 text-cream-50'
                        : 'bg-brand-50 text-brand-700'
                    }`}
                  >
                    <Icon name={s.icon} size={24} strokeWidth={1.6} />
                  </span>
                  <span className="font-display text-4xl text-brand-900/10">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="mt-6 text-2xl text-ink">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink/55">{s.blurb}</p>
                <ul className="mt-6 space-y-2.5 border-t border-brand-900/10 pt-6">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-sm text-ink/60">
                      <Check size={15} className="mt-0.5 shrink-0 text-gold-500" />
                      {p}
                    </li>
                  ))}
                </ul>
              </article>
            </TiltCard>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function ProcessStrip() {
  return (
    <section className="relative overflow-hidden bg-brand-950 py-24 sm:py-32">
      <div className="pointer-events-none absolute -left-20 top-10 h-96 w-96 animate-drift rounded-full bg-brand-700/30 blur-3xl" />
      <div className="container-x relative">
        <SectionHeading
          align="center"
          tone="light"
          eyebrow="Engagement"
          title="What working together looks like"
        />
        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {process.map((p, i) => (
            <Reveal key={p.step} delay={i * 100}>
              <div className="group h-full rounded-3xl border border-cream-50/12 bg-cream-50/[0.04] p-8 backdrop-blur-sm transition-all duration-500 hover:-translate-y-2 hover:border-gold-500/40 hover:bg-cream-50/[0.07]">
                <span className="font-display text-5xl text-gradient-gold">{p.step}</span>
                <h3 className="mt-5 text-2xl text-cream-50">{p.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-cream-100/55">{p.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function Packages() {
  return (
    <section className="container-x py-24 sm:py-32">
      <SectionHeading
        align="center"
        eyebrow="Engagement models"
        title="Simple ways to start"
        text="Indicative scopes and pricing. Every real proposal is built around your brief — these are just the usual shapes."
      />

      <div className="mt-16 grid gap-6 lg:grid-cols-3">
        {packages.map((p, i) => (
          <Reveal key={p.name} delay={i * 100}>
            <article
              className={`relative flex h-full flex-col overflow-hidden rounded-3xl p-8 transition-all duration-500 hover:-translate-y-2 ${
                p.featured
                  ? 'bg-gradient-to-br from-brand-700 to-brand-950 text-cream-50 shadow-lift lg:-mt-4 lg:pb-12'
                  : 'card card-hover'
              }`}
            >
              {p.featured && (
                <span className="absolute right-6 top-6 rounded-full bg-gold-500 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-950">
                  Most chosen
                </span>
              )}
              <h3 className={`text-3xl ${p.featured ? 'text-cream-50' : 'text-ink'}`}>{p.name}</h3>
              <p className={`mt-1 text-xs ${p.featured ? 'text-cream-100/55' : 'text-ink/45'}`}>
                {p.for}
              </p>
              <p className="mt-7 flex items-baseline gap-2">
                <span
                  className={`font-display text-5xl ${p.featured ? 'text-gradient-gold' : 'text-gradient'}`}
                >
                  {p.price}
                </span>
                <span className={`text-xs ${p.featured ? 'text-cream-100/50' : 'text-ink/40'}`}>
                  {p.cadence}
                </span>
              </p>
              <ul
                className={`mt-7 flex-1 space-y-3 border-t pt-7 ${
                  p.featured ? 'border-cream-50/15' : 'border-brand-900/10'
                }`}
              >
                {p.features.map((f) => (
                  <li
                    key={f}
                    className={`flex items-start gap-2.5 text-sm ${
                      p.featured ? 'text-cream-100/70' : 'text-ink/60'
                    }`}
                  >
                    <Check size={15} className="mt-0.5 shrink-0 text-gold-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/contact"
                className={`mt-9 w-full ${p.featured ? 'btn-gold' : 'btn-ghost'}`}
              >
                Get a proposal <ArrowUpRight size={16} />
              </Link>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
