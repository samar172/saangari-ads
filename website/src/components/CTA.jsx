import { Link } from 'react-router-dom'
import { ArrowUpRight, Phone } from 'lucide-react'
import Reveal from './Reveal.jsx'
import { TreeMark } from './Logo.jsx'
import { company } from '../data/site.js'

export default function CTA() {
  return (
    <section className="container-x py-24 sm:py-32">
      <Reveal className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 px-8 py-20 text-center shadow-lift sm:px-16">
        <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 animate-float rounded-full bg-gold-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-10 h-80 w-80 animate-drift rounded-full bg-cream-50/10 blur-3xl" />
        <TreeMark className="pointer-events-none absolute left-1/2 top-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 text-cream-50/[0.04]" />

        <div className="relative">
          <p className="eyebrow-light mx-auto">Let’s begin</p>
          <h2 className="mx-auto mt-6 max-w-3xl text-4xl leading-[1.08] text-cream-50 sm:text-5xl lg:text-6xl">
            Your brand deserves more than <span className="text-gradient-gold">another ad</span>.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-cream-100/65">
            Tell us what you are building. We will come back within one working day with a point of
            view — free, and specific to you.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link to="/contact" className="btn-gold">
              Start a project <ArrowUpRight size={17} />
            </Link>
            <a href={`tel:${company.phone.replace(/\s/g, '')}`} className="btn-light">
              <Phone size={16} /> {company.phone}
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
