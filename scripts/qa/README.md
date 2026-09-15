# Design-system QA

Run commands from the repo root with **direnv**, which supplies the content roots:

```sh
direnv exec . npm run build
direnv exec . npm run qa
direnv exec . npm run qa:report
direnv exec . npm run qa:full
direnv exec . node --test scripts/qa/contract.test.mjs
```

`qa` uses 320, 375, 768 and 1440px; `qa:full` uses all 11 viewports
(320–3440px) and captures screenshots. Both test light and dark OS preferences
with a new browser context for **each** route/viewport/theme, so localStorage
is empty before the site's scripts run. Chromium is always headless. The harness
starts and closes its own loopback static server; no preview server is needed.

Routes come from `dist/sitemap.xml` plus `/404.html`. If the sitemap is absent,
the harness walks HTML files, skipping meta-refresh redirects. An invalid or
empty sitemap is an error, not an excuse to silently omit routes.

Artifacts default to `.omo/qa/current/raw.json`; `--out=.omo/qa/<name>` selects
another gitignored output directory. The harness refuses to overwrite
`.omo/qa/baseline/`. Screenshots are separated by OS theme and viewport.

Every ordinary measurement has a paired 200% root-font-size measurement for S11.
`--zoom` additionally records the **full** probe at 200% in `zoomResults`:

```sh
direnv exec . node scripts/qa/measure.mjs --zoom --out=.omo/qa/zoom
direnv exec . node scripts/qa/contract.mjs .omo/qa/zoom/raw.json
```

Normal results are captured before any injected root style or interaction.
The injected style is restored before a supplementary, width-only 2560px probe
for S2. Thus the fast matrix still supplies real evidence for S2 and S11.
Keyboard and first-card reader interactions run separately, at 375px in both
themes. S12 tests the actual first card, never a substitute selected for passing.

`--routes=/,/blog/` and `--viewports=phone-320,laptop-1440` are diagnostic filters.
The contract rejects incomplete route/default-viewport coverage. Do not use
filtered runs as a release gate. Missing probes also fail hygiene rather than
producing vacuous passes. Prose and inline-code parity compare all normal
samples within each OS preference; routes without prose or code have no sample
for that invariant. `firstParagraph` retains a generic fallback for diagnostics;
`bodyProse` only uses the explicit prose selectors and is the S1 input.

S14 (CONTRAST) samples body prose, prose links, navigation links, the active
navigation item, TOC links, article meta and inline code on every route,
viewport and OS preference. The probe converts Chrome's computed colours
exactly (it reports `oklch()`, not `rgb()`), composites the ink over every
translucent background layer down to the first opaque one (a gradient counts
each stop and the worst pair is kept), and records both as opaque hex. The
contract recomputes WCAG contrast from that pair: 4.5:1 under 24px (or under
18.66px bold), 3:1 at or above. A background the probe could not resolve
fails, and each of the seven kinds must appear in both themes.

S15 (WIDE TRACKS) measures the article body grid on every article route: the
content, `wide` and `full-bleed` tracks (with throwaway children placed in each
and removed), the sticky TOC rail's left edge, every direct child's horizontal
bounds, and every table region's width, its parent's width and whether it
scrolls. The contract requires `wide >= content` and `full >= wide` everywhere,
`wide > content` from 1024px where no TOC rail stands beside the body and
`wide == content` where one does (the room beside the rail is under
layout.css's `--wide-floor`, so the track collapses rather than leave a sliver),
the content track on the wide track's left edge (wide grows to the right), no
child under the rail, every child inside the track it opted into, every table
region on its wrapper's left edge (never centred in a wide wrapper), and any
scrolling table region to have first taken the smaller of its parent's width
and the wide track.

S16–S20 check typographic parity within each viewport and OS preference:
section headings (S16), comments headings against section headings (S17), table
headers (S18), keycaps (S19), and direct prose paragraphs (S20). Samples are
rendered-only, excluding closed-dialog chrome that has computed styles but no
box. S19 samples `.prose kbd`, not all `kbd` elements (global-search keycaps are
component chrome), and compares the computed size ratio to the parent and to
inline code, never an absolute pixel size. S20 excludes `.prose--lede`, whose
larger type is intentional, but deliberately does **not** exclude `header`:
the blog archive intro is prose inside one. Empty sample sets fail their
scenario; absent parity arrays or `code.kbds` also fail S10 hygiene.

S21 (GUTTER PARITY) records the header's text edge (`.op-header__inner` plus
its inline padding) and the left edge of the first rendered child of every
hub section shell, article header, article body, topic page and landing body.
Every one of them must sit on the header edge at every width: the site has one
left axis, hubs and articles alike. A route with no measurable shell fails.
This is the double-gutter class: a `full-bleed` wrapper around a nested content grid was pulled into the content track on a
phone and its section started 20px in from the hero above it.

S22 (ATOMIC TOKENS) records, for every non-fenced `code` span, the number of
lines it paints on and whether the build marked it `data-long`
(`src/lib/inline-code.mjs`: too long for the 320px column in its context at
its capsule size).
A span under the threshold that paints on two lines — `pre-commit` split at
its hyphen, `terraform apply` split at its space — fails; only marked spans
may wrap. A sample without the fragment count is missing evidence.

The checker prints all 23 PASS/FAIL lines with actual/expected evidence for each
failure and exits 1 if any scenario fails. The report is informational, supports
the old baseline schema, and exits normally even when contracts are red. The
current design is intentionally red; these assertions must not be relaxed to
match it. No baseline values are used as expected design values.
