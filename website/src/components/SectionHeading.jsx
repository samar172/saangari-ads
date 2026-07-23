import Reveal from './Reveal.jsx'

export default function SectionHeading({
  eyebrow,
  title,
  text,
  align = 'left',
  tone = 'dark',
  className = '',
}) {
  const centered = align === 'center'
  const light = tone === 'light'
  return (
    <div className={`${centered ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'} ${className}`}>
      {eyebrow && (
        <Reveal as="p" className={light ? 'eyebrow-light' : 'eyebrow'}>
          <span className="h-1 w-1 rounded-full bg-current" />
          {eyebrow}
        </Reveal>
      )}
      <Reveal
        as="h2"
        delay={80}
        className={`mt-5 text-4xl leading-[1.08] sm:text-5xl lg:text-[3.4rem] ${
          light ? 'text-cream-50' : 'text-ink'
        }`}
      >
        {title}
      </Reveal>
      {text && (
        <Reveal
          as="p"
          delay={160}
          className={`mt-5 text-base leading-relaxed sm:text-lg ${
            light ? 'text-cream-100/65' : 'text-ink/60'
          }`}
        >
          {text}
        </Reveal>
      )}
      <Reveal
        delay={220}
        className={`divider-gold mt-7 animate-grow ${centered ? 'mx-auto' : ''}`}
      />
    </div>
  )
}
