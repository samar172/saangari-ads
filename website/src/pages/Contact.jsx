import { useState } from 'react'
import { CheckCircle2, Clock, Loader2, Mail, MapPin, Phone, Send } from 'lucide-react'
import PageHero from '../components/PageHero.jsx'
import SectionHeading from '../components/SectionHeading.jsx'
import Reveal from '../components/Reveal.jsx'
import Accordion from '../components/Accordion.jsx'
import { TreeMark } from '../components/Logo.jsx'
import { company, faqs, services } from '../data/site.js'

const BUDGETS = ['Under ₹1L', '₹1L – ₹5L', '₹5L – ₹15L', '₹15L+']

const EMPTY = { name: '', email: '', company: '', service: '', budget: '', message: '' }

export default function Contact() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Tell us what you are building."
        text="One form, one working day, one honest point of view on your brief. No sales sequence, no chasing."
      />

      <section className="container-x py-24 sm:py-32">
        <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          <ContactForm />
          <Sidebar />
        </div>
      </section>

      <MapStrip />

      <section className="container-x py-24 sm:py-32">
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHeading
            eyebrow="Good to know"
            title="Answers before you ask"
            text="Still unsure whether we are the right fit? These usually settle it."
          />
          <Reveal delay={120}>
            <Accordion items={faqs} />
          </Reveal>
        </div>
      </section>
    </>
  )
}

/* ------------------------------------------------------------------ Form */

function ContactForm() {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [state, setState] = useState('idle') // idle | sending | sent

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((v) => ({ ...v, [k]: undefined }))
  }

  const validate = () => {
    const next = {}
    if (!form.name.trim()) next.name = 'Please tell us your name'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'A valid email, please'
    if (form.message.trim().length < 12) next.message = 'A line or two more would help'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = (e) => {
    e.preventDefault()
    if (!validate()) return
    setState('sending')
    // No backend on this site — simulate the round trip so the UI reads true.
    setTimeout(() => setState('sent'), 1100)
  }

  if (state === 'sent') {
    return (
      <Reveal className="card flex flex-col items-center justify-center p-12 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-brand-50 text-brand-700">
          <CheckCircle2 size={38} strokeWidth={1.5} />
        </span>
        <h3 className="mt-7 text-3xl text-ink">Thank you, {form.name.split(' ')[0]}.</h3>
        <p className="mt-4 max-w-md text-ink/55">
          Your brief is with us. Expect a reply at{' '}
          <span className="font-medium text-brand-700">{form.email}</span> within one working day —
          usually with a first thought or two already attached.
        </p>
        <button
          onClick={() => {
            setForm(EMPTY)
            setState('idle')
          }}
          className="btn-ghost mt-9"
        >
          Send another brief
        </button>
      </Reveal>
    )
  }

  return (
    <Reveal className="card p-8 sm:p-10">
      <h2 className="text-3xl text-ink">Start a project</h2>
      <p className="mt-2 text-sm text-ink/50">
        Fields marked with an asterisk are required. Everything else just helps us prepare.
      </p>

      <form onSubmit={submit} noValidate className="mt-9 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Your name *" error={errors.name}>
            <input
              className="field"
              value={form.name}
              onChange={set('name')}
              placeholder="Ananya Rao"
            />
          </Field>
          <Field label="Email *" error={errors.email}>
            <input
              className="field"
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="you@company.com"
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Company">
            <input
              className="field"
              value={form.company}
              onChange={set('company')}
              placeholder="Rooted Organics"
            />
          </Field>
          <Field label="What do you need?">
            <select className="field" value={form.service} onChange={set('service')}>
              <option value="">Select a service</option>
              {services.map((s) => (
                <option key={s.title}>{s.title}</option>
              ))}
              <option>Something else</option>
            </select>
          </Field>
        </div>

        <Field label="Budget range">
          <div className="flex flex-wrap gap-2">
            {BUDGETS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setForm((f) => ({ ...f, budget: f.budget === b ? '' : b }))}
                className={`rounded-full border px-5 py-2.5 text-xs font-semibold transition-all duration-300 ${
                  form.budget === b
                    ? 'border-brand-700 bg-brand-700 text-cream-50'
                    : 'border-brand-900/15 text-ink/55 hover:-translate-y-0.5 hover:border-brand-700/40 hover:text-brand-700'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Tell us about the project *" error={errors.message}>
          <textarea
            rows={5}
            className="field resize-none"
            value={form.message}
            onChange={set('message')}
            placeholder="What are you launching, who is it for, and what would success look like?"
          />
          <span className="mt-1.5 block text-right text-[11px] text-ink/35">
            {form.message.length} characters
          </span>
        </Field>

        <button type="submit" disabled={state === 'sending'} className="btn-primary w-full sm:w-auto">
          {state === 'sending' ? (
            <>
              <Loader2 size={17} className="animate-spin" /> Sending…
            </>
          ) : (
            <>
              Send the brief <Send size={16} />
            </>
          )}
        </button>
      </form>
    </Reveal>
  )
}

function Field({ label, error, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink/50">
        {label}
      </span>
      {children}
      {error && <span className="mt-1.5 block text-xs text-brand-600">{error}</span>}
    </label>
  )
}

/* --------------------------------------------------------------- Sidebar */

function Sidebar() {
  const items = [
    { icon: Mail, label: 'Email', value: company.email, href: `mailto:${company.email}` },
    {
      icon: Phone,
      label: 'Phone',
      value: company.phone,
      href: `tel:${company.phone.replace(/\s/g, '')}`,
    },
    { icon: MapPin, label: 'Studio', value: company.address },
    { icon: Clock, label: 'Hours', value: company.hours },
  ]

  return (
    <div className="space-y-6">
      <Reveal
        delay={120}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-950 p-8 text-cream-50 shadow-lift"
      >
        <TreeMark className="absolute -bottom-10 -right-8 h-56 w-56 text-cream-50/[0.06]" />
        <h3 className="relative text-2xl text-cream-50">Talk to a human</h3>
        <p className="relative mt-2 text-sm text-cream-100/60">
          Prefer a conversation? Reach us directly — no gatekeepers.
        </p>
        <ul className="relative mt-8 space-y-6">
          {items.map(({ icon: Ico, label, value, href }) => (
            <li key={label} className="flex gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cream-50/10 text-gold-400 ring-1 ring-cream-50/15">
                <Ico size={18} strokeWidth={1.7} />
              </span>
              <span>
                <span className="block text-[10px] uppercase tracking-[0.2em] text-cream-100/40">
                  {label}
                </span>
                {href ? (
                  <a href={href} className="link-underline text-sm text-cream-50">
                    {value}
                  </a>
                ) : (
                  <span className="block text-sm leading-relaxed text-cream-50">{value}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal delay={200} className="card p-8">
        <h3 className="text-xl text-ink">Follow along</h3>
        <p className="mt-2 text-sm text-ink/50">
          Work in progress, behind the scenes and the occasional strong opinion.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {company.socials.map((s) => (
            <a
              key={s.label}
              href={s.href}
              className="rounded-2xl border border-brand-900/12 px-4 py-3 text-center text-xs font-semibold text-ink/60 transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-700 hover:bg-brand-700 hover:text-cream-50"
            >
              {s.label}
            </a>
          ))}
        </div>
      </Reveal>
    </div>
  )
}

/* ------------------------------------------------------------- Map strip */

function MapStrip() {
  return (
    <section className="relative overflow-hidden bg-brand-950 py-20">
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]">
        {/* decorative grid — stands in for a map without loading a third party */}
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              'linear-gradient(#FBF7F2 1px, transparent 1px), linear-gradient(90deg, #FBF7F2 1px, transparent 1px)',
            backgroundSize: '54px 54px',
          }}
        />
      </div>
      <div className="container-x relative flex flex-col items-center gap-6 text-center">
        <span className="relative grid h-16 w-16 place-items-center rounded-full bg-gold-500 text-brand-950">
          <MapPin size={26} />
          <span className="absolute inset-0 animate-ping rounded-full bg-gold-500/40" />
        </span>
        <h2 className="max-w-xl text-3xl text-cream-50 sm:text-4xl">
          Come see the studio — the coffee is genuinely good
        </h2>
        <p className="max-w-md text-sm text-cream-100/55">{company.address}</p>
        <a
          href="https://maps.google.com"
          target="_blank"
          rel="noreferrer"
          className="btn-light"
        >
          Open in Maps
        </a>
      </div>
    </section>
  )
}
