import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import Logo from './Logo.jsx'
import { nav } from '../data/site.js'

export default function Navbar() {
  const [rawScrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [progress, setProgress] = useState(0)
  const { pathname } = useLocation()

  // The open mobile drawer is cream, so the bar must go dark-tone with it even
  // when the page itself is still at the top of a dark hero.
  const scrolled = rawScrolled || open

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      setScrolled(y > 24)
      const max = document.body.scrollHeight - window.innerHeight
      setProgress(max > 0 ? (y / max) * 100 : 0)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close the drawer on navigation and lock the page behind it.
  useEffect(() => {
    setOpen(false)
  }, [pathname])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'border-b border-brand-900/10 bg-cream-100/85 py-2 backdrop-blur-xl shadow-soft'
            : 'border-b border-transparent bg-transparent py-4'
        }`}
      >
        <div className="container-x flex items-center justify-between">
          {/* Every route opens on a dark maroon hero, so the un-scrolled bar
              has to be in light tone or it disappears into the background. */}
          <Logo compact={scrolled} tone={scrolled ? 'dark' : 'light'} />

          <nav className="hidden items-center gap-1 lg:flex">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `relative rounded-full px-4 py-2 text-sm font-medium transition-colors duration-300 ${
                    scrolled
                      ? isActive
                        ? 'text-brand-700'
                        : 'text-ink/65 hover:text-brand-700'
                      : isActive
                        ? 'text-gold-300'
                        : 'text-cream-100/70 hover:text-gold-300'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {item.label}
                    <span
                      className={`absolute inset-x-4 -bottom-0.5 h-[2px] rounded-full bg-gold-500 transition-transform duration-300 ${
                        isActive ? 'scale-x-100' : 'scale-x-0'
                      }`}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/contact"
              className={`hidden !px-6 !py-3 sm:inline-flex ${scrolled ? 'btn-primary' : 'btn-gold'}`}
            >
              Start a project
              <ArrowUpRight size={16} />
            </Link>
            <button
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              className={`grid h-11 w-11 place-items-center rounded-full border transition-colors lg:hidden ${
                scrolled
                  ? 'border-brand-900/15 bg-cream-50 text-brand-800 hover:bg-brand-700 hover:text-cream-50'
                  : 'border-cream-50/25 bg-cream-50/10 text-cream-50 backdrop-blur hover:bg-cream-50 hover:text-brand-800'
              }`}
            >
              {open ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>

        {/* reading progress */}
        <div
          className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-gradient-to-r from-brand-700 via-gold-500 to-brand-700 transition-transform duration-150"
          style={{ transform: `scaleX(${progress / 100})` }}
        />
      </header>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-40 lg:hidden ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-ink/40 backdrop-blur-sm transition-opacity duration-400 ${
            open ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <nav
          className={`absolute right-0 top-0 flex h-full w-[82%] max-w-sm flex-col gap-2 bg-cream-50 px-7 pb-10 pt-28 shadow-lift transition-transform duration-500 ${
            open ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {nav.map((item, i) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={{ transitionDelay: `${open ? 120 + i * 55 : 0}ms` }}
              className={({ isActive }) =>
                `border-b border-brand-900/10 py-4 font-display text-3xl transition-all duration-500 ${
                  open ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0'
                } ${isActive ? 'text-brand-700' : 'text-ink/80'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <Link to="/contact" className="btn-primary mt-8 w-full">
            Start a project <ArrowUpRight size={16} />
          </Link>
        </nav>
      </div>
    </>
  )
}
