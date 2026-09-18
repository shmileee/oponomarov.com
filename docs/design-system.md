# oponomarov.com — design system

One Astro engine, three content repositories. This file defines the target
styles and rendering rules; [`content-primitives.json`](../src/lib/content-primitives.json)
defines the exact content-authored class and data-attribute names. Change the
two together. Neither document is evidence that the cutover has shipped.

The baseline and architecture are recorded in
[findings](../.omo/findings.md), [measured defects](../.omo/measured-defects.md),
and the [consolidation plan](../.omo/plans/design-system.md), sections 1.1–1.8.
The palette source is pre-cutover `src/styles/global.css:49–93`; spacing and
layout inputs are at lines 97–112. Values left unnamed by the plan are fixed
below, not delegated to individual pages.

## 1. Principles

- One layered system for portfolio, blog, and dotfiles. Identical Markdown
  receives identical body typography, inline code, tables, and theme behavior.
- The engine owns templates, layout, typography, interactions, and CSS. Content
  repositories own Markdown and assets, not stylesheets or inline presentation.
- No per-page CSS, route-qualified selectors, component `<style>` blocks, or
  compatibility override sheets. Preserve live behavior before deleting legacy
  styles; do not mistake the dead `blog.css` and `portfolio.css` for the live
  `public/` sheets.
- Content authors compose semantic HTML from the fixed primitive set in
  section 9. Plain Markdown is the default. A new content type is not a new
  typography system.
- Colors, type, spacing, shape, motion, and layout measures use tokens. Raw
  browser mechanics such as `0`, `auto`, `100%`, `1fr`, and intrinsic sizing are
  not new design tokens.
- Preserve the existing navy/white surfaces, blue links, red reading-progress
  indicator, and three font roles. This is consolidation, not a palette or
  brand redesign. Surface separation uses the existing tones, borders, and
  raised shadow; do not add another elevation palette.

## 2. Cascade layers

The exact order string is:

```css
@layer reset, tokens, base, expressive-code, layout, components, prose, primitives, utilities, print;
```

Emit it twice, byte-identical:

1. As the first child of `<head>` in `SiteLayout.astro`, inside
   `<style is:inline>`, before every stylesheet `<link>`.
2. As the first statement of `src/styles/index.css`.

First appearance establishes layer order. Expressive Code can link
`ec.[hash].css` before the page bundle; an order declaration in the bundle alone
is too late. The inline declaration contains no rules or declarations. It is
the sole exception to the ban on Astro `<style>` blocks, and V1 validates its
exact contents and position. V13 must reject every other block.

**UNLAYERED normal author CSS beats ALL layered normal author CSS**, regardless
of selector specificity or where the layered sheet is linked. This is why the
legacy `public/assets/css/site.css` and `public/blog-assets/css/main.css` win
today. Source order only decides a tie after origin, importance, and layer
precedence. Important declarations reverse layer precedence; `!important` is
therefore prohibited, not another escape hatch.

Final stylesheet set: 15 files. `index.css` contains the order statement and
imports only; each of the other 14 files wraps its rules in its named layer.

| File under `src/styles/` | Layer | Owns |
| --- | --- | --- |
| `index.css` | — | Order statement and imports; the only CSS entry imported by Astro/JavaScript |
| `reset.css` | `reset` | Box sizing, zero margins, media defaults, shrinkable grid/flex children, reduced motion |
| `tokens.css` | `tokens` | All three token tiers and theme selection |
| `base.css` | `base` | Four font faces, document defaults, heading scale, links, focus, selection, skip link, eyebrow |
| `layout.css` | `layout` | Content grid, `wide`, `full-bleed`, section/page/article layout |
| `components/shell.css` | `components` | Existing `op-*` header, brand, navigation, theme toggle, progress, footer, back-to-top |
| `components/search.css` | `components` | Shared search dialog |
| `components/cards.css` | `components` | Arc, spotlight, case cards, topic filters, grid toggle, principles, archive, topic directory, contact methods |
| `components/navigation.css` | `components` | TOC, adjacent navigation, topic list, back link, source actions |
| `components/article.css` | `components` | Article header, dek, metadata, proof list, comments |
| `components/reader.css` | `components` | Homepage reader dialog and its children |
| `components/lightbox.css` | `components` | Enlarged-image dialog ContentInteractions opens from article images |
| `prose.css` | `prose` | Shared prose, admonitions, EC frame adjustments, inline code, tables, native content elements |
| `primitives.css` | `primitives` | Every selector in the content-primitive contract |
| `utilities.css` | `utilities` | `sr-only` only |
| `print.css` | `print` | `@media print` only: hides the screen chrome, dialogs and navigation, flattens the grids to one column, wraps code and keeps blocks whole; the last layer so it wins without `!important` |

Expressive Code generates its own sheet inside `expressive-code`, above the
reset/base layers and below our layout, component, and prose layers. It does
not become a second application CSS entry point.

`SiteLayout.astro` replaces EditorialLayout, DocsLayout, dead BaseLayout, and
contact's standalone document. `ArticleShell.astro` owns article scaffolding;
`PageToc.astro` replaces both docs and blog TOCs; `ContentInteractions.astro`
owns context help, tabs, and shortcut filtering. Delete CodeFrames after
Expressive Code owns frame styling. Reader extraction uses a data hook rather
than `.case-detail-prose` and loads the fetched article's EC stylesheet.

## 3. Token reference

All token definitions live in `tokens.css`. Components consume Tier 2 semantics
and the Tier 3 aliases for their primitive. Tier 1 references, literal colors,
color functions, and `light-dark()` never appear in other author stylesheets.

### Tier 1 — preserved palette

Conversion method: interpret hex and `rgba()` channels as sRGB/D65, normalize
RGB to 0–1, then linearize each channel with `c / 12.92` for `c <= 0.04045`, or
`((c + 0.055) / 1.055) ** 2.4` otherwise. Apply the
[OKLab linear-sRGB matrices](https://bottosson.github.io/posts/oklab/), cube-root
the LMS channels, then compute `C = hypot(a, b)` and
`h = atan2(b, a) * 180 / PI`, normalized to 0–360 degrees.

The table uses numerical lightness in 0–1, not percentages. Lightness and
chroma are rounded to six decimal places; hue to four. Neutral white/black
use zero chroma and hue. Alpha is copied unchanged, **not premultiplied or
flattened against a background**. At this precision the inverse conversion
rounds back to the original 8-bit sRGB channels. The table groups duplicate
values while accounting for every palette declaration in the source range.

| Tier 1 token | Original sRGB value | OKLCH value | Original use (`--` prefix omitted) |
| --- | --- | --- | --- |
| `--p-ink-950` | `#0b1220` | `oklch(0.183113 0.030892 263.3831)` | Dark surface-primary |
| `--p-ink-900` | `#111827` | `oklch(0.210084 0.031763 264.6645)` | Dark surface-secondary/code-toolbar; light text-primary/code-text |
| `--p-ink-950-a94` | `rgba(11, 18, 32, 0.94)` | `oklch(0.183113 0.030892 263.3831 / 0.94)` | Dark surface-header |
| `--p-white` | `#ffffff` | `oklch(1.000000 0.000000 0.0000)` | Dark text-primary; light surface-secondary |
| `--p-white-a78` | `rgba(255, 255, 255, 0.78)` | `oklch(1.000000 0.000000 0.0000 / 0.78)` | Dark text-body |
| `--p-white-a60` | `rgba(255, 255, 255, 0.6)` | `oklch(1.000000 0.000000 0.0000 / 0.6)` | Dark text-secondary |
| `--p-neutral-350` | `#aab4c3` | `oklch(0.766810 0.024188 258.3665)` | Dark text-tertiary |
| `--p-white-a16` | `rgba(255, 255, 255, 0.16)` | `oklch(1.000000 0.000000 0.0000 / 0.16)` | Dark border-default |
| `--p-white-a08` | `rgba(255, 255, 255, 0.08)` | `oklch(1.000000 0.000000 0.0000 / 0.08)` | Dark border-subtle |
| `--p-blue-400` | `#60a5fa` | `oklch(0.713740 0.143381 254.6240)` | Dark accent-primary |
| `--p-blue-300` | `#93c5fd` | `oklch(0.809069 0.095598 251.8128)` | Dark accent-soft/code-inline-text/focus-ring |
| `--p-blue-600-a14` | `rgba(37, 99, 235, 0.14)` | `oklch(0.546150 0.215208 262.8809 / 0.14)` | Dark accent-surface |
| `--p-blue-400-a35` | `rgba(96, 165, 250, 0.35)` | `oklch(0.713740 0.143381 254.6240 / 0.35)` | Dark accent-border |
| `--p-red-500` | `#f9423a` | `oklch(0.650610 0.220291 27.7092)` | Progress, inherited by light mode too |
| `--p-ink-975` | `#0a101c` | `oklch(0.173604 0.026858 263.5115)` | Dark code-surface |
| `--p-neutral-200` | `#e5e7eb` | `oklch(0.927582 0.005814 264.5313)` | Dark code-text |
| `--p-neutral-400` | `#94a3b8` | `oklch(0.710672 0.035114 256.7878)` | Dark code-muted |
| `--p-black-a22` | `rgba(0, 0, 0, 0.22)` | `oklch(0.000000 0.000000 0.0000 / 0.22)` | Dark shadow-raised color |
| `--p-neutral-75` | `#f4f5f7` | `oklch(0.969953 0.002872 264.5420)` | Light surface-primary |
| `--p-neutral-75-a94` | `rgba(244, 245, 247, 0.94)` | `oklch(0.969953 0.002872 264.5420 / 0.94)` | Light surface-header |
| `--p-ink-900-a84` | `rgba(17, 24, 39, 0.84)` | `oklch(0.210084 0.031763 264.6645 / 0.84)` | Light text-body |
| `--p-ink-900-a66` | `rgba(17, 24, 39, 0.66)` | `oklch(0.210084 0.031763 264.6645 / 0.66)` | Light text-secondary |
| `--p-neutral-650` | `#4b5563` | `oklch(0.446112 0.026312 256.8018)` | Light text-tertiary |
| `--p-ink-900-a16` | `rgba(17, 24, 39, 0.16)` | `oklch(0.210084 0.031763 264.6645 / 0.16)` | Light border-default |
| `--p-ink-900-a09` | `rgba(17, 24, 39, 0.09)` | `oklch(0.210084 0.031763 264.6645 / 0.09)` | Light border-subtle |
| `--p-blue-700` | `#1d4ed8` | `oklch(0.488198 0.217165 264.3763)` | Light accent-primary/code-inline-text/focus-ring |
| `--p-blue-600` | `#2563eb` | `oklch(0.546150 0.215208 262.8809)` | Light accent-soft |
| `--p-blue-600-a10` | `rgba(37, 99, 235, 0.1)` | `oklch(0.546150 0.215208 262.8809 / 0.1)` | Light accent-surface |
| `--p-blue-600-a40` | `rgba(37, 99, 235, 0.4)` | `oklch(0.546150 0.215208 262.8809 / 0.4)` | Light accent-border |
| `--p-neutral-50` | `#f8fafc` | `oklch(0.984152 0.003413 247.8575)` | Light code-surface |
| `--p-neutral-100` | `#eef2f7` | `oklch(0.959546 0.007959 253.8534)` | Light code-toolbar |
| `--p-neutral-600` | `#526071` | `oklch(0.483663 0.032460 253.4324)` | Light code-muted |
| `--p-ink-900-a12` | `rgba(17, 24, 39, 0.12)` | `oklch(0.210084 0.031763 264.6645 / 0.12)` | Light shadow-raised color |

### Tier 2 — semantic colors and elevation

Each color row defines `light-dark(var(<light>), var(<dark>))` in `tokens.css`.
Light is always the first argument. Raised surfaces reuse the existing
secondary surface; they do not introduce a third background color.

| Token | Light endpoint | Dark endpoint | Use |
| --- | --- | --- | --- |
| `--color-bg` | `--p-neutral-75` | `--p-ink-950` | Document background |
| `--color-surface` | `--p-white` | `--p-ink-900` | Cards and reference surfaces |
| `--color-surface-raised` | `--p-white` | `--p-ink-900` | Dialogs and elevated panels |
| `--color-header` | `--p-neutral-75-a94` | `--p-ink-950-a94` | Translucent header |
| `--color-text` | `--p-ink-900` | `--p-white` | Headings and primary labels |
| `--color-text-body` | `--p-ink-900-a84` | `--p-white-a78` | Body copy |
| `--color-text-muted` | `--p-ink-900-a66` | `--p-white-a60` | Secondary copy |
| `--color-text-subtle` | `--p-neutral-650` | `--p-neutral-350` | Captions and tertiary copy |
| `--color-border` | `--p-ink-900-a16` | `--p-white-a16` | Default borders |
| `--color-border-subtle` | `--p-ink-900-a09` | `--p-white-a08` | Quiet separators |
| `--color-accent` | `--p-blue-700` | `--p-blue-400` | Links and controls |
| `--color-accent-soft` | `--p-blue-600` | `--p-blue-300` | Hover/link emphasis |
| `--color-accent-surface` | `--p-blue-600-a10` | `--p-blue-600-a14` | Tinted control/inline-code surface |
| `--color-accent-border` | `--p-blue-600-a40` | `--p-blue-400-a35` | Accented borders |
| `--color-focus` | `--p-blue-700` | `--p-blue-300` | Visible focus ring |
| `--color-progress` | `--p-red-500` | `--p-red-500` | Reading progress |

`--shadow-raised: 0 20px 50px light-dark(var(--p-ink-900-a12), var(--p-black-a22))`.
This preserves both original shadow geometries and alpha values. Do not pass
whole shadow lists to `light-dark()`; it accepts colors.

### Tier 2 — type, space, shape, and behavior

The full `--text-xs` through `--text-4xl` values are in section 4; the complete
spacing scale, `--space-gutter`, `--space-section`, and `--prose-flow` are in
section 5. These are Tier 2 tokens, not per-component overrides.

| Token | Value | Use |
| --- | --- | --- |
| `--font-display` | `"Bricolage Grotesque", "Public Sans", sans-serif` | Headings |
| `--font-body` | `"Public Sans", system-ui, sans-serif` | Prose and form content |
| `--font-mono` | `"IBM Plex Mono", ui-monospace, monospace` | Code, keys, navigation, metadata |
| `--weight-normal` | `400` | Body and code |
| `--weight-medium` | `500` | Navigation and metadata |
| `--weight-semibold` | `600` | Labels and small headings |
| `--weight-bold` | `700` | Display headings |
| `--tracking-heading` | `-0.035em` | Display title tracking |
| `--tracking-label` | `0.16em` | Eyebrow tracking |
| `--leading-body` | `1.65` | Prose, including lede/compact |
| `--leading-tight` | `1.15` | Display headings |
| `--leading-snug` | `1.3` | Small headings and UI |
| `--leading-code` | `1.6` | Fenced code |
| `--radius-sm` | `0.25rem` | Inline code and keys |
| `--radius-md` | `0.5rem` | Code and media frames |
| `--radius-lg` | `0.75rem` | Cards and dialogs |
| `--radius-pill` | `999rem` | Pills; not a content width |
| `--measure-prose` | `44rem` | 704px readable measure at a 16px root |
| `--measure-wide` | `64rem` | 1024px wide track |
| `--measure-page` | `80rem` | 1280px page maximum |
| `--toc-width` | `14rem` | TOC column |
| `--tap-size` | `2.75rem` | 44px minimum control size |
| `--header-height` | `3.5rem` | Minimum header row height; allow growth on wrapping |
| `--border-width` | `1px` | Standard border stroke |
| `--focus-width` | `0.1875rem` | 3px focus outline |
| `--focus-offset` | `0.1875rem` | 3px outline offset |
| `--z-header` | `50` | Header stacking context |
| `--z-progress` | `1` | Progress within the header context |
| `--z-back-to-top` | `60` | Floating return control |
| `--dur-fast` | `130ms` | Short control feedback |
| `--dur-base` | `160ms` | Standard state transition |
| `--ease-out` | `ease-out` | State-transition easing |

Keep the four local font faces: Bricolage Grotesque normal, Public Sans normal
and italic, IBM Plex Mono normal. Three families are intentional: display,
reading, and code/navigation roles already exist. Keep `font-display: swap`.
Native modal dialogs use the top layer, not a growing set of z-index tokens.

The display file is a partial instance of the variable font: Bricolage's
`opsz` axis (12–96) is pinned at 28, the middle of the heading range, and
`wght` clamped to 400–800, which halves the file (77KB → 40KB) with no
change a heading between 19px and 40px shows. Regenerate from the upstream
variable WOFF2 with fontTools: `instancer.instantiateVariableFont(font,
{"opsz": 28, "wght": (400, 800)})`, then save as WOFF2. The Open Graph
instances under `src/assets/og/` are separate and unaffected.

### Tier 3 — component aliases

All definitions below still live in `tokens.css`. A component may consume its
alias but may not redeclare it by route or theme.

| Token | Value | Use |
| --- | --- | --- |
| `--code-bg` | `light-dark(var(--p-neutral-50), var(--p-ink-975))` | Fenced-code background |
| `--code-toolbar-bg` | `light-dark(var(--p-neutral-100), var(--p-ink-900))` | EC editor/terminal toolbar |
| `--code-text` | `light-dark(var(--p-ink-900), var(--p-neutral-200))` | Unhighlighted code foreground |
| `--code-muted` | `light-dark(var(--p-neutral-600), var(--p-neutral-400))` | Code/frame secondary text |
| `--code-border` | `var(--color-border)` | Code frame border |
| `--code-font-size` | `var(--text-sm)` | Fenced-code type |
| `--code-inline-size` | `0.85em` | Inline code relative to surrounding text (`--code-inline-scale`; `--code-block-scale` is the same 0.85 of the body step) |
| `--code-inline-bg` | `var(--color-accent-surface)` | Inline-code fill |
| `--code-inline-text` | `light-dark(var(--p-blue-700), var(--p-blue-300))` | Inline-code foreground |
| `--table-border` | `var(--color-border)` | Table rules |
| `--table-head-bg` | `var(--color-surface)` | Table header background |
| `--table-stripe` | `var(--color-border-subtle)` | Subtle alternating row fill |
| `--kbd-bg` | `var(--color-surface-raised)` | Keycap fill |
| `--kbd-border` | `var(--color-border)` | Keycap border |
| `--frame-dark` | `var(--p-ink-975)` | Fixed backing for dark screenshots |
| `--frame-light` | `var(--p-white)` | Fixed backing for light screenshots |

`--frame-dark` and `--frame-light` describe the captured asset, not the site's
theme. They do not set `color-scheme` or change surrounding prose.

## 4. Type scale

Define this ramp in `tokens.css`. Every preferred value contains a `rem` term;
viewport-only font ramps are prohibited. Bounds are also in `rem`.

| Token | Value | At 320px | At 1920px |
| --- | --- | --- | --- |
| `--text-xs` | `clamp(0.75rem, 0.725rem + 0.125vw, 0.875rem)` | 12px | 14px |
| `--text-sm` | `clamp(0.875rem, 0.85rem + 0.125vw, 1rem)` | 14px | 16px |
| `--text-base` | `clamp(1.0625rem, 1rem + 0.3vw, 1.1875rem)` | 17px | 19px |
| `--text-lg` | `clamp(1.1875rem, 1.15rem + 0.1875vw, 1.375rem)` | 19px | 22px |
| `--text-xl` | `clamp(1.375rem, 1.3rem + 0.375vw, 1.75rem)` | 22px | 28px |
| `--text-2xl` | `clamp(1.75rem, 1.625rem + 0.625vw, 2.375rem)` | 28px | 38px |
| `--text-3xl` | `clamp(2.125rem, 1.925rem + 1vw, 3.125rem)` | 34px | 50px |
| `--text-4xl` | `clamp(2.625rem, 2.3rem + 1.625vw, 4.25rem)` | 42px | 68px |

Endpoints assume `1rem = 16px`. Evaluate each as
`max(min * 16, min(preferredRem * 16 + preferredVw * viewport / 100, max * 16))`.
The base token is the plan's fixed 17–19px ramp; it reaches its maximum at
1000px, not 1920px. Do not hardcode the root font size to make these numbers
hold when the user changes their default.

| Element or role | Size | Family / weight / leading |
| --- | --- | --- |
| Hero display `h1` | `--text-4xl` | Display / bold / tight |
| Article or ordinary page `h1` | `--text-3xl` | Display / bold / tight |
| `h2` | `--text-2xl` | Display / bold / tight |
| `h3` | `--text-xl` | Display / semibold / snug |
| `h4` | `--text-lg` | Display / semibold / snug |
| `h5` | `--text-base` | Body / semibold / snug |
| `h6` | `--text-sm` | Body / semibold / snug |
| Paragraph, list item, definition, normal table cell, search input | `--text-base` | Body / normal / body |
| Hero copy, dek, `.prose--lede` | `--text-lg` | Body / normal / body |
| Navigation, buttons, tabs, TOC | `--text-sm` | Mono / medium / snug |
| Metadata, captions, table labels | `--text-sm` | Mono / medium / snug |
| Eyebrow, format badge | `--text-xs` | Mono / semibold / snug |
| Fenced code | `--code-font-size` → `--text-sm` | Mono / normal / code |
| Inline code and `kbd` | `--code-inline-size` | Mono / normal / inherited leading |

Heading level follows document structure, not the desired font size. A rem term
prevents the viewport term from being the only response to zoom; it is not by
itself proof of WCAG 1.4.4. Run S11 with 200% root text size and verify real
browser zoom without clipping or loss of functionality. Mixed-unit clamps need
not exactly double at a fixed viewport under a root-size-only test.

## 5. Spacing scale

Keep the existing quarter-rem scale through step 16. The step numbers are
literal multiples, not array indexes; there are no steps 7, 9, 11, or 13–15.

| Token | Value | At a 16px root |
| --- | --- | --- |
| `--space-1` | `0.25rem` | 4px |
| `--space-2` | `0.5rem` | 8px |
| `--space-3` | `0.75rem` | 12px |
| `--space-4` | `1rem` | 16px |
| `--space-5` | `1.25rem` | 20px |
| `--space-6` | `1.5rem` | 24px |
| `--space-8` | `2rem` | 32px |
| `--space-10` | `2.5rem` | 40px |
| `--space-12` | `3rem` | 48px |
| `--space-16` | `4rem` | 64px |
| `--space-gutter` | `clamp(1rem, 4vw, 2.5rem)` | 16px at 320px; 40px at 1920px |
| `--space-section` | `clamp(3rem, 8vw, 6rem)` | 48px at 320px; 96px at 1920px |
| `--prose-flow` | `1.25em` | 21.25–23.75px for 17–19px body text |

These two viewport-only preferred spacing terms are the plan's layout tokens,
not font sizes; their rem bounds still respond to the root size. Use gutter for
page edges, section for major section separation, and prose flow between
adjacent content blocks. Compact prose assigns
`--prose-flow: var(--space-4)` locally; it does not shrink body text.

Retire `--space-20` and `--space-24` as separate fixed section-spacing choices.
`--space-section` supplies that range. Replace `--page-gutter` with
`--space-gutter`, `--page-width: 71.25rem` with `--measure-page: 80rem`, and
`--reading-width: 46rem` with `--measure-prose: 44rem`. These width changes are
the agreed consolidation, not palette changes.

## 6. Breakpoints

Fixed width-query allowlist: **`40rem 48rem 64rem 80rem 96rem`**.

| Threshold | At the default 16px initial font size | Scope |
| --- | --- | --- |
| `40rem` | 640px | Narrow-screen content-grid collapse |
| `48rem` | 768px | First tablet composition |
| `64rem` | 1024px | Wide content / larger composition |
| `80rem` | 1280px | Page maximum / desktop composition |
| `96rem` | 1536px | Large-screen surrounding layout |

Use range syntax only: `@media (width >= 48rem)` or
`@media (width < 40rem)`, not `min-width`/`max-width` queries. Prefer
`@container (width >= 40rem)` for components placed in articles, cards, or reader
dialogs; viewport queries belong to the document shell. Breakpoints are
literal allowlisted values because custom properties cannot supply media or
container query conditions.

V7 enforces the allowlist and range syntax for width conditions. Apply the same
policy to container width conditions. Preference queries such as
`prefers-reduced-motion` are not width breakpoints.

## 7. The content grid

Copy of the agreed layout primitive:

```css
@layer layout {
  .content-grid {
    display: grid;
    container-type: inline-size;
    grid-template-columns:
      [full-start]    minmax(var(--space-gutter), 1fr)
      [wide-start]    minmax(0, calc((var(--measure-wide) - var(--measure-prose)) / 2))
      [content-start] minmax(0, var(--measure-prose))
      [content-end]   minmax(0, calc((var(--measure-wide) - var(--measure-prose)) / 2))
      [wide-end]      minmax(var(--space-gutter), 1fr)
      [full-end];
  }
  .content-grid > *        { grid-column: content; min-inline-size: 0; }
  .content-grid > .wide    { grid-column: wide; }
  .content-grid > .full-bleed { grid-column: full; }

  @media (width < 40rem) {
    .content-grid > .wide,
    .content-grid > .full-bleed { grid-column: content; }
  }
}
```

`content` spans `content-start` to `content-end`: the readable 44rem track.
`wide` spans `wide-start` to `wide-end`: the middle track plus two 10rem side
tracks, up to 64rem. `full` spans `full-start` to `full-end`: the whole grid.
The enclosing `.page` is centered and bounded by `--measure-page`, so
full-bleed means the page grid, not an unbounded `100vw` viewport breakout.
Below 40rem both opt-ins return to the content track.

**One left axis.** As shipped (layout.css), the hub grid's content track is a
single flexible track starting at the gutter, and the article grid is the
reading measure starting at that same gutter with a `wide` track that adds
room only to its right (`--wide-extra`, up to the 64rem measure). Only the
Dotfiles landing (`[data-landing]`, a hub set in the article composition)
takes that room: its hero signal row, section headings, card grids, step
list and adjacent navigation all spread to it, so every rule on the page
ends where its grids end. An article reads in one column at every width —
a table wider than the measure scrolls inside its region, an exhibit fills
the measure — so a heading rule, the header rule and the adjacent navigation
always end where the text ends (S15 asserts both: the landing wider from
64rem, an article never). The extra room is granted only when it clears
`--wide-floor` (6rem), so a wide element is plainly wider than the text or
exactly as wide, never a sliver. Everything inside a wide track starts on its
left edge — a table region narrower than its wrapper is not centred in it
(S15). Every page's text therefore starts on the header's text edge at every
width — S21 measures exactly that — so moving between a hub and an article
never shifts the column. The article column is not centred in the page; the
symmetric side tracks in the copy above are the original plan, kept for the
track names.

All **interior** tracks use `minmax(0, ...)`, and every direct child gets
`min-inline-size: 0`. This removes intrinsic min-content minimums that would
otherwise let a long path, SVG, table, or code line enlarge a track. Keep the
same shrinkability on nested grid/flex children. The two outside tracks are
deliberately `minmax(var(--space-gutter), 1fr)`, not zero-minimum tracks: the
plan's shorthand “every track” does not override its explicit gutter minimum.

Zero minimums prevent grid blowout; they do not wrap or make overflowing
content reachable by themselves. Code wraps, images scale, and tables scroll
inside their labelled regions. Never use document-level clipping to hide a
failed layout.

The engine can render `class="prose content-grid"`. In that composition the
grid root must not itself be capped at 44rem, or `wide` cannot work. Constrain
the normal text track to 44rem and the page to 80rem. The S2 readable-measure
probe must distinguish this grid root from a normal `.prose` block. A `wide`
class only affects a **direct** grid child; wrappers added by rehype must retain
the opt-in at that level. Do not repair an inaccessible nested opt-in with
page-specific selectors.

## 8. The prose primitive

`.prose` is the render boundary for every Markdown fragment: blog and case-study
bodies, docs, homepage hero/arc/principle copy, reader content, and 404 copy.
It uses `--font-body`, `--text-base`, `--leading-body`,
`--color-text-body`, and `--prose-flow`. Headings use section 4's scale.

Exactly two modifiers exist:

| Modifier | Difference | Use |
| --- | --- | --- |
| `.prose--lede` | `--text-lg`; otherwise shared body color, family, leading, and flow | Hero and article dek |
| `.prose--compact` | `--prose-flow: var(--space-4)`; body size and leading unchanged | Dense listings and summaries |

Do not combine the modifiers. Apply the selected modifier with `.prose` in the
engine render target, not as a replacement root class.

**Lists sit on the axis.** An unclassed `ul`/`ol` has no native marker
(`list-style-type: ""`, which keeps WebKit's list semantics); the marker is
drawn on the item, absolutely positioned in the list's indent
(`--list-indent`, 36px), so a number or bullet starts exactly where the
paragraph text starts and the item text starts at one fixed indent whatever
the digit count. Numbers take the capsule voice (mono, medium, subtle,
`--code-inline-size`) with their line box set to the item's leading so they
share the text's baseline; bullets are a 0.3em dot on the first line's
x-height centre. Classed lists (`.steps`) are primitives and draw their own.
A GitHub-flavoured task list (`- [x]`) renders its state as a drawn mark
(`rehype-task-lists.mjs` replaces the disabled native checkbox with a named
`span.task-mark`), never as a control that cannot be operated.

**Headings carry their own wrapper.** `rehype-heading-anchors.mjs` wraps every
article h2–h4's content in `span.heading-text` before appending the section
link. The portfolio's numbered headings are flex rows (counter, text, rule):
with the words as one item, a code span or a link inside a heading wraps with
the text instead of standing beside it as a column.

This replaces four competing wrapper arrangements:

1. Blog: `<div class="prose">` with blog-only sheet overrides.
2. Case studies: `<article class="prose case-detail-prose">`.
3. Docs: `<article class="docs-article sl-markdown-content">`.
4. Homepage fragments: `.hero-copy`, `.section-intro`, `.arc-copy`, or bare
   `<div>` used as independent typography roots.

`hero-copy` remains a content composition slot, not another prose system. The
engine supplies prose/lede treatment using the same tokens. The removed
`page-lead` hook becomes an ordinary introductory paragraph unless the engine
places that fragment in its shared lede slot. Authors do not choose a new
per-page type size.

A new content type **NEVER gets a new prose class**. Engine-owned `.prose`, its
two modifiers, and `.content-grid` are not raw-Markdown authoring hooks and
therefore are not additional entries in the content class allowlist.

## 9. Content primitives

The JSON is an exact-name contract: no `context-help*`, `shortcut-*`, or other
prefix wildcard is permission to invent another class. It contains 56 classes:
55 authorable classes and the reserved engine-generated `table-scroll`.
`usedBy` records consumers after migration, not a ban on reuse in another repo.
`wide`, `full-bleed`, and `table-scroll` are shared across all three repos.
The `element` field lists permitted tag names separated by `|`.

Every class below must have a real matching selector in `primitives.css`,
including modifiers and the reserved wrapper. Shared grid placement remains in
`layout.css`; table overflow and typography remain in `prose.css`. Selectors
for `wide`, `full-bleed`, and `table-scroll` in `primitives.css` provide content
containment (`min-inline-size: 0`), not duplicate layout or table systems. Empty
rules added only to satisfy the verifier are not implementations.

Examples are raw HTML fragments in Markdown. Child fragments belong inside the
parent described in the second column. Use native Markdown for headings, lists,
tables, links, and code when no primitive is needed. Maintain blank lines around
Markdown nested in block HTML; do not indent it into a code block.

### Introduction, surfaces, and reference content

| Class | What it renders | Repo | Example Markdown HTML |
| --- | --- | --- | --- |
| `hero` | Shared introductory section | dotfiles | `<section class="hero"><h1>A workstation I can rebuild.</h1></section>` |
| `hero-copy` | Introductory copy inside hero | dotfiles | `<p class="hero-copy">The repository rebuilds my workstation.</p>` |
| `hero-actions` | Wrapping action group inside hero | dotfiles | `<div class="hero-actions"><a href="/dotfiles/setup/">Read the setup guide</a></div>` |
| `hero-signals` | Supporting facts inside hero | dotfiles | `<dl class="hero-signals"><div><dt>Targets</dt><dd>macOS + Ubuntu</dd></div></dl>` |
| `hero-cursor` | Decorative heading mark; never a control | dotfiles | `<span class="hero-cursor" aria-hidden="true"></span>` |
| `primary-link` | Primary action link | dotfiles | `<a class="primary-link" href="/dotfiles/setup/">Read the setup guide</a>` |
| `secondary-link` | Secondary action link | dotfiles | `<a class="secondary-link" href="https://github.com/shmileee/dotfiles">Browse the repository</a>` |
| `surface-grid` | Intrinsically responsive cards, links, or `dl` entries | dotfiles | `<div class="surface-grid"><article><h3>OpenCode</h3><p>Managed configuration.</p></article></div>` |
| `steps` | Numbered process; retain native `ol` semantics | dotfiles | `<ol class="steps"><li><span aria-hidden="true">01</span><div><strong>Bootstrap</strong><p>Validate the platform.</p></div></li></ol>` |
| `tabs` | Group enhanced with generated tab controls | dotfiles | `<div class="tabs"><section class="tab" data-tab-label="macOS"><span>macOS</span><p>Install the command-line tools.</p></section></div>` |
| `tab` | Labelled content panel inside tabs; an opening `span` repeats the label as the panel eyebrow (never a heading) | dotfiles | `<section class="tab" data-tab-label="Ubuntu"><span>Ubuntu</span><p>Use an ARM64 machine.</p></section>` |
| `disclosure` | Native collapsible details | dotfiles | `<details class="disclosure"><summary>Review the installer first</summary><p>Inspect the downloaded script.</p></details>` |
| `setup-reference` | Reference grouping around ordinary Markdown tables; not the scrolling region | dotfiles | `<div class="setup-reference">` before the Markdown table, then `</div>` |
| `keys` | Key chord with native keycaps | dotfiles | `<span class="keys"><kbd>Ctrl</kbd><span>+</span><kbd>A</kbd></span>` |
| `path-token` | Inline code path or linked path; one treatment only | dotfiles | `<code class="path-token">~/.config/<wbr>opencode/<wbr>opencode.json</code>` |

### Context help

| Class | What it renders | Repo | Example Markdown HTML |
| --- | --- | --- | --- |
| `context-help-source` | Hidden source mounted by ContentInteractions | dotfiles | `<section class="context-help-source" hidden data-search-exclude data-pagefind-ignore>` around the trigger/dialog pair |
| `context-help-trigger` | Accessible dialog opener: a labelled pill ("? Quick context", the word is the engine's) fixed above the back-to-top control, parked inline in the article header below 40rem | dotfiles | `<button class="context-help-trigger" type="button" aria-controls="context-help" aria-haspopup="dialog" aria-label="Open quick context" data-context-open data-context-ui>?</button>` |
| `context-help` | Native dialog with a named heading | dotfiles | `<dialog class="context-help" id="context-help" aria-labelledby="context-help-title" data-context-dialog data-context-ui>` around its panel |
| `context-help__panel` | Dialog surface and internal scroll owner | dotfiles | `<div class="context-help__panel">` around header and terms |
| `context-help__header` | Title and close button | dotfiles | `<header class="context-help__header"><h2 id="context-help-title">Terms used on this page</h2><button type="button" data-context-close>Close</button></header>` |
| `context-help__terms` | Term definitions inside the panel | dotfiles | `<dl class="context-help__terms"><div><dt>Role</dt><dd>A focused group of Ansible tasks.</dd></div></dl>` |

### Shortcuts

| Class | What it renders | Repo | Example Markdown HTML |
| --- | --- | --- | --- |
| `shortcut-filter` | Labelled search and scope controls | dotfiles | `<div class="shortcut-filter" role="search" data-shortcut-filter>` around the labelled input and scope buttons |
| `shortcut-filter__search` | Input and clear-button group | dotfiles | `<div class="shortcut-filter__search"><label for="shortcut-query">Find a shortcut</label><input id="shortcut-query" type="search" data-shortcut-query><button type="button" data-shortcut-clear hidden>Clear</button></div>` |
| `shortcut-filter__scopes` | Scope button group | dotfiles | `<div class="shortcut-filter__scopes" role="group" aria-label="Filter shortcuts by layer"><button type="button" aria-pressed="true" data-shortcut-scope="all">All</button></div>` |
| `shortcut-filter__status` | Polite result-count announcement | dotfiles | `<p class="shortcut-filter__status" aria-live="polite" data-shortcut-status></p>` |
| `shortcut-filter-empty` | Initially hidden no-results message | dotfiles | `<p class="shortcut-filter-empty" data-shortcut-empty hidden>No shortcuts match this search.</p>` |
| `shortcut-filter-section` | Filterable reference group | dotfiles | `<section class="shortcut-reference shortcut-filter-section" data-shortcut-section="tmux">` around headings and tables |
| `shortcut-reference` | Shared shortcut reference content | dotfiles | `<section class="shortcut-reference">` around a Markdown heading and table |
| `shortcut-prefix-summary` | Prefix chord and release instruction | dotfiles | `<div class="shortcut-prefix-summary" aria-label="Prefix: Control plus A, then release" data-search-exclude>` around the label, keys, and release text |
| `shortcut-prefix-summary__label` | Prefix label | dotfiles | `<span class="shortcut-prefix-summary__label">Prefix</span>` |
| `shortcut-prefix-summary__release` | Release instruction | dotfiles | `<span class="shortcut-prefix-summary__release">then release</span>` |
| `shortcut-then` | Visible sequence separator | dotfiles | `<span class="shortcut-then">then</span>` |
| `shortcut-mode` | Editor-mode tag after a key, in Vim's mode letters (`n`, `v`, `o`, `i`); spell the letters out once in the section's intro | dotfiles | `` `<leader>/` <span class="shortcut-mode">n v</span> `` in the key cell |

### Exhibits and article media

| Class | What it renders | Repo | Example Markdown HTML |
| --- | --- | --- | --- |
| `media-exhibit` | Captioned screenshot/video exhibit | portfolio | `<figure class="media-exhibit wide" data-exhibit>` around its frame and caption |
| `media-exhibit-frame` | Toolbar and media enclosure | portfolio | `<div class="media-exhibit-frame">` around toolbar and stage |
| `media-exhibit-stage` | Responsive image/video stage | portfolio | `<div class="media-exhibit-stage"><img src="/case-studies/buttons-instead-of-incantations/atlantis-pr-buttons.png" width="1654" height="676" alt="Atlantis Plan and Apply buttons"></div>` |
| `diagram-exhibit` | SVG or semantic process diagram, including the former teardown strip | portfolio | `<div class="diagram-exhibit" data-exhibit><svg viewBox="0 0 720 500" role="img" aria-label="Image publishing pipeline"><text x="16" y="24">Manifest → build → test → publish → verify</text></svg></div>` |
| `diagram-exhibit-label` | Diagram section label | portfolio | `<div class="diagram-exhibit-label">EXHIBIT — IMAGE PROVENANCE</div>` |
| `diagram-exhibit-label-secondary` | Subsequent segment label; requires `diagram-exhibit-label` | portfolio | `<div class="diagram-exhibit-label diagram-exhibit-label-secondary">CONSUMPTION SIDE</div>` |
| `concept-diagram` | Outer semantic figure grouping diagram and caption | portfolio | `<figure class="concept-diagram wide" data-concept-diagram>` around the diagram and caption |
| `exhibit-toolbar` | Filename/format row | portfolio | `<div class="exhibit-toolbar">` around dots, filename, and badge |
| `exhibit-dots` | Decorative window dots | portfolio | `<span class="exhibit-dots" aria-hidden="true"><i></i><i></i><i></i></span>` |
| `exhibit-filename` | Wrappable filename, not clipped metadata | portfolio | `<span class="exhibit-filename" title="atlantis-pr-buttons.png">atlantis-pr-buttons.png</span>` |
| `exhibit-badge` | Media-format label | portfolio | `<span class="exhibit-badge">MP4</span>` |
| `exhibit-caption` | Visible evidence caption | portfolio | `<figcaption class="exhibit-caption"><span>EXHIBIT 01</span> — Atlantis controls inside the pull request.</figcaption>` |
| `media-figure` | Article image with ordinary figcaption | blog | `<figure class="media-figure">` around frame and caption |
| `media-figure-wide` | Large screenshot modifier; grid opt-in remains explicit | blog | `<figure class="media-figure media-figure-wide wide">` around a large screenshot |
| `media-figure-compact` | Intrinsically sized compact image, bounded by the prose track | blog | `<figure class="media-figure media-figure-compact">` around a compact screenshot |
| `media-frame` | Responsive article-image frame; holds an `<img>` or a `<video controls playsinline preload="metadata" poster>` (an MP4 recording in place of an animated GIF: a third of the bytes, a pause control, a poster) | blog | `<div class="media-frame">` around an image with width, height, and alt |
| `media-frame-dark` | Fixed dark asset backing; requires `media-frame` | blog | `<div class="media-frame media-frame-dark">` around a dark screenshot |
| `media-frame-light` | Fixed light asset backing; requires `media-frame` | blog | `<div class="media-frame media-frame-light">` around a light screenshot |
| `media-frame-scroll` | Deliberately scrollable image region; requires `media-frame` | blog | `<div class="media-frame media-frame-scroll" tabindex="0" role="region" aria-label="Scrollable tmux status-line screenshot">` around the screenshot |
| `wide` | Direct-child opt-in to the wide track | portfolio, blog, dotfiles | `<figure class="media-exhibit wide" data-exhibit>` around an exhibit |
| `full-bleed` | Direct-child opt-in to the full page-grid track | portfolio, blog, dotfiles | `<figure class="media-exhibit full-bleed" data-exhibit>` around an exhibit |
| `table-scroll` | **ENGINE-GENERATED** labelled/focusable table region | portfolio, blog, dotfiles | Write a Markdown table; **never author this class or wrapper** |

**Raster images are sized and served responsively by the build.** When
`scripts/sync-content.mjs` copies the content repositories' assets into
`public/`, it records every PNG/JPEG/WebP's dimensions and writes WebP
renditions at 640, 960 and 1440px (never wider than the file) beside it,
into `src/lib/generated/image-manifest.json` (gitignored). `rehype-images.mjs`
reads the manifest and gives every `<img>` — a Markdown image or an authored
figure — `width`, `height`, `srcset` and `sizes` (the reading measure from
80rem, the wide track between 64 and 80rem, the column below), plus
`decoding="async"` and `loading="lazy"` on all but the first. An attribute the
author wrote wins; the original stays as `src`, the fallback and the
lightbox's full-size view. Authors write `![alt](/blog-static/x.png)` and
nothing else.

Inline SVG retains meaningful `viewBox`, geometry, labels, and intrinsic media
dimensions. Remove `style="max-width:720px"`, `style="--media-exhibit-width:
840px"`, and similar layout overrides. A `diagram-exhibit` SVG scales with its
column down to a 36rem floor; below 40rem the exhibit pans sideways instead
of shrinking a flowchart's labels to four pixels, and ContentInteractions
makes it a named, focusable region only while it actually overflows. Existing SVG references such as `--w5`,
`--w45`, `--w88`, `--ab4`, and `--bg` are legacy tokens, not additions to this
system: migrate their color roles to semantic tokens. SVG geometry is not a
new page measure. Do not add page-specific selectors to preserve those aliases.

### Data attributes

These are all 16 permitted names. Presence markers have no configuration value.
Native `id`, `hidden`, `role`, `tabindex`, `aria-*`, and SVG attributes remain
available subject to semantic/accessibility rules; they are not `data-*`
entries. Engine-generated EC, Pagefind-body, and reader hooks are not invitations
to author arbitrary data attributes in Markdown.

| Attribute | Repo | Meaning / example |
| --- | --- | --- |
| `data-context-open` | dotfiles | Open button marker; pair with `aria-controls="context-help"` |
| `data-context-dialog` | dotfiles | Marker on the native context dialog |
| `data-context-close` | dotfiles | Marker on the dialog's close button |
| `data-context-ui` | dotfiles | Ancillary context trigger/dialog, not article body |
| `data-search-exclude` | dotfiles | Ancillary headings or prefix summaries excluded from engine-derived navigation/search text |
| `data-pagefind-ignore` | dotfiles | Exclude ancillary UI from Pagefind; not the article body |
| `data-tab-label` | dotfiles | Non-empty visible label, for example `data-tab-label="macOS"` |
| `data-shortcut-filter` | dotfiles | Shortcut filter root marker |
| `data-shortcut-query` | dotfiles | Labelled search-input marker |
| `data-shortcut-clear` | dotfiles | Clear-button marker |
| `data-shortcut-scope` | dotfiles | `all`, `macos`, `alacritty`, `fish`, `tmux`, `neovim`, or `opencode`; non-all keys match sections |
| `data-shortcut-status` | dotfiles | Polite live-region marker for result count |
| `data-shortcut-empty` | dotfiles | Initially hidden no-results message marker |
| `data-shortcut-section` | dotfiles | `macos`, `alacritty`, `fish`, `tmux`, `neovim`, or `opencode`; matches a scope button |
| `data-exhibit` | portfolio | Complete media or diagram exhibit; no presentation value |
| `data-concept-diagram` | portfolio | Complete conceptual figure, including its caption |

There is no `data-context-help` attribute in the audited content. Use the four
explicit `data-context-*` hooks above, not the schematic name.

### Interaction contract

- Action links, context buttons, tabs, and filter controls have default, hover,
  pressed/selected, and visible keyboard-focus states. Use semantic color,
  border, focus, and tap-size tokens. State is represented by native or ARIA
  attributes, not content-authored `is-active` classes.
- Context help uses a native modal dialog: focus enters the dialog, Escape and
  the close button dismiss it, and focus returns to the opener. The panel owns
  internal scrolling; the document remains the ordinary page scroll owner.
- Tabs keep their headings/content readable before enhancement. The engine
  generates the tablist, tab buttons, IDs, relationships, roving tabindex,
  selected state, and Arrow/Home/End keyboard behavior. Authors provide panels
  and labels, not a parallel tab controller.
- Shortcut search exposes a label, scope selection, count, clear action, and
  empty state. Hidden results do not remain keyboard targets. Without JavaScript
  all reference sections remain readable.
- Disclosures retain native summary/expanded semantics. Scrollable media and
  table regions retain keyboard reachability. Decorative dots/cursors are not
  controls; no new decorative animation is required by this consolidation.
- If state feedback needs motion, use `--dur-fast` or `--dur-base` with
  `--ease-out`; animate only transform/opacity/filter. Reduced motion removes
  non-essential movement without hiding information or disabling controls.

### Migration dispositions

`renames` and `removed` inventory old names; they are **not** a compatibility
allowlist. At cutover V9 rejects them in authored HTML. Rename each token, then
deduplicate the class list. In particular, the three hero aliases on one section
become one `hero`, not three occurrences of it.

| Old class | Canonical class |
| --- | --- |
| `experience-hero` | `hero` |
| `docs-hero` | `hero` |
| `docs-hero--home` | `hero` |
| `principle-grid` | `surface-grid` |
| `home-overview` | `surface-grid` |
| `doc-card-grid` | `surface-grid` |
| `setup-paths` | `surface-grid` |
| `install-flow` | `steps` |
| `docs-tabs` | `tabs` |
| `docs-tab` | `tab` |
| `download-disclosure` | `disclosure` |
| `repo-path` | `path-token` |
| `teardown-exhibit` | `diagram-exhibit` |

When renaming a `repo-path` link already containing `code.path-token`, retain
only one path treatment: use `a.path-token > code` or `a > code.path-token`.
Keep the URL, accessible name, and useful `<wbr>` breaks.

| Removed class or attribute | Migration |
| --- | --- |
| `setup-reference--wrap` | Drop the modifier; every table gets a central wrapper |
| `setup-reference--three` | Drop fixed column widths/minimum widths; retain `setup-reference` |
| `headerlink` | Delete the MkDocs permalink anchor; author Markdown headings |
| `data-mobile-toc-anchor` | Delete the dead hook; nothing in the engine reads it |
| `inline-code-unit` | Remove the span wrapper, preserving code and punctuation |
| `boundary-list` | Use a plain Markdown list; preserve all items and explanations |
| `page-lead` | Ordinary introductory paragraph; engine chooses shared prose/lede placement |
| `home-overview__summary` | Unclassed semantic child inside `surface-grid` |
| `home-caution` | Retain the warning aside and text inside `surface-grid`, without a home-only class |
| `home-validation` | Retain the supported-platforms aside in shared prose, without a home-only class |

Inventory additions beyond the plan's explicit rename/drop list:

- Dotfiles `index.md:9–13`: `hero-cursor`, `primary-link`, and `secondary-link`
  survive as shared hero primitives. `index.md:41–93` supplies the home wrappers
  and `doc-card-grid`; only the grid survives under `surface-grid`.
- Dotfiles `setup.md:7–9,221`: remove `page-lead` and
  `setup-reference--three`; rename `setup-paths` to `surface-grid`.
  `docs-unified.css:219–233` confirms that the three-column modifier is a
  fixed-width workaround, not a distinct content primitive.
- Portfolio `turning-container-images-from-a-liability-into-a-supply-chain/index.md:57`
  supplies `concept-diagram` and `data-concept-diagram`; retain the semantic
  figure. `environments-you-can-create-and-destroy-with-one-command/index.md:38`
  supplies `teardown-exhibit`; its semantic process diagram uses `diagram-exhibit`.
- `diagram-exhibit-label` and `diagram-exhibit-label-secondary` are explicit
  descendants, not covered by a literal `diagram-exhibit` name. The JSON also
  spells out every context-help, shortcut, exhibit, and media descendant that
  the plan described as a family.

The initial read found 69 distinct raw HTML class names and 17 data-attribute
names across the three content roots. Every old class is retained, renamed, or
removed. Content migrations can reduce those counts independently; enforce
name coverage, not a frozen inventory count. `setup-reference--wrap` was already
absent from the initial read, and `inline-code-unit` disappeared during the
portfolio migration while this contract was being validated. Both remain
explicit removals so they cannot be reintroduced.

## 10. Code

Expressive Code 0.44.2 owns fenced blocks, syntax highlighting, wrapping, copy
controls, and native editor/terminal frames. Our CSS owns inline `<code>`
entirely: Expressive Code does **not** process it.

The agreed Astro integration settings are:

| Setting | Value |
| --- | --- |
| `markdown.syntaxHighlight` | `false` — avoid a second Shiki pass |
| `markdown.remarkPlugins` | `[remarkAdmonitions]` |
| `markdown.rehypePlugins` | `[rehypeTableScroll, rehypeImages, rehypeInlineCode, rehypeTokenLinks, rehypeTaskLists, rehypeHeadingAnchors]` — table regions, sized responsive images, long-span marks, token links, task-list marks, wrapped headings with section links, in that order |
| EC `themes` | `["github-dark", "github-light"]` |
| EC `customizeTheme` | `(t) => { t.name = t.type; }` |
| EC `useDarkModeMediaQuery` | `false` |
| EC `cascadeLayer` | `"expressive-code"` |
| EC `defaultProps` | `{ wrap: false, preserveIndent: true }` — lines never wrap; a block wider than its column scrolls inside its own frame |
| EC `useThemedScrollbars` | `false` |
| EC `plugins` | `[pluginFrameTitlePath()]` (`src/lib/expressive-code-frame-title.mjs`) — splits a rendered frame title at its last slash into `.title-dir` and `.title-name` spans and repeats the whole path in a `title` tooltip |

Use the plan's `styleOverrides` mapping:

```js
styleOverrides: {
  codeFontFamily: "var(--font-mono)",
  codeFontSize: "var(--code-font-size)",
  codeLineHeight: "var(--leading-code)",
  codePaddingBlock: "var(--space-4)",
  codePaddingInline: "var(--space-5)",
  borderRadius: "var(--radius-md)",
  borderColor: "var(--code-border)",
  codeBackground: "var(--code-bg)",
  frames: {
    editorTabBarBackground: "var(--code-toolbar-bg)",
    terminalTitlebarBackground: "var(--code-toolbar-bg)"
  }
}
```

`codeForeground` is the documented root key for `--code-text` when wiring the
foreground; there is no `codeBlock.*` namespace. Keep additional overrides on
the same token contract. EC supports CSS variables in style overrides, but
some derived color operations need resolved values: integration must check
build warnings rather than assume every computed key accepts `var()`.
See [configuration](https://expressive-code.com/reference/configuration/) and
[style overrides](https://expressive-code.com/reference/style-overrides/).

Fenced code does not wrap. A wrapped command reads as two commands and a
wrapped YAML key as a broken document, so a block wider than its column
scrolls horizontally inside its own frame: the `<pre>` is the scroll container
(S4 requires exactly that of any overflowing block; V13 checks the shipped
stylesheet), prose.css draws an always-visible thin scrollbar in the border
tone on the block's own background, and ContentInteractions marks overflowing
frames so the last characters fade until the block is scrolled to its end.
Every frame carries the toolbar — the three window dots, the title when the
block has one, the copy control. Authors may still reflow long commands with
valid continuations for readability, but never to avoid a scroll.

The column holds about 71 monospace characters at the desktop measure, and
`scripts/qa/code-width.mjs` lists every built block that is wider, with the
cause of the width: a comment carrying a URL (`url-in-comment`: the link
belongs in the prose, and `npm run verify` fails on one), a comment or
transcript annotation that could be trimmed (`comment`), or code proper
(`code`: a literal, an output line, a long name, reported and left to the
author, since real output is never reflowed to avoid a scrollbar). The
measurement is static; re-measure the column and update the default when the
type scale or the column changes.

A frame title is a file path and is set verbatim: original case (a path's case
is part of it), no tracking, one line. A path the header cannot hold is cut
with an ellipsis rather than wrapped, and the cut falls on the directory, never
on the file name: the build splits the title at its last slash (the slash
travels with the name), prose.css lays the name out first and gives the
directory what is left (`stacks/aws/acme-dev…/stack.tm.hcl`, never narrower
than its ellipsis), and only a name wider than the header on its own is cut at
its end. The full path stays the element's text and its tooltip.

Inline code uses `--font-mono`, `--code-inline-size`, `--code-inline-bg`,
`--code-inline-text`, `--radius-sm`, and small token padding. It remains inline
with surrounding prose and has no `width: max-content`, forced line break, or
scroll container. **A token is one thing:** every capsule is
`white-space: nowrap`, so `pre-commit` never splits at its hyphen and
`terraform apply` never leaves `apply` on the next line (S22). That is safe
only while the token fits the narrowest line the site lays out, so the build
works out, per span, whether it would fit the 320px column less what its
context indents (a list item's 36px per level, an admonition's or card's
padding, a cell's) at the capsule size of the text around it (a paragraph
holds 30 characters, a list item 26, an h3 23, an h2 19), and marks every span
that would not with `data-long` (`src/lib/inline-code.mjs` holds the model;
`rehype-inline-code.mjs` marks Markdown and authored HTML, `inline-markdown.ts`
marks frontmatter strings). A marked span wraps the way a long URL in running
text does: at its spaces, slashes and hyphens, anywhere as the last resort,
each fragment its own closed capsule (`box-decoration-break: clone`), so a
60-character path still cannot escape a 320px viewport. A link whose whole
content is one code span (plus the optional `↗` span) is a **token link**:
`rehype-token-links.mjs` marks it `data-token-link` in Markdown, block HTML
and split inline HTML alike, and prose.css keys the capsule treatment (solid
accent edge, no underline) to the mark. A link that merely contains a code
span among words keeps its underline, or its words would be told apart from
the sentence by colour alone (WCAG 1.4.1). In a table cell a
marked span stays atomic too — the region scrolls — until the rows stack below
40rem. Scope the rule to non-fenced code, for example `.prose :not(pre) > code`,
with EC descendants excluded where needed. `path-token` adds nothing beyond
`hyphens: none`: not another font, background, or code box. Do not restore
`inline-code-unit` or `!important` fixes.

Every frame carries the toolbar, and the copy control lives in it, so it
never covers a line of code. The toolbar's dots and the control's drawn box
sit on the code's text edge (20px in from the frame). Code in a block is set
at `--code-block-scale` (0.85) of the body step and a capsule at
`--code-inline-scale` (0.85) of its text: one notion of code size.

## 11. Tables

Every table is wrapped **at build time**, after Markdown has become a table
node, by `rehypeTableScroll`. It applies to all three repositories, including
tables nested inside retained reference sections. Raw authored tables, if used,
must be parsed into the same tree before wrapping; V10 checks final HTML, not
only the Markdown-table path. Do not rely on runtime DOM surgery.

Authors write ordinary Markdown:

```md
| Command | Purpose |
| --- | --- |
| `mise run reconcile` | Apply the current workstation configuration. |
```

The engine produces this wrapper shape:

```html
<div class="table-scroll wide" tabindex="0" role="region" aria-label="Commands table">
  <table>
    <thead><tr><th scope="col">Command</th><th scope="col">Purpose</th></tr></thead>
    <tbody><tr><td><code>mise run reconcile</code></td><td>Apply the current workstation configuration.</td></tr></tbody>
  </table>
</div>
```

Derive a useful accessible name from a caption or nearest relevant heading;
fall back to a deterministic `Table 1`, `Table 2` label within that document.
Use `aria-labelledby` when referencing an existing caption/heading, otherwise
`aria-label`. Wrapping is idempotent: never nest two generated scroll regions.
Authors never write `table-scroll`, `docs-table-scroll`, or their own table
overflow wrapper. `setup-reference` is only a semantic grouping.

The region owns horizontal scrolling, with a visible focus ring and contained
inline overscroll. Tables retain native row/header/cell semantics; the wrapper
also writes the explicit `role` each part already has (`table`, `rowgroup`,
`row`, `columnheader`, `cell`) so the semantics survive the stacked rendering
below. Use intrinsic column sizing and wrappable cells; **no `min-width`
hacks**, fixed 36/42/44rem tables, or clipped `thead`. A table need not scroll
when it already fits, and the region reserves no scrollbar gutter: a table
that fits shows no strip inside its frame. No table rule may change the font
for one content family. Everything in a table is start-aligned — column
headings over their columns, key chords in the shortcut reference beside
their actions — and the region itself starts on its wrapper's left edge
(`margin-inline: 0`), so a table that fits the measure sits on the text's
axis whatever room the wide track offers to its right.

A **token column** is a body column whose every cell is one verbatim token
and nothing else — a code span, a keycap, or a link around one — or an empty
or dash placeholder among them; the last column, the description, is never
one. `rehypeTableScroll` decides this at build time, with the text nodes CSS
cannot see (`td:has(> code:first-child)` also matched "reads via `x`, owns…"
and set a sentence nowrap), and marks each cell `data-token-cell`. prose.css
keys three things on the mark: the column is exactly as wide as its widest
token (a zero preferred width, so every prose column beside it gets the rest),
each token stays on one line, and each sits on the row's centre line beside
the description it labels. A lone token in a column of sentences is a short
sentence and gets none of this; the chord cells of the shortcut reference are
keycap sequences, not code, and take their centring from primitives.css.

Column floors are three custom properties declared once on `.prose table`
(`--table-label-floor`, `--table-description-floor`, `--table-token-space`);
the sizing rules consume them and the shortcut reference narrows one. **Below
40rem a two- or three-column table stacks**: every row becomes a block with
its cells one under the other (token, then description; mode, then chord,
then action), the row hairlines between them, and the header row stays visible
as one line of column labels above the list. The floors go to zero there and a
token cell may wrap between its parts (never inside a token). This is the one
sanctioned departure from the table grid, and it exists because the token
column's atomic width plus the description floor exceed a 350px region: the
alternative was every reference table scrolling sideways on a phone with its
descriptions cut mid-word. Tables of four or more columns keep the scroll
region at every width; they are grids of data, not lists of pairs.

## 12. Theming

One theme-init script, in SiteLayout only, before content paints:

```js
const saved = localStorage.getItem("om-theme");
const preferred = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
document.documentElement.dataset.theme = saved || preferred;
```

The saved preference wins; otherwise use the OS preference. The theme toggle
stores `light` or `dark` under the same `om-theme` key. Do not duplicate the
initializer in contact, docs, portfolio, blog, redirect documents, or reader
content. V6 checks byte identity and the OS-preference branch on built routes.

The toggle itself is a round icon button whose glyph is the theme in force
(a sun in light, a moon in dark); its `aria-label` names the action. Both
drawings are in the markup and `shell.css` paints one through the
`--paint-in-light` / `--paint-in-dark` tokens (`light-dark(currentcolor,
transparent)` and its mirror), so the glyph is right on first paint and after
a router swap with no script and no `[data-theme]` selector. Use the same two
tokens for any other glyph that belongs to one theme.

Scheme plumbing, inside `tokens.css` only:

```css
@layer tokens {
  :root { color-scheme: light dark; }
  [data-theme="light"] { color-scheme: light; }
  [data-theme="dark"] { color-scheme: dark; }
}
```

Semantic tokens resolve through `light-dark()`. **`[data-theme]` selectors appear
ONLY in `tokens.css` in author CSS**. Components never branch on theme, set a
local page scheme, or reference Tier 1 values. This makes parity structural
rather than a promise to keep several theme blocks synchronized.

The distinction between author CSS and generated EC CSS is deliberate:
section 1.8's `customizeTheme` setting causes EC to generate its own
`[data-theme="dark|light"]` selection rules inside `expressive-code`. They use
the same root theme value; they are not permission for handwritten component
branches or content-authored theme overrides. A verifier that applies the
source-only selector ban indiscriminately to EC output would contradict that
required configuration. Keep generated EC handling explicit, as V3/V5 already
do; do not work around it with a second theme script.

### Document titles, descriptions and topic names

`documentTitle()` (`src/lib/site-metadata.ts`) puts the page first: "<page> -
<Section> - Oleksandr Ponomarov"; a section's own hub keeps the name first.
Ten tabs, a history list and a search result all show the start of a title,
and every page used to read "Oleksandr Ponomarov - Engineering Notes - …" to
the same cut. `verify-build` accepts either shape and nothing else. Topic and
category slugs (`kubernetes`, `devex`, `ai`) have two display forms
(`src/lib/topic-labels.ts`). Wherever topics are listed, on a note's header, a
study's header, the homepage filters and cards and the blog index directory,
they are tags: `topicTag()` is the slug as written, lower case with its
hyphens (`devex`), set in the metadata voice, small muted mono with
a middle dot between tags, with no pill and no hash. In a heading, a document
title, an RSS category or a description, `topicLabel()` gives the proper
name: a short list of names and a generic rule (hyphens to spaces, first
letter raised) for everything else, so a new category has a readable name the
day it is written. A topic page's description names the count and the newest
notes; a study may set `description` when its `summary` is too short to stand
as a snippet.

The blog index's topic directory lists the tags most-filed first as the same
pill chips the homepage topic filters use, each carrying its note count in the
subtle tone, wrapping in the sidebar and in the stacked header alike
(`components/cards.css`): one chip vocabulary across the two indexes.

### The contact page

`/contact/` is the one page that says who is behind the three sites in a form
a machine reads: a `ContactPage` JSON-LD record in its head whose `mainEntity`
is a `Person` with the email, the address (Wrocław), the job title and the two
profiles the cards link as `sameAs` (the same two carry `rel="me"`). The hero
lede is `pageDescriptions.contact`, so the page, its meta description and its
Open Graph card read the same sentence, and a mono meta line under it gives
the location, the time zone and the expected reply time. The three channels
are a list of cards; each card's link is on its heading and stretched over the
card by the link's `::after`, so the link's name is the heading ("Email me")
with the address as its description, rather than every word on the card. The
email card carries a copy control in its eyebrow row, a 44px target drawn as a
24px disc above the stretched link, which writes the address to the clipboard
(falling back to selecting it and `execCommand("copy")` where the async
clipboard is refused), shows a check in the accent tint for a moment, and
announces the result in a live region.

### Open Graph cards

Every canonical page ships a 1200×630 card at `/og/<path>.png`
(`src/lib/og.ts`, rendered by `src/pages/og/[...slug].png.ts` through satori
and sharp at build time). The card is the page's own header block, frozen:
the section's `~/oleksandr-ponomarov/…` brand path and kicker in Plex Mono
accent, the title in Bricolage Grotesque 700 with the hero cursor after the
last word, the dek in Public Sans, and a rule with the domain and author.
It is drawn in the light palette whatever the reader's theme, because link
previews sit on the sharing app's own surface, and its colours are the Tier 1
light values flattened to sRGB, the one place outside `tokens.css` a literal
colour is allowed (satori cannot read custom properties).

satori needs TrueType data, so `src/assets/og/` holds static instances of the
three site faces (Bricolage 700 at optical size 96, Public Sans 400, Plex Mono
500), generated once from the variable WOFF2 files. The layout imports only
`src/lib/og-path.ts`, so a page's `og:image` is derived from its canonical
path and a redirect page borrows its target's card. `verify-build` requires
one card per sitemap route, no card without a route, and every page's
`og:image` and `twitter:image` to name a card that was built.

## 13. Accessibility floor

Target WCAG 2.2 AA, with a project minimum of **44×44 CSS px** for standalone
controls via `--tap-size` on both inline and block dimensions. This includes
brand/navigation actions, theme/search controls, copy buttons, tabs, dialog
controls, and back-to-top. Inline prose links are exempt from box sizing, not
from focus visibility or contrast. The 44px floor is stricter than WCAG 2.5.8's
basic 24px target requirement.

- `:focus-visible` uses `--focus-width` solid `--color-focus` with
  `--focus-offset`. Do not suppress outlines or clip them inside a frame.
- The skip link is the first focusable element on every route, becomes visible
  on focus, and targets the main content. Keep a consistent viewport meta with
  `width=device-width, initial-scale=1`; never disable zoom.
- Scroll regions are focusable and labelled. Their content remains reachable
  by keyboard at 320px and at 200% text size. A tooltip is not a substitute for
  a clipped filename or cell.
- Keep one `h1`, logical heading order, named controls, native table semantics,
  labelled form fields, and meaningful image alt text. Images carry real
  width/height; diagrams carry accessible names and text explanations.
- Maintain at least 4.5:1 normal-text contrast and 3:1 large-text/UI contrast
  on the actual composited background. Palette conversion alone is not a
  contrast audit. Use an existing stronger semantic text token when needed;
  do not redesign the palette to hide an implementation defect.
- Respect `prefers-reduced-motion: reduce` in reset: remove non-essential
  animation/transitions and smooth scrolling while keeping state changes and
  all information available. Do not animate layout properties.
- Validate reading, copying code, navigating tables, filtering shortcuts, and
  closing dialogs with keyboard-only use, zoom, and reduced motion. Do not
  infer interaction accessibility from screenshots.

**Accepted debt:** no new accessibility debt is accepted by this document.
Baseline clipping, inaccessible table regions, undersized controls, and theme
splits are cutover blockers owned by the engine migration; S0–S13 define their
exit tests. Any new exception requires an explicit location, affected users,
owner, exit condition, and user acceptance here before it can be called done.

## 14. How to add something new

1. **New content type?** Render it through `.prose` in the engine. Choose lede
   or compact only when that existing role applies. Never add a prose class.
2. **New wide element?** Add `wide` to the actual direct grid child. Use
   `full-bleed` only for a full page-grid span. Never introduce another width
   variable in content.
3. **New color?** You may not add one in content or a component. Use an existing
   semantic token. A palette change is a separate design-system decision, not
   part of adding a page.
4. **Existing primitive fits?** Reuse it with semantic markup and documented
   data/ARIA attributes. Do not introduce a route selector or inline style.
5. **Genuinely new primitive?** Define its structure, states, tokens,
   responsiveness, and accessibility here; add its exact class/data names to
   `src/lib/content-primitives.json` and real selectors to
   `src/styles/primitives.css` **in one commit**. Add a rendering/interaction
   fixture, run the two-way check, and coordinate adoption in the content repos.
   A JSON entry without CSS is not a completed primitive.

## 15. Enforcement

These are the required post-cutover gates, not a claim that the current branch
has already wired them. The baseline `verify-build.mjs` checks legacy assets
and incompatible inline-code styles; rewrite those assertions with the
cutover. Keep structural/content-count verification separate from design
verification until all four repositories adopt the contract.

### Stylelint token policy

`stylelint.config.mjs` uses `stylelint-config-standard` plus:

- `declaration-no-important`: prevents another specificity/override war.
- `declaration-property-value-allowed-list` with a `tokens.css` override:
  colors, fonts, type sizes, and spacing use `var(--...)` outside the token
  file. Explicitly allow structural CSS mechanics, not arbitrary design values.
- No `--p-*` references outside `tokens.css`: prevents palette bypasses.
- No `[data-theme]` selectors outside `tokens.css`: prevents handwritten
  component/theme forks. EC's generated sheet is not a source stylesheet.

### Static design checks — `scripts/verify-design.mjs`

| Check | Enforces | Prevents |
| --- | --- | --- |
| V1 | Exact layer-order statement is first in head, precedes every stylesheet link, and matches `index.css` | EC link order changing layer precedence |
| V2 | Source CSS has only layer/import statements and comments at top level; layer names belong to the declared set | Unlayered author rules and undeclared layers |
| V3 | Built non-EC CSS has no top-level rules outside layers and no `!important` | Bundling or legacy CSS bypassing source policy |
| V4 | No legacy `/assets/` or `/blog-assets/` stylesheet links | Parallel design systems surviving cutover |
| V5 | Identical non-EC stylesheet set on every real route | Family-specific bundles or page-only CSS |
| V6 | Byte-identical theme initializer containing `prefers-color-scheme` | Different first-visit themes by section |
| V7 | Width queries use range syntax and only the five allowed breakpoints; apply to container widths too | Near-duplicate breakpoint drift |
| V8 | Every class in built HTML has a matching CSS selector | Orphan markup after moving/deleting styles |
| V9 | Every authored class/data attribute belongs to the JSON; every contract class has a selector in `primitives.css`; reject reserved, renamed, and removed authoring | Drift between engine CSS and all three content repos |
| V10 | Every table is wrapped, focusable, and accessibly named | Unreachable columns and runtime-only table fixes |
| V11 | Every image has width, height, and alt | Layout shifts and unnamed images |
| V12 | No inline `style=` except EC-generated custom-property token spans | Content-owned presentation and sizing overrides |
| V13 | No Astro `<style>` blocks except V1's exact layer-order-only head prelude | Scoped/page CSS outside the central entry |
| V14 | Every `font-size` on a `kbd` rule in `prose.css`/`primitives.css` is `var(--code-inline-size)` | Keycaps pinned to a fixed step, rendering one cap at two sizes on one page |
| V15 | Built bytes stay inside four budgets: author CSS 128KB, syntax-theme CSS 24KB, scripts 64KB, web fonts 200KB (uncompressed; about 15% over the build they were set against) | A fix that adds a subsystem rather than a rule; a design system that grows unnoticed |

V9 reads raw content HTML, not code examples or EC-generated highlighting
classes. At migration-audit time every old class must occur in `classes`,
`renames`, or `removed`; post-cutover only authorable `classes` pass. Data
attributes use `dataAttributes` or the explicit removal inventory in the same
way. A class entry is an exact selector obligation, not proof that CSS already
exists. `engineGenerated: true` always rejects raw authoring, even though the
generated class must have CSS.

V8 covers generated engine/vendor markup separately from the content allowlist.
It must match actual class selectors, not substrings such as `.tab` inside
`.table-scroll`. V12's EC exception must be tied to generated code spans, not
any arbitrary authored `style="--custom: value"`.

V14 encodes the section 4 rule that inline code and `kbd` share
`--code-inline-size`. It strips comments before matching, because `prose.css`
documents the nested-keycap case with literal `<kbd>` markup that would
otherwise read as a selector, and it fails when it finds no keycap rule at all:
a policy check that inspects nothing proves nothing.

The browser contract adds five typographic-parity scenarios alongside these
static checks. S16 SECTION HEADINGS holds every rendered `.prose h2` to one
family/size/weight/leading/tracking per viewport, so a content repo cannot
track its section headings differently from the other two. S17 COMMENTS
HEADING pins the comments heading to that same tuple, since the region sits
outside `.prose` and inherits nothing from it. S18 TABLE HEADERS does the same
for every `th`. S19 KEYCAPS asserts the keycap ratio to its parent equals the
inline-code ratio, mirroring S3 — the invariant is the ratio, never a pixel
value. S20 PROSE PARAGRAPHS holds every direct `.prose > p` to one size,
excluding only `.prose--lede`; unlike S1 it deliberately does not exclude
`header`, because the paragraph it exists to catch sits inside one.

### Browser scenarios — S0–S24

Run against a production build through `scripts/qa/measure.mjs` and
`scripts/qa/contract.mjs`. Default viewports: 320, 375, 768, and 1440px; the full
sweep uses the baseline's 11 viewports through 3440px, including the 2560px
measure probe. Run both themes. The baseline has 47 real routes; derive the
current route set from the build rather than freezing that count forever.

| Scenario | Pass condition | Prevents |
| --- | --- | --- |
| S0 | Empty localStorage, both OS schemes: all routes resolve the same root theme and body background within each scheme | Cross-section theme flips |
| S1 | One exact body-paragraph `(font-family, font-size, line-height, color)` tuple per theme at each viewport across families | Divergent Markdown typography |
| S2 | Readable prose measure ≤704px at 2560px with a 16px root; page ≤`--measure-page` | Unbounded prose and competing content widths |
| S3 | One exact normal-prose inline-code `(font, size, background, color, radius, padding)` tuple per theme at each viewport | Multiple inline-code treatments |
| S4 | Every `pre` whose lines overflow is its own scroll container (`overflow-x: auto`); none wraps or overflows the page | Wrapped commands, and code widening the page |
| S5 | Zero non-fixed elements painting outside the viewport at 320px | Hidden grid or media blowouts |
| S6 | 100% of tables inside regions with `tabindex="0"`, `role="region"`, and an accessible name | Keyboard-inaccessible columns |
| S7 | Zero standalone controls below 44×44px at 375px, counting an absolutely positioned pseudo-element hit area (a tag in a row keeps its text-width box so the dots between tags stay even); inline prose links exempt | Undersized targets |
| S8 | Identical non-EC stylesheet set across all real routes | Per-family CSS loading |
| S9 | Zero self-overflowing `overflow:hidden` containers outside the `sr-only` allowlist and the declared ellipsis (`text-overflow: ellipsis` with the full text in a `title` tooltip: a frame title's directory) | Content clipping disguised as no page overflow |
| S10 | No unauthorized inline styles; all images sized and named; exactly one `h1`; zero console errors | Content hygiene and runtime regressions |
| S11 | At 200% root text size: no page overflow, and body text scales with the rem-bearing ramp; verify browser zoom too | Viewport-only font clamps and zoom clipping |
| S12 | Homepage reader opens and fetched code has EC styling applied | Lost reader behavior or unstyled code after deleting legacy CSS |
| S13 | Skip link is first focusable, visible on focus, and works on every route | Unreachable main-content bypass |
| S14–S20 | Contrast, wide tracks, and the typographic parity set; see `scripts/qa/README.md` | Token-level drift between the three content families |
| S21 | The first child of every hub section shell, article header, article body, topic page and landing body starts on the header's text edge (1px) at every width | A region that picked up a second gutter, or an article column that drifted off the site's one left axis |
| S22 | No inline code span paints on more than one line unless the build marked it `data-long`; samples without a fragment count fail | A token split at a hyphen, a two-word command split at its space, a capsule fragmented across lines |
| S23 | Every block a prose body holds (code frame, table region, admonition, quote, figure, disclosure, tab group) starts on the paragraph text edge (1px) and, unless it opted into a wider track, ends on it; inside a list item, on the item's content edges | A table region centred in its wide wrapper, a frame with padding of its own, a block that slipped off the axis |
| S24 | The summed layout-shift score from navigation to settle is at or under 0.01 on every route, width and theme | A disclosure rendered open and closed by script after paint, an unsized image, a late font swap moving the column |

Probe actual body paragraphs for S1, not eyebrows or metadata; exclude the two
documented role modifiers from the normal-body comparison. For S2 measure the
content track when `.prose` is itself a grid, not the wide-capable grid root.
Compare equivalent surrounding text for S3 because inline code is em-sized.
For S11 calculate the ramp at the changed root size rather than requiring an
impossible exact 2× ratio from mixed rem/vw math at a fixed viewport. These
distinctions prevent test mistakes from reinstating the original design defects.

Target command surface, once the checks are wired:

```sh
direnv exec . npm run check
direnv exec . npm run lint:css
direnv exec . npm run build
direnv exec . npm run verify
direnv exec . npm run qa
direnv exec . npm run qa:full
```

`verify` runs the build and design verifiers and the code-column report in
strict mode (§10; `npm run qa:code` prints the report on its own); `test`
aggregates the required gates.
CI installs Playwright Chromium and runs check, CSS lint, verification, and QA
between build and artifact upload. Keep content-derived route counts, redirects,
search indexing, RSS, and sitemap checks in `verify-build.mjs`.

Before final cutover, inspect primitives and interaction states, then all routes
at mobile/tablet/desktop sizes against the baseline. Static checks and a green
build are not visual or keyboard QA. Record visual evidence and unresolved
debt; never make a metric pass by hiding content or flattening the existing
surface.
