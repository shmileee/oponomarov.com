import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { evaluateContract, normalizeSheets } from './contract.mjs';
import { deriveRoutes } from './measure.mjs';

function fixture() {
  const routes = ['/', '/article/'];
  const viewports = [320, 375, 768, 1440].map((width) => ({ width, name: `vp-${width}` }));
  const fp = { fontFamily: 'sans-serif', fontSize: '16px', lineHeight: '24px', color: 'rgb(0, 0, 0)', backgroundColor: 'rgb(240, 240, 240)', borderRadius: '4px', padding: '2px' };
  const results = routes.flatMap((route) => ['light', 'dark'].flatMap((colorScheme) => viewports.map((vp) => ({
    route, colorScheme, viewport: vp.name, viewportWidth: vp.width,
    theme: colorScheme, bodyBackgroundColor: colorScheme === 'light' ? 'white' : 'black',
    themeInitScriptHash: '12345678', themeInitScriptCount: 1, bodyFontSize: '16px',
    typography: { bodyProse: { ...fp } },
    measure: { mainContainers: [{ sel: 'main', width: Math.min(vp.width, 1280) }], proseContainers: [] },
    code: { pres: [], inlines: [{ ...fp }] }, escapers: [], tables: [], smallTargets: [],
    selfScrollers: [], inlineStyleAttrs: [], imagesMissingDims: [], imagesMissingAlt: [],
    h1Count: 1, status: 200, sheets: ['/_astro/main.ABCdef12.css'],
  }))));
  return {
    schemaVersion: 2, metadata: { routes, viewports }, results, consoleErrors: [],
    zoomResults: results.map((r) => ({ route: r.route, viewport: r.viewport, colorScheme: r.colorScheme, viewportWidth: r.viewportWidth, bodyFontSize: '32px', pageOverflows: false })),
    measureResults: routes.flatMap((route) => ['light', 'dark'].map((colorScheme) => ({ route, colorScheme, viewport: 'ultrawide-2560', viewportWidth: 2560, mainContainers: [{ sel: 'main', width: 1280 }], proseContainers: [{ sel: '.prose', width: 704 }] }))),
    interactions: {
      skipLinks: routes.flatMap((route) => ['light', 'dark'].map((colorScheme) => ({ route, colorScheme, matchesSkipLink: true, insideViewport: true }))),
      readerDialogs: ['light', 'dark'].map((colorScheme) => ({ route: '/', colorScheme, open: true, preBackgrounds: ['rgb(24, 24, 24)'] })),
    },
  };
}

test('complete valid evidence passes all 14 scenarios', () => {
  assert.deepEqual(evaluateContract(fixture()).map((s) => s.failures.length), Array(14).fill(0));
});

const violations = [
  (raw) => { raw.results[0].theme = 'dark'; },
  (raw) => { raw.results[0].typography.bodyProse.fontSize = '17px'; },
  (raw) => { raw.measureResults[0].proseContainers[0].width = 704.01; },
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
