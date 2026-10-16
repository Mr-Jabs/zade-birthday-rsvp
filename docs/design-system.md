# Race-day visual system

## Direction

Playful motorsport: an oversized italic headline, a navy track backdrop, warm orange actions, checkered dividers, and clear paper-colored details. A native vector truck keeps the initial shell crisp at every viewport size. The page is an invitation, so product marketing sections such as pricing or testimonials do not apply.

## Tokens

Source: `frontend/src/styles/tokens.css`. Tailwind v4 `@theme` exposes the same values as utilities (`bg-midnight`, `text-action`, `font-display`, `rounded-card`). CSS components consume the generated variables directly.

| Token | Value | Use |
| --- | --- | --- |
| midnight | `#081d38` | Header, hero, footer, dark button text |
| navy | `#0d2d53` | Supporting dark surfaces |
| track | `#164b80` | Artwork atmosphere |
| action | `#ff7a24` | Primary CTA, hero accent |
| highlight | `#ffd15b` | Small illustration accents |
| paper | `#f7f5ef` | Main detail background |
| ink | `#102844` | Body and card text |
| muted | `#536174` | Secondary body text |

Dark text on orange keeps button labels readable. On paper, use darker rust accents for small text instead of bright orange.

## Type

- Barlow Condensed 600/700/800 and 800 italic: identity, display headings, race numbers.
- DM Sans 400/500/600/700: navigation, descriptions, controls.
- Fonts are installed locally through Fontsource; no third-party font request is needed.
- Large fluid headings use `clamp()` and compact line heights. Long descriptions retain comfortable line spacing.

## Components

`.button`, `.button-orange`, `.button-outline`, `.eyebrow`, `.detail-card`, `.text-link`, `.event-strip`, `.reminder`, `.brand`, `.page-width`.

## Responsive rules

- Under 768px: stacked hero, compact header, stacked event strip and cards, full-width closing CTA.
- 768–1023px: two-column hero, compact navigation and three-column details.
- At least 1024px: wide two-column hero, larger artwork and roomier spacing.
- Content max-width: 1240px, with fluid gutters.
- Interactive targets: at least 44px high. Decorative elements cannot expand document width.

## Interaction and accessibility

- Native semantic landmarks, headings, buttons, links, and modal dialog.
- Skip link, visible focus, Escape dismissal, and focus restoration.
- Reduced-motion preference disables entrance and hover motion, plus smooth scrolling.
- Decorative illustration layers are hidden from assistive technology; the composition has one accessible description.
- The RSVP action opens a native dialog: a truck illustration panel beside a light form on desktop, with a compact stacked form on mobile.
- Three numbered progress markers, native radio cards, labeled counters, inline validation, and an explicit saving state guide the guest.
- Confirmation uses a party-pass card and attendance-specific copy. It is shown only after the backend confirms a saved response.
- Closing/reopening preserves the in-memory draft; pending submission temporarily prevents closing and duplicate actions. No guest details are written to browser storage.
