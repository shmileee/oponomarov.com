import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CONTRAST_KINDS, contrastRatio, evaluateContract, isLargeText, normalizeSheets } from './contract.mjs';
import { deriveRoutes } from './measure.mjs';

function fixture() {
  const routes = ['/', '/article/'];
  const viewports = [320, 375, 768, 1440].map((width) => ({ width, name: `vp-${width}` }));
  const fp = { fontFamily: 'sans-serif', fontSize: '16px', lineHeight: '24px', color: 'rgb(0, 0, 0)', backgroundColor: 'rgb(240, 240, 240)', borderRadius: '4px', padding: '2px' };
  /* Inline code carries the size of the text it sits in: S3 compares the ratio. */
  const inlineFp = { ...fp, fontSize: '14px', parentFontSize: '16px', ratio: 0.875 };
  /* S14: one sample of every required kind, ink and painted background as
     opaque hex. #595959 on white is 7:1; the probe's own ratio is ignored. */
  const contrast = CONTRAST_KINDS.map((kind) => ({
    kind, sel: kind, path: `main ${kind}`, color: 'oklch(0.44 0 0)', fontSize: 16, fontWeight: 400,
    foreground: '#595959', background: '#ffffff', ratio: 7, reason: null,
  }));
  /* S15: an article body whose wide track is real. At 1440 the content track
     (736px) sits centred in a 780px wide track beside a rail at 1018; below
     that the three tracks coincide. The one scrolling table took every pixel
     its 780px wrapper offered. */
  const articleGrid = (vp) => {
    const content = vp.width >= 1024 ? { left: 220, right: 956, width: 736 } : { left: 20, right: vp.width - 20, width: vp.width - 40 };
    const wide = vp.width >= 1024 ? { left: 198, right: 978, width: 780 } : { ...content };
    return {
      content, wide, full: { ...wide }, rail: vp.width >= 1280 ? 1018 : null,
      children: [{ sel: 'p', left: content.left, right: content.right, optIn: null }, { sel: 'div.setup-reference.wide', left: wide.left, right: wide.right, optIn: 'wide' }],
      tables: [{ sel: 'div.table-scroll', label: 'Roles', width: wide.width, parentWidth: wide.width, scrolls: true }],
    };
  };
  const results = routes.flatMap((route) => ['light', 'dark'].flatMap((colorScheme) => viewports.map((vp) => ({
    route, colorScheme, viewport: vp.name, viewportWidth: vp.width,
    theme: colorScheme, bodyBackgroundColor: colorScheme === 'light' ? 'white' : 'black',
    themeInitScriptHash: '12345678', themeInitScriptCount: 1, bodyFontSize: '16px',
    typography: { bodyProse: { ...fp } },
    measure: { mainContainers: [{ sel: 'main', width: Math.min(vp.width, 1140) }], proseContainers: [] },
    code: { pres: [], inlines: [{ ...inlineFp }] }, escapers: [], tables: [], smallTargets: [],
    selfScrollers: [], inlineStyleAttrs: [], imagesMissingDims: [], imagesMissingAlt: [],
    contrast: contrast.map((sample) => ({ ...sample })),
    articleGrid: route === '/article/' ? articleGrid(vp) : null,
    h1Count: 1, status: 200, sheets: ['/_astro/main.ABCdef12.css'],
  }))));
  return {
    schemaVersion: 2, metadata: { routes, viewports }, results, consoleErrors: [],
    zoomResults: results.map((r) => ({ route: r.route, viewport: r.viewport, colorScheme: r.colorScheme, viewportWidth: r.viewportWidth, bodyFontSize: '32px', pageOverflows: false })),
    measureResults: routes.flatMap((route) => ['light', 'dark'].map((colorScheme) => ({ route, colorScheme, viewport: 'ultrawide-2560', viewportWidth: 2560, mainContainers: [{ sel: 'main', width: 1140 }], proseContainers: [{ sel: '.prose', width: 704 }] }))),
    interactions: {
      skipLinks: routes.flatMap((route) => ['light', 'dark'].map((colorScheme) => ({ route, colorScheme, matchesSkipLink: true, insideViewport: true }))),
      readerDialogs: ['light', 'dark'].map((colorScheme) => ({ route: '/', colorScheme, open: true, proseLength: 500, preBackgrounds: ['rgb(24, 24, 24)'] })),
    },
  };
}

test('complete valid evidence passes all 16 scenarios', () => {
  assert.deepEqual(evaluateContract(fixture()).map((s) => s.failures.length), Array(16).fill(0));
});


const violations = [
  (raw) => { raw.results[0].theme = 'dark'; },
  (raw) => { raw.results[0].typography.bodyProse.fontSize = '17px'; },
  (raw) => { raw.measureResults[0].proseContainers[0].width = 736.01; },
  (raw) => { raw.results[0].code.inlines.push({ ...raw.results[0].code.inlines[0], padding: '3px' }); },
  (raw) => { raw.results[0].code.pres.push({ path: 'pre', index: 1, scrollWidth: 102, clientWidth: 100 }); },
  (raw) => { raw.results[0].escapers.push({ path: 'div', left: 0, right: 322 }); },
  (raw) => { raw.results[0].tables.push({ wrapperOverflowX: 'auto', wrapperTabIndex: '-1', wrapperRole: 'region', wrapperLabel: 'Data' }); },
  (raw) => { raw.results[1].smallTargets.push({ path: 'a', w: 43, h: 44, inlineProseLink: false }); },
  (raw) => { raw.results[0].sheets.push('/extra.css'); },
  (raw) => { raw.results[0].selfScrollers.push({ path: 'div', overflowX: 'clip', srOnly: false }); },
  (raw) => { raw.results[0].inlineStyleAttrs.push({ path: 'span', value: '' }); },
  (raw) => { raw.zoomResults[0].bodyFontSize = '16px'; },
  (raw) => { raw.interactions.readerDialogs[0].preBackgrounds = ['rgba(0, 0, 0, 0)']; },
  (raw) => { raw.interactions.skipLinks[0].insideViewport = false; },
  /* #949494 on white is 3.03:1: fine for large text, a failure for body text. */
  (raw) => { raw.results[0].contrast[0].foreground = '#949494'; },
  /* A wide track that collapsed onto the content track at desktop width. */
  (raw) => { const r = raw.results.find((r) => r.route === '/article/' && r.viewportWidth === 1440); r.articleGrid.wide = { ...r.articleGrid.content }; r.articleGrid.full = { ...r.articleGrid.content }; },
];
for (const [id, mutate] of violations.entries()) {
  test(`S${id} rejects its violation with route/viewport and actual/expected evidence`, () => {
    const raw = fixture();
    mutate(raw);
    const scenario = evaluateContract(raw)[id];
    assert.ok(scenario.failures.length > 0);
    assert.ok(scenario.failures.every((f) => f.route && f.viewport && Object.hasOwn(f, 'actual') && Object.hasOwn(f, 'expected')));
  });
}

test('S3 compares inline code as a ratio of its parent, never as an absolute size', () => {
  /* A card capsule at 14px inside 13px copy is the defect the ratio catches:
     identical absolute size, different proportion. */
  const raw = fixture();
  raw.results[0].code.inlines.push({ ...raw.results[0].code.inlines[0], parentFontSize: '13px' });
  assert.ok(evaluateContract(raw)[3].failures.length > 0);
  /* The same proportion at a different absolute size is the design working:
     a 21px capsule inside a 24px heading is still 0.875. */
  const scaled = fixture();
  scaled.results[0].code.inlines.push({ ...scaled.results[0].code.inlines[0], fontSize: '21px', parentFontSize: '24px' });
  assert.equal(evaluateContract(scaled)[3].failures.length, 0);
  /* A sample without the parent size is missing evidence, not a pass. */
  const blind = fixture();
  delete blind.results[0].code.inlines[0].parentFontSize;
  assert.ok(evaluateContract(blind)[3].failures.length > 0);
});

test('S14 measures WCAG contrast from the painted pair and applies the large-text floor', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#767676', '#ffffff'), 4.54);
  assert.equal(contrastRatio('#ffffff', '#0b1220'), contrastRatio('#0b1220', '#ffffff'));
  assert.equal(contrastRatio('oklch(1 0 0)', '#ffffff'), null);
  assert.equal(isLargeText(24, 400), true);
  assert.equal(isLargeText(18.66, 700), true);
  assert.equal(isLargeText(18.66, 600), false);
  assert.equal(isLargeText(23.9, 400), false);
  /* 3.03:1 passes at 24px, and at 18.66px bold, but not at 18.66px semibold. */
  const large = fixture();
  large.results[0].contrast.push({ ...large.results[0].contrast[0], foreground: '#949494', fontSize: 24, fontWeight: 400 });
  large.results[0].contrast.push({ ...large.results[0].contrast[0], foreground: '#949494', fontSize: 18.66, fontWeight: 700 });
  assert.equal(evaluateContract(large)[14].failures.length, 0);
  large.results[0].contrast.push({ ...large.results[0].contrast[0], foreground: '#949494', fontSize: 18.66, fontWeight: 600 });
  assert.equal(evaluateContract(large)[14].failures.length, 1);
  /* 4.5:1 exactly is the floor, not a failure; the probe's own ratio field is not trusted. */
  const edge = fixture();
  edge.results[0].contrast.push({ ...edge.results[0].contrast[0], foreground: '#767676', ratio: 1 });
  assert.equal(evaluateContract(edge)[14].failures.length, 0);
  edge.results[0].contrast.push({ ...edge.results[0].contrast[0], foreground: '#777777', ratio: 21 });
  assert.equal(evaluateContract(edge)[14].failures.length, 1);
});

test('S14 never passes on missing evidence: unresolved backgrounds, absent kinds, absent probes', () => {
  const unresolved = fixture();
  unresolved.results[0].contrast.push({ kind: 'prose-link', path: 'main a', color: 'oklch(0.5 0.2 262)', fontSize: 16, fontWeight: 400, foreground: null, background: null, ratio: null, reason: 'background-image "url(...)" on div.card' });
  const [failure] = evaluateContract(unresolved)[14].failures;
  assert.ok(failure && /background/.test(failure.field) && /background-image/.test(failure.actual));
  /* A background the probe resolved but could not name as opaque hex is not evidence either. */
  const malformed = fixture();
  malformed.results[0].contrast.push({ ...malformed.results[0].contrast[0], background: 'rgba(0, 0, 0, 0)' });
  assert.ok(evaluateContract(malformed)[14].failures.length > 0);
  /* Every required kind must be sampled in both themes; a theme that lost its
     navigation samples fails even when every recorded sample is fine. */
  const missingKind = fixture();
  for (const r of missingKind.results.filter((r) => r.colorScheme === 'dark')) r.contrast = r.contrast.filter((s) => s.kind !== 'nav-active');
  const failures = evaluateContract(missingKind)[14].failures;
  assert.equal(failures.length, 1);
  assert.equal(failures[0].colorScheme, 'dark');
  assert.ok(/nav-active/.test(failures[0].field));
  /* An optional kind (the TOC label) is checked when present but not required. */
  const optional = fixture();
  optional.results[0].contrast.push({ ...optional.results[0].contrast[0], kind: 'toc-label', foreground: '#949494' });
  assert.equal(evaluateContract(optional)[14].failures.length, 1);
  const absent = fixture();
  delete absent.results[0].contrast;
  assert.ok(evaluateContract(absent)[14].failures.some((f) => f.field === 'contrast probe'));
});

test('only the specified target, clipping and inline-style exceptions pass', () => {
  const raw = fixture();
  raw.results[1].smallTargets.push({ w: 8, h: 20, inlineProseLink: true });
  raw.results[0].selfScrollers.push({ overflowX: 'hidden', srOnly: true });
  raw.results[0].inlineStyleAttrs.push({ value: '--0:#fff;--1:#000' });
  raw.results[0].tables.push({ wrapperOverflowX: 'scroll', wrapperTabIndex: '0', wrapperRole: 'region', wrapperLabel: 'Data' });
  raw.results[0].code.pres.push({ scrollWidth: 101, clientWidth: 100 });
  assert.ok(evaluateContract(raw).every((s) => !s.failures.length));
});

test('stylesheet normalization preserves file families, queries and non-Astro names', () => {
  assert.deepEqual(normalizeSheets(['/_astro/index.ABCdef12.css', '/_astro/index.XYZabc12.css', '/_astro/ec.ABCdef12.css', '/assets/a.ABCdef12.css?v=1']),
    ['/_astro/index.[hash].css', '/assets/a.ABCdef12.css?v=1']);
});

test('empty, old-schema, incomplete-route and missing-interaction evidence cannot pass', () => {
  assert.ok(evaluateContract({}).every((s) => s.failures.length));
  const raw = fixture();
  raw.results.pop();
  raw.zoomResults.shift();
  raw.measureResults.shift();
  raw.interactions.skipLinks = [];
  raw.interactions.readerDialogs = [];
  const scenarios = evaluateContract(raw);
  for (const id of [2, 10, 11, 12, 13]) assert.ok(scenarios[id].failures.length);
});

test('missing theme script, unnamed table, zoom overflow, errors and missing images fail', () => {
  const raw = fixture();
  raw.results[0].themeInitScriptHash = null;
  raw.results[0].tables.push({ wrapperOverflowX: 'auto', wrapperTabIndex: '0', wrapperRole: 'region', wrapperLabel: ' ' });
  raw.results[0].imagesMissingDims.push('/image.png');
  raw.results[0].imagesMissingAlt.push('/image.png');
  raw.results[0].h1Count = 2;
  raw.results[1].error = 'probe failure';
  raw.consoleErrors.push({ text: 'console failure' });
  raw.zoomResults[0].pageOverflows = true;
  for (const id of [0, 6, 10, 11]) assert.ok(evaluateContract(raw)[id].failures.length);
});

test('routes derive from sitemap or recursive HTML, excluding refresh stubs', async () => {
  const artifacts = fileURLToPath(new URL('../../.omo/qa/', import.meta.url));
  await mkdir(artifacts, { recursive: true });
  const dist = await mkdtemp(path.join(artifacts, 'route-test-'));
  try {
    await mkdir(path.join(dist, 'article'));
    await writeFile(path.join(dist, 'index.html'), '<h1>Home</h1>');
    await writeFile(path.join(dist, 'article/index.html'), '<h1>Article</h1>');
    await writeFile(path.join(dist, '404.html'), '<h1>Not found</h1>');
    await writeFile(path.join(dist, 'redirect.html'), '<meta http-equiv="refresh" content="0;url=/">');
    assert.deepEqual(await deriveRoutes(dist), ['/', '/404.html', '/article/']);
    await writeFile(path.join(dist, 'sitemap.xml'), '<urlset><url><loc>https://oponomarov.com/new/</loc></url></urlset>');
    assert.deepEqual(await deriveRoutes(dist), ['/404.html', '/new/']);
    await writeFile(path.join(dist, 'sitemap.xml'), '<urlset/>');
    await assert.rejects(deriveRoutes(dist), /no routes/);
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
});

test('S15 checks every track relation, the rail, child containment and scrolling tables, and never passes on a missing probe', () => {
  const at1440 = (raw) => raw.results.find((r) => r.route === '/article/' && r.viewportWidth === 1440);
  /* Routes without an article body carry null and have no sample. */
  assert.equal(evaluateContract(fixture())[15].failures.length, 0);
  /* A child that reaches under the rail. */
  const underRail = fixture();
  at1440(underRail).articleGrid.children.push({ sel: 'figure.media-exhibit', left: 220, right: 1030, optIn: null });
  assert.ok(evaluateContract(underRail)[15].failures.some((f) => /under the TOC rail/.test(f.field)));
  /* A child off its track, and a wide track the content is not centred in. */
  const offTrack = fixture();
  at1440(offTrack).articleGrid.children.push({ sel: 'div.stray', left: 100, right: 500, optIn: null });
  at1440(offTrack).articleGrid.wide = { left: 220, right: 1000, width: 780 };
  const fields = evaluateContract(offTrack)[15].failures.map((f) => f.field);
  assert.ok(fields.some((f) => /div\.stray inside its content track/.test(f)));
  assert.ok(fields.some((f) => /centred/.test(f)));
  /* A table that scrolls without first taking the room its wrapper offers. */
  const earlyScroll = fixture();
  at1440(earlyScroll).articleGrid.tables.push({ sel: 'div.table-scroll', label: 'Early', width: 736, parentWidth: 780, scrolls: true });
  assert.ok(evaluateContract(earlyScroll)[15].failures.some((f) => /scrolls before taking its room/.test(f.field)));
  /* The same table inside a section that is itself only 736px wide is fine. */
  const sectioned = fixture();
  at1440(sectioned).articleGrid.tables.push({ sel: 'div.table-scroll', label: 'Sectioned', width: 736, parentWidth: 736, scrolls: true });
  assert.equal(evaluateContract(sectioned)[15].failures.length, 0);
  /* A probe that recorded nothing is missing evidence, not a pass. */
  const blind = fixture();
  delete at1440(blind).articleGrid;
  assert.ok(evaluateContract(blind)[15].failures.some((f) => f.field === 'article grid probe'));
});
