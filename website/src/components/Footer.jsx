import { Link } from 'react-router-dom'
import { ArrowUpRight, Mail, MapPin, Phone } from 'lucide-react'
import { TreeMark } from './Logo.jsx'
import { company, nav, services } from '../data/site.js'

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-brand-950 text-cream-100">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-700/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-gold-600/10 blur-3xl" />
      <TreeMark className="pointer-events-none absolute -bottom-16 right-4 h-80 w-80 text-cream-50/[0.035]" />

      <div className="container-x relative py-20">
        <div className="grid gap-14 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-cream-50/10 ring-1 ring-cream-50/20">
                <TreeMark className="h-7 w-7 text-cream-50" />
              </span>
              <span>
                <span className="block font-display text-2xl tracking-[0.14em]">SAANGARI</span>
                <span className="text-[8.5px] uppercase tracking-[0.34em] text-gold-300">
                  Ads Private Limited
                </span>
              </span>
            </div>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-cream-100/60">
              {company.tagline}. A full-service creative and marketing partner for brands that want
              to be remembered, not just seen.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {company.socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  className="rounded-full border border-cream-50/15 px-4 py-2 text-xs font-medium text-cream-100/70 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold-500 hover:bg-gold-500 hover:text-brand-950"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>

          <FooterCol title="Navigate">
            {nav.map((n) => (
              <li key={n.to}>
                <Link
                  to={n.to}
                  className="link-underline text-sm text-cream-100/60 transition-colors hover:text-gold-300"
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </FooterCol>

          <FooterCol title="Services">
            {services.slice(0, 5).map((s) => (
              <li key={s.title}>
                <Link
                  to="/services"
                  className="link-underline text-sm text-cream-100/60 transition-colors hover:text-gold-300"
                >
                  {s.title}
                </Link>
              </li>
            ))}
          </FooterCol>

          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-300">
              Studio
            </h4>
            <ul className="mt-6 space-y-4 text-sm text-cream-100/60">
              <li className="flex gap-3">
                <MapPin size={16} className="mt-0.5 shrink-0 text-gold-500" />
                {company.address}
              </li>
              <li className="flex gap-3">
                <Mail size={16} className="mt-0.5 shrink-0 text-gold-500" />
                <a href={`mailto:${company.email}`} className="link-underline hover:text-gold-300">
                  {company.email}
                </a>
              </li>
              <li className="flex gap-3">
                <Phone size={16} className="mt-0.5 shrink-0 text-gold-500" />
                <a
                  href={`tel:${company.phone.replace(/\s/g, '')}`}
                  className="link-underline hover:text-gold-300"
                >
                  {company.phone}
                </a>
              </li>
            </ul>
            <Link to="/contact" className="btn-gold mt-7 !px-6 !py-3">
              Book a call <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-cream-50/10 pt-8 text-xs text-cream-100/40 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {company.legalName}. All rights reserved.
          </p>
          <p className="flex gap-6">
            <a href="#" className="link-underline hover:text-cream-100">
              Privacy
            </a>
            <a href="#" className="link-underline hover:text-cream-100">
              Terms
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, children }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-300">
        {title}
      </h4>
      <ul className="mt-6 space-y-3">{children}</ul>
    </div>
  )
}
