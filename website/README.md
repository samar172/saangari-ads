# Saangari Ads — Marketing Website

A static marketing site for **Saangari Ads Private Limited**. UI only — there is no
API layer, no backend and no data fetching. The contact form validates locally and
simulates a submit.

## Run it

```bash
cd website
npm install
npm run dev      # http://localhost:5180
npm run build    # production bundle into dist/
npm run preview  # serve the built bundle
```

Kept deliberately separate from `client/` (the booking app) so the two deploy
independently, though both use the same Vite + React 18 + Tailwind stack.

## Pages

| Route       | Contents                                                                  |
| ----------- | ------------------------------------------------------------------------- |
| `/`         | Hero, client marquee, services, stats, process, selected work, testimonials, FAQ, CTA |
| `/about`    | Story, values, milestone timeline, team, testimonials                     |
| `/services` | Six capabilities, engagement process, pricing packages, FAQ               |
| `/work`     | Filterable portfolio grid with a case-study lightbox                      |
| `/contact`  | Validated enquiry form, studio details, location strip, FAQ               |
| `*`         | 404                                                                       |

## Editing content

All copy lives in **`src/data/site.js`** — company details, nav, services,
projects, testimonials, team, values, stats and FAQs. Change it there and every
page follows; no component edits needed for a copy change.

## Design system

Derived from the logo (deep maroon, white tree, serif wordmark).

- **Colour** — `brand.700` `#8E1D14` primary, `gold.500` `#C9A227` accent, `cream.100` `#FBF7F2` page.
- **Type** — Cormorant Garamond for display, Inter for body (Google Fonts, loaded in `index.html`).
- **Tokens** — colours, shadows (`soft` / `lift` / `glow`) and keyframes are all in `tailwind.config.js`.
- **Component classes** — `.btn-*`, `.card`, `.eyebrow`, `.field`, `.container-x` in `src/index.css`.

The tree mark is redrawn as inline SVG in `src/components/Logo.jsx` so it scales
and recolours with `currentColor`. `public/logo.png` is the original artwork,
used only as the favicon.

## Interaction notes

- Scroll reveals use one `IntersectionObserver` per element (`Reveal.jsx`); the
  transition itself is CSS, so nothing runs per frame.
- `TiltCard.jsx` adds pointer-tracked 3D tilt and a cursor-following glare.
- Navbar switches to a light tone above the fold — every route opens on a dark
  maroon hero — and to a dark tone once scrolled or when the mobile drawer opens.
- Stat counters animate once on first view; the testimonial carousel autoplays,
  pauses on hover/focus and takes arrow keys.
- `prefers-reduced-motion` disables all of the above (`src/index.css`).
