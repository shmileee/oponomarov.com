#!/usr/bin/env node
/** S0–S14 are contracts, not baseline snapshots. Missing evidence is never green. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NAMES = [
  'THEME PARITY', 'PROSE TYPOGRAPHY', 'PROSE MEASURE', 'INLINE CODE',
  'CODE WRAP', 'NO ESCAPERS', 'TABLE A11Y', 'TAP TARGETS',
  'STYLESHEET PARITY', 'NO CLIPPING', 'HYGIENE', 'ZOOM', 'READER DIALOG', 'SKIP LINK',
  'CONTRAST',
];
const THEMES = ['light', 'dark'];
const key = (r) => JSON.stringify([r.route, r.viewport, r.colorScheme]);
const tuple = (value, fields) => Object.fromEntries(fields.map((field) => [field, value[field]]));
/* Inline code's size relative to the text it sits in, from the two recorded
   computed sizes. Three decimals absorb float noise in a computed px value
   (0.8750001) without hiding a real divergence (0.875 vs 1.08). null when
   either size is missing, which S3 treats as missing evidence, never a pass. */
const ratioToParent = (sample) => {
  const ratio = parseFloat(sample?.fontSize) / parseFloat(sample?.parentFontSize);
  return Number.isFinite(ratio) ? Math.round(ratio * 1000) / 1000 : null;
};

/* S14. The probe records each text sample's ink and the background painted
   behind it as opaque sRGB hex, both already composited (a translucent ink
   over its surface, a translucent surface over the layers beneath). The
   contract recomputes WCAG 2.x relative luminance and contrast from those
   two hexes rather than trusting the probe's own ratio, so the threshold
   logic is testable here without a browser. */
export const CONTRAST_KINDS = ['body-prose', 'prose-link', 'nav-link', 'nav-active', 'toc-link', 'article-meta', 'inline-code'];
const hexChannels = (hex) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) : null;
};
const relativeLuminance = (channels) => {
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast ratio of two opaque #rrggbb colours, or null when either is not one. */
export function contrastRatio(foreground, background) {
  const fg = hexChannels(foreground), bg = hexChannels(background);
  if (!fg || !bg) return null;
  const [hi, lo] = [relativeLuminance(fg), relativeLuminance(bg)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
/** WCAG large text: 18pt (24px), or 14pt (18.66px) at bold weight. Both must be finite numbers. */
export function isLargeText(fontSize, fontWeight) {
  return fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
}
export const contrastFloor = (fontSize, fontWeight) => (isLargeText(fontSize, fontWeight) ? 3 : 4.5);

export function normalizeSheets(sheets) {
  return [...new Set(sheets.map((href) => {
    const url = new URL(href, 'https://oponomarov.com');
    if (/^ec\.[^/]+\.css$/.test(url.pathname.split('/').at(-1))) return null;
    const pathname = url.pathname.replace(/(\/_astro\/.*)\.[A-Za-z0-9_-]{8}\.css$/, '$1.[hash].css');
    // Only content hashes are normalized: meaningful non-Astro query strings remain.
    return `${url.origin === 'https://oponomarov.com' ? '' : url.origin}${pathname}${url.search}`;
  }).filter(Boolean))].sort();
}

export function evaluateContract(raw) {
  const scenarios = NAMES.map((name, id) => ({ id: `S${id}`, name, failures: [] }));
  const fail = (id, r, field, actual, expected) => scenarios[id].failures.push({
    route: r?.route ?? '(run)', viewport: r?.viewport ?? '(matrix)',
    colorScheme: r?.colorScheme ?? '(both)', pass: r?.pass ?? 'normal', field,
    actual: actual === undefined ? '(missing)' : actual, expected,
  });
  const results = raw.results ?? [];
  const good = results.filter((r) => !r.error);
  const routes = raw.metadata?.routes ?? [];
  const zoomResults = raw.zoomResults ?? [];
  const wide = raw.measureResults ?? [];
  const skipLinks = raw.interactions?.skipLinks ?? [];
  const readers = raw.interactions?.readerDialogs ?? [];
  if (raw.schemaVersion !== 2 || !routes.length || !results.length) {
    for (let id = 0; id < NAMES.length; id++) fail(id, null, 'evidence', {
      schemaVersion: raw.schemaVersion, routes: routes.length, results: results.length,
    }, 'schemaVersion=2 and non-empty route/measurement manifest');
  }

  // Compare to the first observed value, not a blessed page-family exception.
  function parity(id, rows, select, field) {
    if (!rows.length) { fail(id, null, field, 'no samples', 'at least one sample'); return; }
    const expected = select(rows[0]);
    for (const row of rows) {
      const actual = select(row);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        fail(id, row, `${field} (reference ${rows[0].route} @ ${rows[0].viewport})`, actual, expected);
      }
    }
  }
  for (const colorScheme of THEMES) {
    const rows = good.filter((r) => r.colorScheme === colorScheme);
    /* Theme resolution must be identical everywhere, viewport included: a
       reader must never see one section in light and another in dark. */
    parity(0, rows, (r) => tuple(r, ['theme', 'bodyBackgroundColor']), `theme/background for OS ${colorScheme}`);

    /* Type parity is per viewport. The scale is fluid by design, so a body
       paragraph is legitimately 17px at 320px and larger at 1440px; comparing
       across widths asserts something no responsive design can satisfy. What
       must hold is that every route agrees AT a given width. */
    for (const viewport of [...new Set(rows.map((r) => r.viewport))]) {
      const atWidth = rows.filter((r) => r.viewport === viewport);
      const label = `for OS ${colorScheme} at ${viewport}`;
      const prose = atWidth.filter((r) => r.typography?.bodyProse);
      parity(1, prose, (r) => tuple(r.typography.bodyProse, ['fontFamily', 'fontSize', 'lineHeight', 'color']), `bodyProse ${label}`);
      /* S3 asserts the RATIO of inline code to the text it sits in, not one
         absolute pixel size. Inline code is em-sized on purpose: card and
         step copy sit a step below body text, and a capsule pinned to the
         body ramp rendered 8% larger than the words around it there while
         still "passing" an absolute-size check. This is a refinement, not a
         relaxation. The tuple is as strict as before in every other field,
         and it still fails if any context - paragraph, list, table cell,
         card, step, heading - renders inline code at a different fraction
         of its parent, or if a sample arrives without the evidence to
         compute that fraction. */
      const inline = atWidth.flatMap((r) => (r.code?.inlines ?? []).map((code) => ({ ...r, sample: code })));
      for (const r of inline) {
        if (ratioToParent(r.sample) === null) fail(3, r, `inline code ${r.sample.path ?? ''} size evidence`, tuple(r.sample, ['fontSize', 'parentFontSize']), 'computed fontSize and parentFontSize');
      }
      parity(3, inline.filter((r) => ratioToParent(r.sample) !== null), (r) => ({
        ...tuple(r.sample, ['fontFamily', 'backgroundColor', 'color', 'borderRadius', 'padding']),
        ratioToParent: ratioToParent(r.sample),
      }), `inline code ${label}`);
    }
  }
  parity(0, good, (r) => r.themeInitScriptHash, 'theme-init script hash');
  for (const r of good) {
    if (!r.theme || !r.bodyBackgroundColor || !r.themeInitScriptHash || r.themeInitScriptCount !== 1) {
      fail(0, r, 'theme initialization', tuple(r, ['theme', 'bodyBackgroundColor', 'themeInitScriptHash', 'themeInitScriptCount']), 'resolved theme/background and exactly one non-empty theme-init script');
    }
  }

  const normalMeasures = good.map((r) => ({ ...r, ...r.measure }));
  for (const r of [...normalMeasures, ...wide]) {
    if (!r.mainContainers?.length) fail(2, r, 'main content container', r.mainContainers, 'at least one container');
    for (const container of r.mainContainers ?? []) {
      if (!(container.width <= 1140)) fail(2, r, `${container.sel} width`, container.width, '<= 1140px (71.25rem page)');
    }
    /* 46rem is the design's reading measure (docs/design-system.md section 3);
       736px is that measure at the default root size. */
    if (r.viewportWidth === 2560) for (const container of r.proseContainers ?? []) {
      if (!(container.width <= 736)) fail(2, r, `${container.sel} width`, container.width, '<= 736px (46rem measure) at 2560px');
    }
  }
  for (const route of routes) for (const colorScheme of THEMES) {
    const r = { route, colorScheme, viewport: 'ultrawide-2560' };
    if (!wide.some((m) => m.route === route && m.colorScheme === colorScheme && m.viewportWidth === 2560 && Array.isArray(m.proseContainers))) {
      fail(2, r, 'wide measure', 'missing', '2560px prose/main measurements');
    }
  }

  for (const r of [...good, ...zoomResults.filter((r) => r.code)]) {
    for (const pre of r.code?.pres ?? []) {
      if (pre.scrollWidth > pre.clientWidth + 1) fail(4, r, `${pre.path} pre[${pre.index}] scrollWidth`, pre.scrollWidth, `<= ${pre.clientWidth + 1}px (clientWidth + 1)`);
    }
  }
  for (const r of good) {
    if (r.viewportWidth === 320) for (const e of r.escapers ?? []) {
      fail(5, r, `${e.path} horizontal bounds`, { left: e.left, right: e.right }, 'inside 320px viewport (1px tolerance; fixed excluded by probe)');
    }
    for (const [index, table] of (r.tables ?? []).entries()) {
      if (!['auto', 'scroll'].includes(table.wrapperOverflowX) || table.wrapperTabIndex !== '0' || table.wrapperRole !== 'region' || !table.wrapperLabel?.trim()) {
        fail(6, r, `table[${index}] ${table.wrapperSel}`, tuple(table, ['wrapperOverflowX', 'wrapperTabIndex', 'wrapperRole', 'wrapperLabel']),
          { wrapperOverflowX: 'auto|scroll', wrapperTabIndex: '0', wrapperRole: 'region', wrapperLabel: 'non-empty resolved accessible name' });
      }
    }
    if (r.viewportWidth === 375) for (const target of r.smallTargets ?? []) {
      if (target.inlineProseLink !== true) fail(7, r, `${target.path} (${target.text})`, { width: target.w, height: target.h }, '>= 44x44 CSS px or inline prose link');
    }
    for (const e of r.selfScrollers ?? []) {
      if (['hidden', 'clip'].includes(e.overflowX) && e.srOnly !== true) fail(9, r, `${e.path} overflow-x`, { overflowX: e.overflowX, scrollWidth: e.scrollWidth, clientWidth: e.clientWidth }, 'no hidden/clip self-overflow except .sr-only');
    }
    for (const style of r.inlineStyleAttrs ?? []) {
      /* Two inline styles are legitimate and neither is authored presentation:
         Expressive Code sets syntax colours as custom properties on token
         spans, and SiteHeader writes the reading-progress scale on every
         scroll frame. Anything else is a stylesheet's job. */
      const value = style.value ?? '';
      if (value.startsWith('--')) continue;
      if (/^transform:\s*scaleX\([\d.]+\);?$/.test(value.trim())) continue;
      fail(10, r, `${style.path} inline style`, value, 'absent, a custom property, or the reading-progress scale');
    }
    for (const image of r.imagesMissingDims ?? []) fail(10, r, `img ${image}`, 'missing width/height', 'width and height attributes');
    for (const image of r.imagesMissingAlt ?? []) fail(10, r, `img ${image}`, 'missing alt', 'alt attribute (empty permitted)');
    if (r.h1Count !== 1) fail(10, r, 'h1 count', r.h1Count, 1);
    if (r.status !== 200) fail(10, r, 'HTTP status', r.status, 200);
    for (const field of ['escapers', 'selfScrollers', 'tables', 'sheets', 'smallTargets', 'inlineStyleAttrs', 'imagesMissingDims', 'imagesMissingAlt']) {
      if (!Array.isArray(r[field])) fail(10, r, `probe field ${field}`, r[field], 'array');
    }
    if (!Array.isArray(r.code?.pres) || !Array.isArray(r.code?.inlines) || !Object.hasOwn(r.typography ?? {}, 'bodyProse')) {
      fail(10, r, 'code/prose probe', 'incomplete', 'all pre/inline samples and explicit bodyProse fingerprint or null');
    }
  }
  parity(8, good, (r) => normalizeSheets(r.sheets ?? []), 'normalized loaded stylesheet set');

  // Refuse partial/duplicate runs rather than letting filtered routes appear green.
  const viewports = raw.metadata?.viewports ?? [];
  for (const width of [320, 375, 768, 1440]) {
    if (!viewports.some((v) => v.width === width)) fail(10, null, 'viewport coverage', viewports.map((v) => v.width), `includes ${width}px`);
  }
  for (const route of routes) for (const colorScheme of THEMES) for (const viewport of viewports) {
    const identity = { route, colorScheme, viewport: viewport.name };
    const count = results.filter((r) => key(r) === key(identity)).length;
    if (count !== 1) fail(10, identity, 'measurement coverage', count, 'exactly 1 record');
    for (const [id, width] of [[5, 320], [7, 375]]) {
      if (viewport.width === width && !good.some((r) => key(r) === key(identity) && r.viewportWidth === width)) fail(id, identity, 'viewport probe', 'missing', `${width}px probe`);
    }
  }
  for (const r of [...results, ...zoomResults, ...wide, ...skipLinks, ...readers]) {
    if (r.error) fail(10, r, 'probe error', r.error, 'no probe errors');
  }
  if (!Array.isArray(raw.consoleErrors)) fail(10, null, 'console capture', 'missing', 'consoleErrors array');
  for (const r of raw.consoleErrors ?? []) fail(10, r, 'console error', r.text, 'no console errors');

  const zoomByKey = new Map(zoomResults.map((r) => [key(r), r]));
  for (const normal of results) {
    const zoom = zoomByKey.get(key(normal));
    if (!zoom || zoom.error) { fail(11, normal, 'paired zoom probe', zoom?.error ?? 'missing', '200% root-font-size measurement'); continue; }
    if (zoom.pageOverflows !== false) fail(11, zoom, 'page overflow at 200%', zoom.docScrollWidth, `<= ${zoom.viewportWidth + 1}px`);
    if (!(parseFloat(zoom.bodyFontSize) > parseFloat(normal.bodyFontSize))) fail(11, zoom, 'body font-size at 200%', zoom.bodyFontSize, `> normal ${normal.bodyFontSize}`);
  }
  for (const colorScheme of THEMES) {
    const reader = readers.find((r) => r.route === '/' && r.colorScheme === colorScheme);
    const painted = (color) => color && !['rgba(0, 0, 0, 0)', 'transparent'].includes(color);
    const opened = reader && !reader.error && reader.open === true && (reader.proseLength ?? 0) > 100;
    /* Styling is asserted only where there is code to style: the first card is
       whichever study the page actually lists, and not every one contains a
       fenced block. Substituting a different card to get a pass would test
       nothing. */
    const codeStyled = !reader?.preBackgrounds?.length || reader.preBackgrounds.some(painted);
    if (!opened || !codeStyled) {
      fail(12, reader ?? { route: '/', viewport: 'phone-375', colorScheme }, 'first-card reader', reader ?? 'missing',
        'open dialog.reader with rendered prose, and non-transparent pre when the study has code');
    }
    for (const route of routes) {
      const skip = skipLinks.find((r) => r.route === route && r.colorScheme === colorScheme);
      if (!skip || skip.error || skip.matchesSkipLink !== true || skip.insideViewport !== true) fail(13, skip ?? { route, viewport: 'phone-375', colorScheme }, 'first Tab from body', skip ?? 'missing', 'focused .skip-link with bounding rect inside viewport');
    }
  }

  /* S14 - every sampled ink clears WCAG AA against what is actually painted
     behind it, in both themes. A sample the probe could not resolve (no
     opaque layer before the root, an image, an unknown colour syntax, an
     ancestor with opacity) fails: the ratio is unknown, not acceptable. A
     theme with no sample of one of the required kinds fails too, so a probe
     that stopped finding navigation links could never pass by omission. */
  for (const r of good) {
    if (!Array.isArray(r.contrast)) { fail(14, r, 'contrast probe', r.contrast, 'array of text samples'); continue; }
    for (const sample of r.contrast) {
      const where = `${sample.kind} ${sample.path ?? sample.sel ?? ''}`.trim();
      if (!sample.foreground || !sample.background) {
        fail(14, r, `${where} background`, sample.reason ?? '(missing)', 'painted background resolved to an opaque colour');
        continue;
      }
      const ratio = contrastRatio(sample.foreground, sample.background);
      const size = Number(sample.fontSize), weight = Number(sample.fontWeight);
      if (ratio === null || !Number.isFinite(size) || !Number.isFinite(weight)) {
        fail(14, r, `${where} evidence`, tuple(sample, ['foreground', 'background', 'fontSize', 'fontWeight']), 'opaque #rrggbb ink and background with numeric font size and weight');
        continue;
      }
      const floor = contrastFloor(size, weight);
      if (ratio < floor) {
        fail(14, r, `${where} contrast`, { ratio: `${ratio}:1`, ...tuple(sample, ['color', 'foreground', 'background', 'fontSize', 'fontWeight']) },
          `>= ${floor}:1 (WCAG AA, ${floor === 3 ? 'large' : 'body'} text)`);
      }
    }
  }
  for (const colorScheme of THEMES) {
    const themed = good.filter((r) => r.colorScheme === colorScheme);
    for (const kind of CONTRAST_KINDS) {
      if (!themed.some((r) => (r.contrast ?? []).some((sample) => sample.kind === kind))) {
        fail(14, { route: '(run)', viewport: '(matrix)', colorScheme }, `${kind} samples`, 'none', `at least one ${kind} sample in the ${colorScheme} theme`);
      }
    }
  }
  return scenarios;
}

async function main() {
  const file = process.argv[2] ?? '.omo/qa/current/raw.json';
  const scenarios = evaluateContract(JSON.parse(await readFile(file, 'utf8')));
  for (const scenario of scenarios) {
    console.log(`${scenario.failures.length ? 'FAIL' : 'PASS'} ${scenario.id} ${scenario.name} (${scenario.failures.length} failures)`);
    for (const diff of scenario.failures) {
      console.log(`  ${diff.route} @ ${diff.viewport} [${diff.colorScheme}/${diff.pass}] ${diff.field}\n    actual: ${JSON.stringify(diff.actual)}\n    expected: ${JSON.stringify(diff.expected)}`);
    }
  }
  process.exitCode = scenarios.some((scenario) => scenario.failures.length) ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`Contract input error: ${error}`); process.exitCode = 1; });
}
