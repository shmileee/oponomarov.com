#!/usr/bin/env node
/** Summarizes measure.mjs raw.json into a human-readable defect report. */
import { readFileSync } from 'node:fs';
import { evaluateContract, normalizeSheets } from './contract.mjs';

const file = process.argv[2] ?? '.omo/qa/current/raw.json';
const raw = JSON.parse(readFileSync(file, 'utf8'));
const { results, consoleErrors } = raw;

const family = (route) => {
  if (route === '/') return 'home';
  if (route.startsWith('/blog/posts/')) return 'blog-post';
  if (route.startsWith('/blog/categories/')) return 'blog-category';
  if (route === '/blog/') return 'blog-index';
  if (route.startsWith('/case-studies/')) return 'case-study';
  if (route === '/dotfiles/') return 'dotfiles-index';
  if (route.startsWith('/dotfiles/')) return 'dotfiles-doc';
  if (route.startsWith('/contact')) return 'contact';
  if (route.startsWith('/404')) return '404';
  return 'other';
};

const line = (s) => console.log(s);
const H = (s) => { console.log(`\n${'='.repeat(78)}\n${s}\n${'='.repeat(78)}`); };

H('0. SCENARIO CONTRACT SUMMARY');
if (raw.schemaVersion === 2) {
  for (const s of evaluateContract(raw)) line(`${s.failures.length ? 'FAIL' : 'PASS'} ${s.id} ${s.name} (${s.failures.length} failures)`);
} else line('Legacy baseline: diagnostic report only; recapture for S0–S13.');
H('0b. FRESH-VISITOR THEME RESOLUTION');
for (const colorScheme of ['light', 'dark']) {
  const samples = results.filter((r) => r.colorScheme === colorScheme);
  for (const value of new Set(samples.map((r) => `${family(r.route)}: theme=${r.theme} body=${r.bodyBackgroundColor} init=${r.themeInitScriptHash}`))) line(`  OS ${colorScheme} ${value}`);
}

// ---------------------------------------------------------------- 1. OVERFLOW
H('1. PAGE-LEVEL HORIZONTAL OVERFLOW (document scrollWidth > viewport)');
const of = results.filter((r) => r.pageOverflows);
if (of.length === 0) line('  none');
else {
  const byVp = {};
  for (const r of of) (byVp[`${r.viewport}/${r.colorScheme ?? 'legacy'}`] ??= []).push(r);
  for (const [vp, rs] of Object.entries(byVp)) {
    line(`\n  ${vp}  (${rs.length} routes overflow)`);
    for (const r of rs.sort((a, b) => b.pageOverflowBy - a.pageOverflowBy).slice(0, 12)) {
      line(`    +${String(r.pageOverflowBy).padStart(5)}px  ${r.route}`);
    }
  }
}

// ------------------------------------------------- 2. ELEMENTS ESCAPING VIEWPORT
H('2. ELEMENTS PAINTING OUTSIDE THE VIEWPORT (worst offenders)');
const esc = [];
for (const r of results) for (const e of r.escapers ?? []) esc.push({ ...e, route: r.route, viewport: r.viewport });
const escKey = {};
for (const e of esc) {
  const k = `${e.viewport} | ${e.sel}`;
  if (!escKey[k] || e.overshoot > escKey[k].overshoot) escKey[k] = e;
}
const escTop = Object.values(escKey).sort((a, b) => b.overshoot - a.overshoot).slice(0, 25);
if (escTop.length === 0) line('  none');
for (const e of escTop) line(`  +${String(e.overshoot).padStart(5)}px  ${e.viewport.padEnd(15)} ${e.sel}\n              ${e.route}`);

// --------------------------------------------------- 3. INTERNAL SCROLLERS
H('3. HORIZONTAL SCROLL CONTAINERS (scrollWidth > clientWidth)');
const sc = [];
for (const r of results) for (const s of r.selfScrollers ?? []) sc.push({ ...s, route: r.route, viewport: r.viewport, fam: family(r.route) });
line(`  total occurrences: ${sc.length}`);
const clipped = sc.filter((s) => s.clipped && !s.srOnly);
const visible = sc.filter((s) => !s.clipped && !s.scrollable);
line(`  of which overflow:hidden/clip (CONTENT IS CUT OFF, unreachable): ${clipped.length}`);
line(`  of which overflow:visible   (VISUAL BREAKOUT, no affordance):    ${visible.length}`);
const scAgg = {};
for (const s of sc) {
  const k = `${s.fam} | ${s.sel} | ${s.overflowX}`;
  scAgg[k] ??= { n: 0, maxExcess: 0, vps: new Set(), route: s.route };
  scAgg[k].n += 1;
  scAgg[k].maxExcess = Math.max(scAgg[k].maxExcess, s.excess);
  scAgg[k].vps.add(s.viewport);
}
line('\n  by page family / selector / overflow-x:');
for (const [k, v] of Object.entries(scAgg).sort((a, b) => b[1].maxExcess - a[1].maxExcess).slice(0, 30)) {
  line(`    max +${String(v.maxExcess).padStart(5)}px  x${String(v.n).padStart(4)}  ${k}`);
}
if (visible.length) {
  line('\n  !! overflow:visible breakouts (these visually break the page):');
  const vAgg = {};
  for (const s of visible) { const k = `${s.fam} | ${s.sel}`; vAgg[k] = Math.max(vAgg[k] ?? 0, s.excess); }
  for (const [k, v] of Object.entries(vAgg).sort((a, b) => b[1] - a[1])) line(`    +${String(v).padStart(5)}px  ${k}`);
}

// ------------------------------------------------------ 4. STYLESHEET SETS
H('4. STYLESHEET SETS PER PAGE FAMILY (root cause of divergence)');
const sheetsBy = {};
for (const r of results) {
  if (r.viewport !== 'laptop-1440') continue;
  const f = family(r.route);
    const key = normalizeSheets(r.sheets ?? []).join('\n      ');
  (sheetsBy[f] ??= new Set()).add(key);
}
for (const [f, set] of Object.entries(sheetsBy)) {
  line(`\n  ${f}:`);
  for (const k of set) line(`      ${k}`);
}

// --------------------------------------------------------- 5. TYPOGRAPHY
H('5. PROSE TYPOGRAPHY FINGERPRINT @ laptop-1440 (divergence = defect)');
const tRows = {};
for (const r of results) {
  if (r.viewport !== 'laptop-1440' || !(r.typography?.bodyProse ?? r.typography?.firstParagraph)) continue;
  const p = r.typography.bodyProse ?? r.typography.firstParagraph;
  const k = `${family(r.route)}/${r.colorScheme ?? 'legacy'}`;
  tRows[k] ??= new Set();
  tRows[k].add(`sel=${r.typography.bodyProseSelector ?? r.typography.firstParagraphSelector ?? r.typography.proseSelector} font=${p.fontFamily.split(',')[0]} size=${p.fontSize} lh=${p.lineHeight} color=${p.color}`);
}
for (const [f, set] of Object.entries(tRows)) { line(`\n  ${f}:`); for (const s of set) line(`      ${s}`); }

H('5b. PROSE CONTAINER WIDTH / MEASURE @ laptop-1440 and ultrawide-2560');
for (const vp of ['laptop-1440', 'ultrawide-2560']) {
  line(`\n  ${vp}:`);
  const w = {};
  for (const r of results) {
    if (r.viewport !== vp || !r.typography?.prose) continue;
    const p = r.typography.prose;
    (w[family(r.route)] ??= new Set()).add(`width=${p.width}px maxWidth=${p.maxWidth} padInline=${p.paddingInline}`);
  }
  for (const [f, set] of Object.entries(w)) { line(`    ${f}:`); for (const s of set) line(`        ${s}`); }
}

// --------------------------------------------------------------- 6. CODE
H('6. CODE STYLING FINGERPRINT @ laptop-1440 (block + inline)');
for (const kind of ['pre', 'inline']) {
  line(`\n  --- ${kind} code ---`);
  const c = {};
  for (const r of results) {
    if (r.viewport !== 'laptop-1440') continue;
    const f = r.code?.[kind];
    if (!f) continue;
    (c[`${family(r.route)}/${r.colorScheme ?? 'legacy'}`] ??= new Set()).add(
      `font=${f.fontFamily.split(',')[0]} size=${f.fontSize} lh=${f.lineHeight} bg=${f.backgroundColor} color=${f.color} radius=${f.borderRadius} ws=${f.whiteSpace} ovx=${f.overflowX} scrolls=${f.scrolls}`,
    );
  }
  for (const [f, set] of Object.entries(c)) { line(`    ${f}:`); for (const s of set) line(`        ${s}`); }
}

H('6b. CODE BLOCKS THAT SCROLL HORIZONTALLY, by viewport');
for (const vp of ['phone-320', 'phone-375', 'phone-393', 'tablet-768', 'laptop-1440']) {
  const rs = results.filter((r) => r.viewport === vp && (r.code?.pres?.some((pre) => pre.scrolls) ?? r.code?.pre?.scrolls));
  line(`  ${vp.padEnd(16)} ${rs.length} routes with a scrolling <pre>`);
}

// -------------------------------------------------------------- 7. TABLES
H('7. TABLES');
const tabAgg = {};
for (const r of results) {
  for (const t of r.tables ?? []) {
    const k = `${family(r.route)} | wrapper=${t.wrapperSel} ovx=${t.wrapperOverflowX} focusable=${t.wrapperFocusable} role=${t.wrapperRole} label=${t.wrapperLabel ? 'yes' : 'NO'}`;
    tabAgg[k] ??= { n: 0, scrolls: 0, routes: new Set(), vps: new Set() };
    tabAgg[k].n += 1;
    if (t.scrolls || t.wrapperScrolls) tabAgg[k].scrolls += 1;
    tabAgg[k].routes.add(r.route);
    if (t.scrolls || t.wrapperScrolls) tabAgg[k].vps.add(r.viewport);
  }
}
for (const [k, v] of Object.entries(tabAgg).sort((a, b) => b[1].n - a[1].n)) {
  line(`  x${String(v.n).padStart(4)} (scrolling ${v.scrolls})  ${k}`);
  if (v.vps.size) line(`        scrolls at: ${[...v.vps].join(', ')}`);
}

// ---------------------------------------------------------- 8. TAP TARGETS
H('8. TAP TARGETS UNDER 44x44 CSS px @ phone-375');
const tt = {};
for (const r of results) {
  if (r.viewport !== 'phone-375') continue;
  for (const t of r.smallTargets ?? []) {
    if (t.inlineProseLink) continue;
    const k = `${t.sel} (${t.w}x${t.h})`;
    tt[k] ??= { n: 0, fam: new Set() };
    tt[k].n += 1; tt[k].fam.add(family(r.route));
  }
}
const ttTop = Object.entries(tt).sort((a, b) => b[1].n - a[1].n).slice(0, 20);
line(`  distinct undersized targets: ${Object.keys(tt).length}`);
for (const [k, v] of ttTop) line(`    x${String(v.n).padStart(4)}  ${k}   [${[...v.fam].join(',')}]`);

// ------------------------------------------------------- 9. MISC HYGIENE
H('9. HYGIENE');
const inlineAttr = {};
for (const r of results) {
  if (r.viewport !== 'laptop-1440') continue;
  for (const s of r.inlineStyleAttrs ?? []) {
    if (typeof s !== 'string' && s.value.startsWith('--')) continue;
    (inlineAttr[typeof s === 'string' ? s : s.sel] ??= new Set()).add(r.route);
  }
}
line(`  elements carrying an inline style="" attribute (distinct selectors): ${Object.keys(inlineAttr).length}`);
for (const [k, v] of Object.entries(inlineAttr).sort((a, b) => b[1].size - a[1].size).slice(0, 15)) {
  line(`    x${String(v.size).padStart(3)} routes  ${k}`);
}
const multiH1 = results.filter((r) => r.viewport === 'laptop-1440' && r.h1Count !== 1);
line(`\n  pages whose <h1> count != 1: ${multiH1.length}`);
for (const r of multiH1.slice(0, 10)) line(`    h1=${r.h1Count}  ${r.route}`);
const noDims = results.filter((r) => r.viewport === 'laptop-1440' && (r.imagesMissingDims ?? []).length);
line(`\n  pages with <img> missing width/height (CLS risk): ${noDims.length}`);
for (const r of noDims.slice(0, 10)) line(`    ${r.route}  ${r.imagesMissingDims.join(', ')}`);
const noAlt = results.filter((r) => r.viewport === 'laptop-1440' && (r.imagesMissingAlt ?? []).length);
line(`\n  pages with <img> missing alt: ${noAlt.length}`);
for (const r of noAlt.slice(0, 10)) line(`    ${r.route}  ${r.imagesMissingAlt.join(', ')}`);
line(`\n  inline <style> tag counts seen: ${[...new Set(results.filter(r=>r.viewport==='laptop-1440').map((r) => r.inlineStyleTags))].join(', ')}`);
line(`  console errors: ${consoleErrors.length}`);
for (const e of consoleErrors.slice(0, 10)) line(`    ${e.viewport}: ${e.text}`);
const errs = results.filter((r) => r.error);
line(`\n  probe errors: ${errs.length}`);
for (const e of errs.slice(0, 5)) line(`    ${e.route} @ ${e.viewport}: ${e.error}`);
