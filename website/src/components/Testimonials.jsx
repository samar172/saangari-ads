import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Quote, Star } from 'lucide-react'
import SectionHeading from './SectionHeading.jsx'
import Reveal from './Reveal.jsx'
import { testimonials } from '../data/site.js'

export default function Testimonials() {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = testimonials.length

  const go = useCallback((dir) => setI((v) => (v + dir + count) % count), [count])

  useEffect(() => {
    if (paused) return
    const t = setInterval(() => go(1), 6000)
    return () => clearInterval(t)
  }, [paused, go])

  // Arrow-key control when the carousel has focus.
  const onKey = (e) => {
    if (e.key === 'ArrowRight') go(1)
    if (e.key === 'ArrowLeft') go(-1)
  }

  return (
    <section className="relative overflow-hidden bg-brand-950 py-24 sm:py-32">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-brand-700/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-10 h-80 w-80 animate-drift rounded-full bg-gold-600/10 blur-3xl" />

      <div className="container-x relative">
        <SectionHeading
          align="center"
          tone="light"
          eyebrow="Testimonials"
          title="The people we build with"
          text="Long relationships, straight talk and results our clients are happy to put their name to."
        />

        <Reveal
          delay={120}
          className="mt-14"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <div
            tabIndex={0}
            onKeyDown={onKey}
            role="group"
            aria-roledescription="carousel"
            aria-label="Client testimonials"
            className="relative mx-auto max-w-4xl rounded-[2rem] border border-cream-50/12 bg-cream-50/[0.04] p-8 backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 sm:p-14"
          >
            <Quote
              size={64}
              className="absolute -top-6 left-8 text-gold-500/25"
              strokeWidth={1.2}
            />

            <div className="relative min-h-[16rem] sm:min-h-[13rem]">
              {testimonials.map((t, idx) => (
                <figure
                  key={t.name}
                  aria-hidden={idx !== i}
                  className={`transition-all duration-700 ${
                    idx === i
                      ? 'relative opacity-100 blur-0'
                      : 'pointer-events-none absolute inset-0 translate-y-4 opacity-0 blur-sm'
                  }`}
                >
                  <div className="flex gap-1 text-gold-400">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Star key={s} size={16} fill="currentColor" strokeWidth={0} />
                    ))}
                  </div>
                  <blockquote className="mt-6 font-display text-2xl leading-snug text-cream-50 sm:text-[2rem]">
                    “{t.quote}”
                  </blockquote>
                  <figcaption className="mt-8 flex items-center gap-4">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-gold-500 to-brand-700 text-sm font-semibold text-brand-950">
                      {t.name
                        .split(' ')
                        .map((w) => w[0])
                        .join('')}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-cream-50">{t.name}</span>
                      <span className="block text-xs text-cream-100/50">{t.role}</span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>

            <div className="mt-10 flex items-center justify-between border-t border-cream-50/10 pt-6">
              <div className="flex gap-2">
                {testimonials.map((t, idx) => (
                  <button
                    key={t.name}
                    onClick={() => setI(idx)}
                    aria-label={`Show testimonial ${idx + 1}`}
                    aria-current={idx === i}
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      idx === i ? 'w-10 bg-gold-500' : 'w-4 bg-cream-50/25 hover:bg-cream-50/50'
                    }`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <CarouselBtn onClick={() => go(-1)} label="Previous testimonial">
                  <ArrowLeft size={17} />
                </CarouselBtn>
                <CarouselBtn onClick={() => go(1)} label="Next testimonial">
                  <ArrowRight size={17} />
                </CarouselBtn>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function CarouselBtn({ onClick, label, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="grid h-11 w-11 place-items-center rounded-full border border-cream-50/20 text-cream-100/80 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold-500 hover:bg-gold-500 hover:text-brand-950"
    >
      {children}
    </button>
  )
}
