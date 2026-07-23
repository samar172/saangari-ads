// Central content source for the marketing site. Everything is static —
// no API layer — so copy edits happen here and nowhere else.

export const company = {
  name: 'Saangari Ads',
  legalName: 'Saangari Ads Private Limited',
  tagline: 'Transforming Brands With Creativity',
  email: 'hello@saangariads.com',
  phone: '+91 98765 43210',
  address: 'Level 4, Creative House, MG Road, Bengaluru 560001, India',
  hours: 'Mon – Sat · 10:00 to 19:00 IST',
  socials: [
    { label: 'Instagram', href: '#' },
    { label: 'LinkedIn', href: '#' },
    { label: 'Behance', href: '#' },
    { label: 'YouTube', href: '#' },
  ],
}

export const nav = [
  { label: 'Home', to: '/' },
  { label: 'About', to: '/about' },
  { label: 'Services', to: '/services' },
  { label: 'Work', to: '/work' },
  { label: 'Contact', to: '/contact' },
]

export const stats = [
  { value: 240, suffix: '+', label: 'Campaigns shipped' },
  { value: 12, suffix: ' yrs', label: 'Building brands' },
  { value: 96, suffix: '%', label: 'Client retention' },
  { value: 48, suffix: '', label: 'Awards & mentions' },
]

export const services = [
  {
    icon: 'Sparkles',
    title: 'Brand Strategy & Identity',
    blurb:
      'Positioning, naming, visual systems and tone of voice — the roots that everything else grows from.',
    points: ['Brand audit & positioning', 'Logo & identity systems', 'Guidelines and toolkits'],
  },
  {
    icon: 'Megaphone',
    title: 'Advertising & Media',
    blurb:
      'Print, OOH, radio, television and digital buying planned around where your audience actually is.',
    points: ['Media planning & buying', 'OOH and print campaigns', 'TVC & radio production'],
  },
  {
    icon: 'MonitorSmartphone',
    title: 'Digital & Performance',
    blurb:
      'Meta, Google and programmatic campaigns engineered for measurable pipeline, not vanity metrics.',
    points: ['Paid social & search', 'Landing pages & CRO', 'Analytics dashboards'],
  },
  {
    icon: 'Camera',
    title: 'Content & Production',
    blurb:
      'Films, photography, motion and copy produced end to end by an in-house crew that moves fast.',
    points: ['Brand films & reels', 'Product photography', 'Copywriting & scripting'],
  },
  {
    icon: 'Users',
    title: 'Social Media Management',
    blurb:
      'Always-on calendars, community management and creator partnerships that keep the brand alive daily.',
    points: ['Content calendars', 'Community management', 'Influencer collaborations'],
  },
  {
    icon: 'LineChart',
    title: 'Growth Consulting',
    blurb:
      'Embedded strategists who sit with your team, read the numbers and decide the next quarter with you.',
    points: ['Quarterly growth sprints', 'Market & competitor research', 'Go-to-market planning'],
  },
]

export const process = [
  {
    step: '01',
    title: 'Listen',
    text: 'We start with your business, not your brief. Workshops, interviews and a hard look at the data.',
  },
  {
    step: '02',
    title: 'Shape',
    text: 'Strategy becomes a sharp idea — a single line the whole campaign can hang from.',
  },
  {
    step: '03',
    title: 'Create',
    text: 'Design, film, copy and build. Everything crafted in-house, reviewed against the idea.',
  },
  {
    step: '04',
    title: 'Grow',
    text: 'Launch, measure, iterate. Monthly reporting that says what worked and what changes next.',
  },
]

export const projects = [
  {
    title: 'Rooted Organics',
    category: 'Branding',
    year: '2026',
    result: '+184% retail footfall',
    text: 'A full identity rebuild for a farm-to-table grocery chain, from logo to store signage.',
    tone: 'from-brand-700 to-brand-950',
  },
  {
    title: 'Meridian Homes',
    category: 'Campaign',
    year: '2025',
    result: '3.2× qualified leads',
    text: 'An integrated launch campaign across OOH, print and performance for a premium builder.',
    tone: 'from-gold-600 to-brand-800',
  },
  {
    title: 'Kettle & Co.',
    category: 'Digital',
    year: '2025',
    result: '410K organic reach',
    text: 'Always-on social storytelling that turned a single café into a five-city cult favourite.',
    tone: 'from-brand-600 to-brand-900',
  },
  {
    title: 'Auraveda Skincare',
    category: 'Branding',
    year: '2025',
    result: '₹4.1Cr D2C revenue',
    text: 'Packaging, brand world and a launch film for an ayurvedic skincare range.',
    tone: 'from-brand-800 to-ink',
  },
  {
    title: 'Nimbus Fintech',
    category: 'Digital',
    year: '2024',
    result: '−38% cost per install',
    text: 'Performance overhaul with a creative testing engine running 40 variants a month.',
    tone: 'from-gold-500 to-brand-700',
  },
  {
    title: 'Vaayu Motors',
    category: 'Campaign',
    year: '2024',
    result: '11M film views',
    text: 'A national brand film and dealership rollout for an electric two-wheeler launch.',
    tone: 'from-brand-900 to-brand-600',
  },
]

export const testimonials = [
  {
    quote:
      'Saangari rebuilt our brand from the roots up. Six months later our stores look like they belong to a company three times our size — and the footfall agrees.',
    name: 'Ananya Rao',
    role: 'Founder, Rooted Organics',
  },
  {
    quote:
      'They are the rare agency that argues with you about the strategy and then out-executes everyone on the creative. Our launch sold out in nineteen days.',
    name: 'Vikram Menon',
    role: 'Marketing Head, Meridian Homes',
  },
  {
    quote:
      'The reporting alone changed how our board talks about marketing. No fluff — just what worked, what did not, and what we are doing next month.',
    name: 'Sarah Fernandes',
    role: 'CMO, Nimbus Fintech',
  },
  {
    quote:
      'We came for a logo and stayed for four years. They feel like our own team, only faster and with better taste.',
    name: 'Rohit Bansal',
    role: 'Director, Vaayu Motors',
  },
]

export const team = [
  { name: 'Kaushal Parikshit', role: 'Founder & Creative Director', initials: 'KP' },
  { name: 'Meera Iyer', role: 'Head of Strategy', initials: 'MI' },
  { name: 'Arjun Deshpande', role: 'Design Lead', initials: 'AD' },
  { name: 'Farah Sheikh', role: 'Head of Performance', initials: 'FS' },
]

export const values = [
  {
    icon: 'Sprout',
    title: 'Roots first',
    text: 'Every campaign starts with the business truth underneath it. Ideas without roots do not grow.',
  },
  {
    icon: 'Handshake',
    title: 'Partners, not vendors',
    text: 'One team, shared targets, uncomfortable honesty when the numbers ask for it.',
  },
  {
    icon: 'Gem',
    title: 'Craft as standard',
    text: 'The last 10% of polish is the part clients remember. We never trade it away for speed.',
  },
  {
    icon: 'Radar',
    title: 'Measure everything',
    text: 'Creativity and accountability are not opposites. We publish the numbers either way.',
  },
]

export const clients = [
  'ROOTED ORGANICS',
  'MERIDIAN HOMES',
  'KETTLE & CO.',
  'AURAVEDA',
  'NIMBUS',
  'VAAYU MOTORS',
  'SENCO',
  'HELIOS RETAIL',
]

export const faqs = [
  {
    q: 'What size of business do you usually work with?',
    a: 'Everything from funded startups running their first campaign to established regional brands with in-house marketing teams. The common thread is that they want a partner, not an order-taker.',
  },
  {
    q: 'Do you take on single projects or only retainers?',
    a: 'Both. Identity and campaign work is usually project-based, while social, performance and content run best on a monthly retainer. We will tell you honestly which one your brief needs.',
  },
  {
    q: 'How long does a typical brand project take?',
    a: 'A full identity build runs six to ten weeks end to end. Campaign launches vary with production, but we share a dated plan before anyone signs anything.',
  },
  {
    q: 'How do you report on results?',
    a: 'A live dashboard you can open any day of the month, plus a monthly review call where we walk through what moved, what did not, and the changes going into the next cycle.',
  },
]
