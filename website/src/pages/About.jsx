import { Link } from 'react-router-dom'
import { ArrowUpRight, Quote } from 'lucide-react'
import PageHero from '../components/PageHero.jsx'
import SectionHeading from '../components/SectionHeading.jsx'
import Reveal from '../components/Reveal.jsx'
import Stats from '../components/Stats.jsx'
import Testimonials from '../components/Testimonials.jsx'
import TiltCard from '../components/TiltCard.jsx'
import CTA from '../components/CTA.jsx'
import Icon from '../components/Icon.jsx'
import { TreeMark } from '../components/Logo.jsx'
import { team, values } from '../data/site.js'

const timeline = [
  { year: '2014', title: 'A studio of three', text: 'Started above a print shop with one client and a borrowed projector.' },
  { year: '2018', title: 'Full-service', text: 'Added media buying and an in-house film crew. First national campaign shipped.' },
  { year: '2021', title: 'Digital at the centre', text: 'Built the performance practice — creative testing became part of every retainer.' },
  { year: '2026', title: 'Forty strong', text: 'A team of forty across strategy, design, film and media, working with brands in nine states.' },
]

export default function About() {
  return (
    <>
      <PageHero
        eyebrow="About us"
        title="We grow brands the way a tree grows — from the roots."
        text="Saangari Ads Private Limited is a team of strategists, designers, filmmakers and media planners who believe good advertising starts with an honest business truth."
      />

      <Story />

      <section className="container-x pb-8">
        <Reveal>
          <Stats />
        </Reveal>
      </section>

      <Values />
      <Timeline />
      <Team />
      <Testimonials />
      <CTA />
    </>
  )
}

function Story() {
  return (
    <section className="container-x py-24 sm:py-32">
      <div className="grid items-center gap-16 lg:grid-cols-2">
        <Reveal>
          <TiltCard className="rounded-[2.5rem]" max={6}>
            <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-12 shadow-lift">
              <TreeMark className="absolute -bottom-12 -right-10 h-72 w-72 text-cream-50/[0.07]" />
              <Quote size={44} className="text-gold-500/60" strokeWidth={1.2} />
              <p className="relative mt-6 font-display text-3xl leading-snug text-cream-50 sm:text-4xl">
                “Anyone can buy attention. We are in the business of earning it — and then keeping
                it long enough to matter.”
              </p>
              <p className="relative mt-8 text-sm text-gold-300">
                Kaushal Parikshit · Founder &amp; Creative Director
              </p>
            </div>
          </TiltCard>
        </Reveal>

        <div>
          <SectionHeading
            eyebrow="Our story"
            title="Twelve years of building brands worth remembering"
          />
          <div className="mt-8 space-y-5 text-base leading-relaxed text-ink/60">
            <Reveal as="p" delay={80}>
              We began in 2014 as a three-person studio with one belief: most marketing fails not
              because the creative is weak, but because nobody agreed on what the brand actually
              stands for. So we start there, every single time.
            </Reveal>
            <Reveal as="p" delay={140}>
              Today Saangari is a full-service agency of forty — strategists who read P&amp;Ls,
              designers who obsess over kerning, a film crew that owns its kit, and media planners
              who defend every rupee of spend. All of it in one building, on one calendar.
            </Reveal>
            <Reveal as="p" delay={200}>
              The tree in our logo is not decoration. It is the whole idea: roots first, growth
              second, and shade for everyone who sits under it.
            </Reveal>
          </div>
          <Reveal delay={260} className="mt-10 flex flex-wrap gap-4">
            <Link to="/work" className="btn-primary">
              See the work <ArrowUpRight size={16} />
            </Link>
            <Link to="/contact" className="btn-ghost">
              Meet the team
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function Values() {
  return (
    <section className="bg-cream-200/60 py-24 sm:py-32">
      <div className="container-x">
        <SectionHeading
          align="center"
          eyebrow="What we believe"
          title="Four rules we do not bend"
        />
        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {values.map((v, i) => (
            <Reveal key={v.title} delay={i * 90}>
              <article className="card card-hover group h-full p-8">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-700 transition-all duration-500 group-hover:scale-110 group-hover:bg-brand-700 group-hover:text-cream-50">
                  <Icon name={v.icon} size={24} strokeWidth={1.6} />
                </span>
                <h3 className="mt-6 text-2xl text-ink">{v.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink/55">{v.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function Timeline() {
  return (
    <section className="container-x py-24 sm:py-32">
      <SectionHeading eyebrow="Milestones" title="How we got here" />
      <div className="relative mt-16">
        <div className="absolute left-[7.5rem] top-2 hidden h-[calc(100%-1rem)] w-px bg-gradient-to-b from-brand-700/40 via-gold-500/40 to-transparent sm:block" />
        <div className="space-y-10">
          {timeline.map((t, i) => (
            <Reveal
              key={t.year}
              delay={i * 100}
              className="group grid gap-4 sm:grid-cols-[7rem_auto_1fr] sm:items-start sm:gap-8"
            >
              <span className="font-display text-3xl text-brand-700 sm:text-right">{t.year}</span>
              <span className="relative mt-3 hidden h-3 w-3 rounded-full bg-gold-500 ring-4 ring-cream-100 transition-transform duration-500 group-hover:scale-150 sm:block" />
              <div className="rounded-2xl border border-brand-900/10 bg-cream-50 p-6 shadow-soft transition-all duration-500 group-hover:-translate-y-1 group-hover:shadow-lift">
                <h3 className="text-xl text-ink">{t.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink/55">{t.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function Team() {
  return (
    <section className="bg-cream-200/60 py-24 sm:py-32">
      <div className="container-x">
        <SectionHeading
          align="center"
          eyebrow="The people"
          title="Who you will actually be working with"
          text="No account-manager relay races. The people in the pitch are the people on the project."
        />
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {team.map((m, i) => (
            <Reveal key={m.name} delay={i * 90}>
              <article className="card card-hover group h-full overflow-hidden text-center">
                <div className="relative h-52 overflow-hidden bg-gradient-to-br from-brand-700 to-brand-950">
                  <TreeMark className="absolute -bottom-8 -right-8 h-44 w-44 text-cream-50/[0.08] transition-transform duration-700 group-hover:rotate-12" />
                  <span className="absolute inset-0 grid place-items-center font-display text-6xl text-cream-50/90 transition-transform duration-500 group-hover:scale-110">
                    {m.initials}
                  </span>
                </div>
                <div className="p-6">
                  <h3 className="text-xl text-ink">{m.name}</h3>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-ink/45">{m.role}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
