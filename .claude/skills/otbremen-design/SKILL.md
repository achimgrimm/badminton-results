---
name: otbremen-design
description: Visual design system derived from the TSV Osterholz-Tenever (OT Bremen) website, https://www.otbremen.de/. Use whenever building or styling any UI in this project, such as an HTML page, component, artifact, results table, standings, match report or email template, so it matches the club's look: brand blue #0a409f, Source Sans typography, white surfaces, soft card shadows and 5px radii.
---

# OT Bremen Design System

Tokens and recipes taken from the live site at https://www.otbremen.de/ (theme CSS `/_cache/css/amphicms.postBodyOpen-www-default.min.css`, extracted 2026-10-31). Use them for every UI in this repo.

## Character

- **Clean and sporty**: mostly white surfaces, light grey section bands and a single strong blue.
- **Photos lead**: full-width hero images with caption overlays, plus image teaser cards.
- **Calm hierarchy**: headings use semibold weight (600), not heavy weights. Leave plenty of whitespace.
- **One brand hue.** Blue carries every accent. Green, orange and red appear only as status colours.
- **Accessible**: the site has a high-contrast mode and a font-size changer. Keep WCAG AA contrast and visible focus states.
- **Voice**: German, informal "Du", friendly and family-oriented ("Dein Sportverein in Bremen für die ganze Familie", "Sport im Bremer Osten!").

## Tokens

| Role | Value | Notes |
|---|---|---|
| Brand / primary | `#0a409f` | buttons, links, active nav, table heads |
| Primary hover / pressed | `#072d6f` | |
| Primary light | `#0d53cf` | link hover, focus ring, secondary accents |
| Primary deep | `#002d7b` | footer and dark bands |
| Text | `#333333` | body copy |
| Text strong | `#444444` | headings on white |
| Text muted | `#606060` | meta, captions. Don't use `#777` or `#999` for text on white, they fail AA |
| Border | `#e5e5e5` | inputs, dividers, table lines |
| Surface | `#ffffff` | page and cards |
| Surface alt | `#f5f5f5` | section bands, zebra rows |
| Success | `#3a5000` on `#d5ff6a` | win, promoted |
| Warning | `#ac6c00` on `#fff3df` | pending, walkover |
| Error | `#9a1010` on `#fce0e0` | loss, relegated, cancelled |
| Radius | `5px` (controls, cards), `40px` (pills), `50%` (avatars) | |
| Shadow card | `rgba(0,0,0,.05) 0 6px 24px 0, rgba(0,0,0,.08) 0 0 0 1px` | resting |
| Shadow hover | `rgba(0,0,0,.1) 0 4px 12px` | button and card hover |
| Easing | `cubic-bezier(0.55, 0, 0.1, 1)`, 0.3–0.5s | background and shadow transitions |

### Paste-ready CSS variables

```css
:root {
  --ot-primary: #0a409f;
  --ot-primary-hover: #072d6f;
  --ot-primary-light: #0d53cf;
  --ot-primary-deep: #002d7b;
  --ot-on-primary: #ffffff;
  --ot-text: #333333;
  --ot-text-strong: #444444;
  --ot-text-muted: #606060;
  --ot-border: #e5e5e5;
  --ot-bg: #ffffff;
  --ot-bg-alt: #f5f5f5;
  --ot-success: #3a5000;  --ot-success-bg: #d5ff6a;
  --ot-warning: #ac6c00;  --ot-warning-bg: #fff3df;
  --ot-error:   #9a1010;  --ot-error-bg:   #fce0e0;
  --ot-radius: 5px;
  --ot-radius-pill: 40px;
  --ot-shadow: rgba(0,0,0,.05) 0 6px 24px 0, rgba(0,0,0,.08) 0 0 0 1px;
  --ot-shadow-hover: rgba(0,0,0,.1) 0 4px 12px;
  --ot-ease: cubic-bezier(0.55, 0, 0.1, 1);
  --ot-font: "Source Sans 3", "Source Sans Pro", system-ui, sans-serif;
}

/* The site itself has no dark mode. Use this derived variant only when one is needed. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ot-primary: #4d82e6;
    --ot-primary-hover: #6f9cf0;
    --ot-primary-light: #8fb3f5;
    --ot-primary-deep: #0b1e45;
    --ot-on-primary: #ffffff;
    --ot-text: #e6e6e6;
    --ot-text-strong: #ffffff;
    --ot-text-muted: #a8a8a8;
    --ot-border: #333a46;
    --ot-bg: #12161d;
    --ot-bg-alt: #1b2029;
    --ot-success: #ceff50;  --ot-success-bg: #2a3a00;
    --ot-warning: #ffc266;  --ot-warning-bg: #3d2a00;
    --ot-error:   #ff8a8a;  --ot-error-bg:   #3d1010;
    --ot-shadow: 0 0 0 1px #333a46;
    --ot-shadow-hover: 0 4px 12px rgba(0,0,0,.5);
  }
}
```

If a page has a manual theme toggle, repeat the dark block under `:root[data-theme="dark"]`.

## Typography

The site self-hosts "Source Sans Pro". Its current Google Fonts name is **Source Sans 3**:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;600;700;900&display=swap" rel="stylesheet">
```

| Element | Size | Weight | Colour |
|---|---|---|---|
| Hero caption | 2.25–3rem | 700 | white on image or dark scrim |
| h1 / `.headline1` | 1.5rem (24px), up to 2rem on desktop | 600 | `--ot-text-strong` |
| h2 / `.headline2` | 1.25rem (20px) | 600 | `--ot-text-strong` |
| h3 | 1.125rem | 600 | inherit |
| Body | 1rem (16px), line-height 1.5 | 400 | `--ot-text` |
| Small / meta | 0.875rem | 400 | `--ot-text-muted` |
| Button | 1rem to 1.4rem (large CTA) | 600 | `--ot-on-primary` |

Use 900 only for big numbers, such as scores and stat tiles. Use 300 only for large decorative text.

## Component recipes

```css
body { font-family: var(--ot-font); font-size: 1rem; line-height: 1.5; color: var(--ot-text); background: var(--ot-bg); margin: 0; }
a { color: var(--ot-primary); text-decoration: none; }
a:hover { color: var(--ot-primary-light); text-decoration: underline; }
:focus-visible { outline: 3px solid var(--ot-primary-light); outline-offset: 2px; }

/* Buttons */
.btn { display: inline-block; font: 600 1rem/1.2 var(--ot-font); padding: 10px 20px; border-radius: var(--ot-radius);
       border: 1px solid transparent; cursor: pointer; transition: background .5s var(--ot-ease), box-shadow .5s var(--ot-ease); }
.btn-primary { background: var(--ot-primary); color: var(--ot-on-primary); }
.btn-primary:hover { background: var(--ot-primary-hover); box-shadow: var(--ot-shadow-hover); }
.btn-secondary { background: var(--ot-bg); color: var(--ot-primary); border-color: var(--ot-primary); }
.btn-secondary:hover { background: var(--ot-primary); color: var(--ot-on-primary); }
.btn:disabled { opacity: .3; cursor: not-allowed; box-shadow: none; }

/* Header: white bar, logo on the left, nav on the right; dropdowns have a 3px blue top border */
.site-header { background: var(--ot-bg); box-shadow: 0 1px 0 var(--ot-border); position: sticky; top: 0; z-index: 10; }
.site-header nav a { color: var(--ot-text-strong); font-weight: 600; padding: 12px 14px; }
.site-header nav a[aria-current="page"], .site-header nav a:hover { color: var(--ot-primary); }
.site-header .dropdown { border-top: 3px solid var(--ot-primary); background: var(--ot-bg); box-shadow: var(--ot-shadow); }

/* Hero */
.hero { position: relative; min-height: 360px; background: center/cover no-repeat; display: flex; align-items: flex-end; }
.hero-caption { background: rgba(10,64,159,.88); color: #fff; padding: 20px 28px; margin: 0 16px 32px; border-radius: var(--ot-radius); max-width: 640px; }

/* Section bands alternate white and --ot-bg-alt */
.section { padding: 48px 16px; }
.section--alt { background: var(--ot-bg-alt); }
.container { max-width: 1170px; margin: 0 auto; }

/* Teaser card: image on top, headline, text, link */
.card { background: var(--ot-bg); border-radius: var(--ot-radius); box-shadow: var(--ot-shadow); overflow: hidden; transition: box-shadow .5s var(--ot-ease); }
.card:hover { box-shadow: var(--ot-shadow-hover); }
.card img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }
.card-body { padding: 16px 20px 20px; }
.card-body h3 { margin: 0 0 8px; font-weight: 600; }

/* Badges / pills */
.badge { display: inline-block; padding: 2px 10px; border-radius: var(--ot-radius-pill); font-size: .875rem; font-weight: 600; }
.badge--primary { background: var(--ot-primary); color: var(--ot-on-primary); }
.badge--win  { background: var(--ot-success-bg); color: var(--ot-success); }
.badge--draw { background: var(--ot-warning-bg); color: var(--ot-warning); }
.badge--loss { background: var(--ot-error-bg);   color: var(--ot-error); }

/* Forms */
.input { font: inherit; padding: 8px 12px; border: 1px solid var(--ot-border); border-radius: var(--ot-radius); background: var(--ot-bg); color: var(--ot-text); }
.input:focus { border-color: var(--ot-primary-light); outline: none; box-shadow: 0 0 0 3px rgba(13,83,207,.25); }

/* Footer */
.site-footer { background: var(--ot-primary-deep); color: #fff; padding: 40px 16px; }
.site-footer a { color: #fff; text-decoration: underline; }
```

Layout uses a 12-column grid with a 1170px max width (Bootstrap 3 style). Cards go 3 or 4 across on desktop, 2 on tablet and 1 on mobile. Keep a 16px side gutter on mobile. Below 992px the nav collapses into a hamburger. Icons come from Font Awesome 6; use the free set from a CDN.

## Badminton results guidance

- **Results and standings tables**: header row in `--ot-primary` with white 600-weight text, zebra rows in `--ot-bg-alt`, 1px `--ot-border` row dividers and numeric columns right-aligned with `font-variant-numeric: tabular-nums`. Highlight the OT team's own row with a 4px left border in `--ot-primary` and a semibold font.
- **Scores**: show set scores as `21:18 · 19:21 · 21:15`, with the winning side in weight 700 and the losing side in `--ot-text-muted`. Show the match result (for example `5:3`) as a large 900-weight number.
- **Status**: use the win, draw and loss badges above. Mark promotion and relegation zones with a faint success or error background on the table rows.
- **Discipline labels** (HE, DE, HD, DD, GD): use `.badge--primary`, or an outline pill with a blue border.
- **Match cards**: use `.card` with the date and venue in muted small text, the teams on separate lines with the score on the right and a "Spielbericht" link in brand blue.
- Use German labels: Spieltag, Tabelle, Ergebnisse, Heim, Gast, Sätze, Punkte, Spiele.

```css
.results { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.results th { background: var(--ot-primary); color: var(--ot-on-primary); font-weight: 600; text-align: left; padding: 10px 12px; }
.results td { padding: 10px 12px; border-bottom: 1px solid var(--ot-border); }
.results tbody tr:nth-child(even) { background: var(--ot-bg-alt); }
.results tr.is-own { box-shadow: inset 4px 0 0 var(--ot-primary); font-weight: 600; }
.results td.num, .results th.num { text-align: right; }
.results-wrap { overflow-x: auto; } /* wide tables scroll inside this wrapper, never the page */
```

## Do / Don't

- **Do** use `--ot-primary` as the only accent and keep pages mostly white and light grey.
- **Do** set every colour through the variables so dark mode and contrast tweaks work in one place.
- **Do** write UI copy in German with the informal "Du".
- **Don't** introduce new brand hues, gradients or heavy drop shadows.
- **Don't** put white text on the bright button greens or oranges (`#83B600`, `#FFA713`); they fail contrast. Use the dark-on-light status pairs instead.
- **Don't** copy the club logo or present a page as an official otbremen.de page unless the user confirms they are authorized to publish for the club. Otherwise use the styling but keep the branding neutral.
