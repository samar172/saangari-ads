import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { TreeMark } from '../components/Logo.jsx'

export default function NotFound() {
  return (
    <section className="relative grid min-h-[80svh] place-items-center overflow-hidden bg-brand-950 px-6 text-center">
      <div className="pointer-events-none absolute -left-24 top-10 h-96 w-96 animate-drift rounded-full bg-brand-700/35 blur-3xl" />
      <TreeMark className="pointer-events-none absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 text-cream-50/[0.04]" />
      <div className="relative">
        <p className="font-display text-8xl text-gradient-gold sm:text-9xl">404</p>
        <h1 className="mt-4 text-4xl text-cream-50">This page never took root</h1>
        <p className="mx-auto mt-4 max-w-md text-cream-100/55">
          The link you followed does not exist — but everything else on the site still does.
        </p>
        <Link to="/" className="btn-gold mt-9">
          <ArrowLeft size={16} /> Back home
        </Link>
      </div>
    </section>
  )
}
