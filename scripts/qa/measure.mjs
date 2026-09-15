#!/usr/bin/env node
/**
 * Headless design-system measurements against the current static build.
 *
 * Serves dist/ and, for every route x viewport, measures:
 *   - page-level horizontal overflow (scrollWidth > innerWidth)
 *   - every element that overflows its container or the viewport
 *   - a typography fingerprint of the prose wrapper (to detect cross-section drift)
 *   - a code-block / inline-code / table fingerprint
 *   - tap-target violations
 *
 * Usage:
 *   direnv exec . node scripts/qa/measure.mjs
 *   direnv exec . node scripts/qa/measure.mjs --all-viewports --shots
 *   direnv exec . node scripts/qa/measure.mjs --zoom --out=.omo/qa/zoom
 * --zoom collects full probes at 200%; paired overflow/font-size checks always run.
 */

import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(ROOT, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
};

/** Viewport matrix: realistic device classes, smallest supported -> ultrawide. */
const VIEWPORTS = [
  { name: 'phone-320', width: 320, height: 568, dpr: 2, touch: true, label: 'Smallest supported phone' },
  { name: 'phone-375', width: 375, height: 667, dpr: 2, touch: true, label: 'iPhone SE' },
  { name: 'phone-393', width: 393, height: 852, dpr: 3, touch: true, label: 'iPhone 15 Pro' },
  { name: 'phone-430', width: 430, height: 932, dpr: 3, touch: true, label: 'iPhone 15 Pro Max' },
  { name: 'tablet-768', width: 768, height: 1024, dpr: 2, touch: true, label: 'iPad portrait' },
  { name: 'tablet-1024', width: 1024, height: 1366, dpr: 2, touch: true, label: 'iPad Pro portrait' },
  { name: 'laptop-1280', width: 1280, height: 800, dpr: 2, touch: false, label: 'Small laptop' },
  { name: 'laptop-1440', width: 1440, height: 900, dpr: 2, touch: false, label: 'MacBook Air' },
  { name: 'desktop-1920', width: 1920, height: 1080, dpr: 1, touch: false, label: 'Desktop FHD' },
  { name: 'ultrawide-2560', width: 2560, height: 1440, dpr: 1, touch: false, label: 'QHD / Studio Display' },
  { name: 'ultrawide-3440', width: 3440, height: 1440, dpr: 1, touch: false, label: 'Ultrawide' },
];

function parseArgs(argv) {
  const out = { shots: false, zoom: false, allViewports: false, viewports: null, routes: null, dir: '.omo/qa/current' };
  for (const a of argv.slice(2)) {
    if (a === '--shots') out.shots = true;
    else if (a === '--zoom') out.zoom = true;
    else if (a === '--all-viewports') out.allViewports = true;
    else if (a.startsWith('--viewports=')) out.viewports = a.slice(12).split(',').filter(Boolean);
    else if (a.startsWith('--routes=')) out.routes = a.slice(9).split(',').filter(Boolean);
    else if (a.startsWith('--out=')) out.dir = a.slice(6);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

export async function deriveRoutes(dist = DIST) {
  const sitemap = path.join(dist, 'sitemap.xml');
  if (existsSync(sitemap)) {
    const xml = await readFile(sitemap, 'utf8');
    const routes = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map((match) => {
      const url = new URL(match[1].trim().replaceAll('&amp;', '&'));
      if (url.origin !== 'https://oponomarov.com') throw new Error(`Unexpected sitemap origin: ${url.origin}`);
      return url.pathname;
    });
    if (!routes.length) throw new Error('sitemap.xml contains no routes');
    return [...new Set([...routes, '/404.html'])].sort();
  }
  const routes = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && entry.name.endsWith('.html')) {
        const html = await readFile(file, 'utf8');
        if (/<meta\b[^>]*\bhttp-equiv\s*=\s*["']refresh["']/i.test(html)) continue;
        const relative = path.relative(dist, file).split(path.sep).join('/');
        routes.push(`/${relative.replace(/(^|\/)index\.html$/, '$1')}`);
      }
    }
  }
  await walk(dist);
  if (!routes.length) throw new Error('dist/ contains no real HTML routes');
  return [...new Set([...routes, '/404.html'])].sort();
}

async function startServer(rootDir) {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
      let filePath = path.join(rootDir, urlPath);
      if (filePath !== rootDir && !filePath.startsWith(rootDir + path.sep)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      if (urlPath.endsWith('/')) filePath = path.join(filePath, 'index.html');
      if (!existsSync(filePath)) {
        const asHtml = `${filePath.replace(/\/$/, '')}.html`;
        if (existsSync(asHtml)) filePath = asHtml;
        else {
          const idx = path.join(filePath, 'index.html');
          if (existsSync(idx)) filePath = idx;
          else {
            res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
            return;
          }
        }
      }
      const body = await readFile(filePath);
      res.writeHead(200, {
        'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      }).end(body);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' }).end(String(err));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, port: server.address().port };
}

/** Runs in the browser. Returns the full measurement record for one page. */
const PROBE = () => {
  const vw = window.innerWidth;
  const docEl = document.documentElement;

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim()
      ? `.${el.className.trim().split(/\s+/).slice(0, 4).join('.')}`
      : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  const ancestry = (el) => {
    const parts = [];
    let cur = el;
    let depth = 0;
    while (cur && cur !== document.body && depth < 6) {
      parts.unshift(describe(cur));
      cur = cur.parentElement;
      depth += 1;
    }
    return parts.join(' > ');
  };

  const all = Array.from(document.body.querySelectorAll('*'));

  // 1. Elements that horizontally overflow their own box (internal scrollers).
  const selfScrollers = [];
  for (const el of all) {
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      const cs = getComputedStyle(el);
      selfScrollers.push({
        sel: describe(el),
        path: ancestry(el),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        excess: el.scrollWidth - el.clientWidth,
        overflowX: cs.overflowX,
        whiteSpace: cs.whiteSpace,
        overflowWrap: cs.overflowWrap,
        wordBreak: cs.wordBreak,
        // an overflow:visible self-scroller is a real visual break, not a scroll affordance
        clipped: cs.overflowX === 'hidden' || cs.overflowX === 'clip',
        srOnly: el.matches('.sr-only'),
        scrollable: cs.overflowX === 'auto' || cs.overflowX === 'scroll',
      });
    }
  }

  // 2. Elements whose painted box escapes the viewport horizontally.
  const escapers = [];
  /* A line box inside wrapped code reports its pre-wrap intrinsic width, not
     what is painted: Expressive Code's <code> and .ec-line sit inside a <pre>
     that fits and does not scroll, and the text is visibly wrapped (verified
     by screenshot at 320px). Treat the <pre> as the layout box, and only when
     it genuinely contains its own content. */
  const containedByScrollRegion = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const scrolls = ['auto', 'scroll'].includes(cs.overflowX);
      const wrapsCode = a.tagName === 'PRE' && a.scrollWidth <= a.clientWidth + 1;
      if (!scrolls && !wrapsCode) continue;
      /* The region only contains the child if the region itself fits. */
      if (a.getBoundingClientRect().right <= vw + 1) return true;
    }
    return false;
  };
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') continue;
    if (r.right > vw + 1 || r.left < -1) {
      if (containedByScrollRegion(el)) continue;
      escapers.push({
        sel: describe(el),
        path: ancestry(el),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        overshoot: Math.round(r.right - vw),
      });
    }
  }

  // 3. Typography fingerprint: the prose wrapper + headings + body text.
  const proseCandidates = [
    '[data-pagefind-body]', '.prose', '.docs-content', '.post-content', '.content',
    'article', 'main',
  ];
  let prose = null;
  for (const sel of proseCandidates) {
    const el = document.querySelector(sel);
    if (el) { prose = { sel, el }; break; }
  }
  const fingerprint = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      maxWidth: cs.maxWidth,
      width: Math.round(r.width),
      paddingInline: `${cs.paddingLeft} / ${cs.paddingRight}`,
      marginInline: `${cs.marginLeft} / ${cs.marginRight}`,
      letterSpacing: cs.letterSpacing,
      fontWeight: cs.fontWeight,
    };
  };

  /* S1 compares like with like. A lede is deliberately larger than body
     copy, so sampling a `.prose--lede` paragraph on one route and a body
     paragraph on another reports a divergence the design intends. Headings
     are excluded for the same reason. */
  const IN_LARGER_CONTEXT = '.prose--lede, .hero, .hero-copy, header, h1, h2, h3, h4, h5, h6, figcaption, .article-dek';
  const isBodyContext = (el) => el && !el.closest(IN_LARGER_CONTEXT);
  /* S3 needs no such scoping. Inline code is em-relative, and the contract
     compares its RATIO to the text it sits in rather than its absolute size,
     so a capsule in a heading, a card, a step or a lede is a legitimate
     sample: the ratio is the invariant, and it must hold in every context. */
  const isInlineCode = (el) => !el.closest('pre');

  const paragraphSelectors = ['.prose p', '[data-article-body] p', 'article .prose p'];
  const bodyProseSelector = paragraphSelectors.find((sel) =>
    [...document.querySelectorAll(sel)].some(isBodyContext)) ?? null;
  const bodyProse = bodyProseSelector
    ? [...document.querySelectorAll(bodyProseSelector)].find(isBodyContext) ?? null
    : null;
  /* firstParagraph keeps the unscoped fallback: it is diagnostic only. */
  const firstParagraphSelector = bodyProseSelector ?? (prose ? `${prose.sel} p` : null);
  const firstP = bodyProse ?? prose?.el?.querySelector('p');
  const h1 = document.querySelector('h1');
  const h2 = prose?.el?.querySelector('h2') || document.querySelector('h2');

  // 4. Code fingerprints.
  const pre = prose?.el?.querySelector('pre') || document.querySelector('pre');
  const inlineCode = Array.from((prose?.el || document).querySelectorAll('code')).find(isInlineCode);
  const codeFp = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      borderRadius: cs.borderRadius,
      border: cs.border,
      padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
      whiteSpace: cs.whiteSpace,
      overflowX: cs.overflowX,
      overflowWrap: cs.overflowWrap,
      wordBreak: cs.wordBreak,
      width: Math.round(r.width),
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrolls: el.scrollWidth > el.clientWidth + 1,
    };
  };
  /* An inline span is em-sized, so its size only means something next to
     the size of the text it sits in. Record the parent's computed size and
     the ratio; S3 asserts the ratio. Three decimals absorb float noise in
     the computed value without hiding a real divergence (0.875 vs 1.08). */
  const inlineFp = (el) => {
    const fp = codeFp(el);
    if (!fp) return null;
    const parentFontSize = el.parentElement ? getComputedStyle(el.parentElement).fontSize : null;
    const ratio = parentFontSize ? Math.round((parseFloat(fp.fontSize) / parseFloat(parentFontSize)) * 1000) / 1000 : null;
    return { ...fp, parentFontSize, ratio };
  };

  // 5. Tables.
  const tables = Array.from(document.querySelectorAll('table')).map((t) => {
    const cs = getComputedStyle(t);
    let parent = t.parentElement;
    // The scrolling region may wrap an intermediate layout element.
    for (let ancestor = parent; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      if (['auto', 'scroll'].includes(getComputedStyle(ancestor).overflowX)) { parent = ancestor; break; }
    }
    const pcs = parent ? getComputedStyle(parent) : null;
    const labelledBy = parent?.getAttribute('aria-labelledby');
    const accessibleName = labelledBy
      ? labelledBy.trim().split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ').trim()
      : parent?.getAttribute('aria-label')?.trim() ?? '';
    return {
      sel: describe(t),
      cols: t.querySelector('tr')?.children.length ?? 0,
      rows: t.querySelectorAll('tr').length,
      scrollWidth: t.scrollWidth,
      clientWidth: t.clientWidth,
      scrolls: t.scrollWidth > t.clientWidth + 1,
      tableLayout: cs.tableLayout,
      fontSize: cs.fontSize,
      wrapperSel: parent ? describe(parent) : null,
      wrapperOverflowX: pcs ? pcs.overflowX : null,
      wrapperScrolls: parent ? parent.scrollWidth > parent.clientWidth + 1 : false,
      wrapperFocusable: parent?.getAttribute('tabindex') === '0',
      wrapperTabIndex: parent?.getAttribute('tabindex') ?? null,
      wrapperRole: parent ? parent.getAttribute('role') : null,
      wrapperLabel: accessibleName,
    };
  });

  // 6. Stylesheets actually loaded for this page.
  const sheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).filter((l) => l.sheet).map((l) => l.getAttribute('href'));
  const inlineStyleTags = document.querySelectorAll('style').length;
  const inlineStyleAttrs = [docEl, document.body, ...all].filter((el) => el.hasAttribute('style'))
    .map((el) => ({ sel: describe(el), path: ancestry(el), value: el.getAttribute('style') }));

  // 7. Tap targets (interactive elements smaller than 44x44 CSS px).
  const smallTargets = Array.from(document.querySelectorAll('a,button,input,select,textarea,[role="button"],summary'))
    .map((el) => ({ el, r: el.getBoundingClientRect(), cs: getComputedStyle(el) }))
    .filter(({ r, cs }) => r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && (r.width < 44 || r.height < 44))
    .map(({ el, r, cs }) => ({
      sel: describe(el), path: ancestry(el), w: r.width, h: r.height,
      text: (el.textContent || '').trim().slice(0, 30),
      inlineProseLink: el.matches('a[href]') && ['inline', 'inline-block'].includes(cs.display) && Boolean(el.closest('.prose')),
    }));

  // 8. Font faces actually resolved (detect fallback usage).
  const usedFamilies = [...new Set(all.slice(0, 4000).map((el) => getComputedStyle(el).fontFamily))];

  const themeScripts = [...document.head.querySelectorAll('script:not([src])')]
    .filter((script) => /(?:dataset\.theme|data-theme)/.test(script.textContent));
  const scriptText = themeScripts.map((script) => script.textContent).join('\n');
  let hash = 2166136261;
  for (let i = 0; i < scriptText.length; i++) hash = Math.imul(hash ^ scriptText.charCodeAt(i), 16777619);

  return {
    viewportWidth: vw,
    theme: docEl.dataset.theme ?? null,
    bodyBackgroundColor: getComputedStyle(document.body).backgroundColor,
    bodyFontSize: getComputedStyle(document.body).fontSize,
    themeInitScriptHash: themeScripts.length ? (hash >>> 0).toString(16).padStart(8, '0') : null,
    themeInitScriptCount: themeScripts.length,
    docScrollWidth: docEl.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    pageOverflows: docEl.scrollWidth > vw + 1,
    pageOverflowBy: docEl.scrollWidth - vw,
    docHeight: docEl.scrollHeight,
    htmlOverflowX: getComputedStyle(docEl).overflowX,
    bodyOverflowX: getComputedStyle(document.body).overflowX,
    selfScrollers,
    escapers,
    typography: {
      proseSelector: prose?.sel ?? null,
      prose: fingerprint(prose?.el),
      firstParagraph: fingerprint(firstP),
      firstParagraphSelector,
      bodyProse: fingerprint(bodyProse),
      bodyProseSelector,
      h1: fingerprint(h1),
      h2: fingerprint(h2),
    },
    code: {
      pre: codeFp(pre), inline: inlineFp(inlineCode),
      pres: [...document.querySelectorAll('pre')].map((el, index) => ({ sel: describe(el), path: ancestry(el), index, ...codeFp(el) })),
      /* Every non-fenced span on the page, headings and cards included: the
         contract compares the ratio to the parent across this array, and
         that ratio is the one thing every context must agree on. */
      inlines: [...document.querySelectorAll('code')].filter(isInlineCode)
        .map((el, index) => ({ sel: describe(el), path: ancestry(el), index, ...inlineFp(el) })),
    },
    tables,
    sheets,
    inlineStyleTags,
    inlineStyleAttrs,
    smallTargets,
    usedFamilies,
    title: document.title,
    h1Count: document.querySelectorAll('h1').length,
    imagesMissingDims: Array.from(document.querySelectorAll('img'))
      .filter((i) => !i.getAttribute('width') || !i.getAttribute('height'))
      .map((i) => i.getAttribute('src')),
    imagesMissingAlt: Array.from(document.querySelectorAll('img'))
      .filter((i) => i.getAttribute('alt') === null)
      .map((i) => i.getAttribute('src')),
  };
};

// Full-bleed main shells are not content containers when bounded children exist.
const MEASURE = () => {
  const widths = (elements) => [...elements].map((el) => ({
    sel: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${String(el.className).trim().replace(/\s+/g, '.')}`,
    width: el.getBoundingClientRect().width,
  }));
  const main = document.querySelector('main');
  const containers = main?.querySelectorAll('.section-shell, .page-shell, .case-detail, .docs-shell');
  return {
    viewportWidth: innerWidth,
    /* Measure the readable line, not the wrapper. On an article page `.prose`
       is deliberately full-bleed so a table, figure or code block can opt into
       a wider grid track; what matters to a reader is the width of the body
       paragraphs inside it. */
    proseContainers: widths([...document.querySelectorAll('.prose')]
      .flatMap((prose) => [...prose.querySelectorAll(':scope > p')])),
    mainContainers: widths(containers?.length ? containers : main ? [main] : []),
  };
};

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

function captureErrors(page, errors, identity) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push({ ...identity, text: message.text() });
  });
  page.on('pageerror', (error) => errors.push({ ...identity, text: `pageerror: ${error}` }));
}

async function interactionPass(browser, base, routes, consoleErrors) {
  const interactions = { skipLinks: [], readerDialogs: [] };
  for (const colorScheme of ['light', 'dark']) for (const route of routes) {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, colorScheme, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const identity = { route, viewport: 'phone-375', colorScheme, pass: 'interaction' };
    captureErrors(page, consoleErrors, identity);
    try {
      // Network quiescence is not UI readiness (lazy media can remain active).
      await page.goto(base + route, { waitUntil: 'load', timeout: 30000 });
      await settle(page);
      await page.evaluate(() => {
        document.body.setAttribute('tabindex', '-1');
        document.body.focus();
        document.body.removeAttribute('tabindex');
      });
      await page.keyboard.press('Tab');
      await settle(page);
      /* The skip link parks itself at translate: 0 -200% and returns to none on
         focus. Measuring while that is still resolving reports a negative top
         and fails intermittently, so wait for the rect to settle. This waits
         for the real thing the assertion is about; it does not relax it. */
      await page.waitForFunction(() => {
        const el = document.querySelector('.skip-link');
        return Boolean(el) && el.getBoundingClientRect().top >= 0;
      }, null, { timeout: 2000 }).catch(() => {});
      const skip = await page.evaluate(() => {
        const el = document.activeElement;
        const r = el.getBoundingClientRect();
        return {
          focused: `${el.tagName.toLowerCase()}.${el.className}`,
          matchesSkipLink: el.matches('.skip-link'),
          rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
          insideViewport: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        };
      });
      interactions.skipLinks.push({ ...identity, ...skip });
    } catch (error) {
      interactions.skipLinks.push({ ...identity, error: String(error) });
    }
    if (route === '/') {
      try {
        await page.waitForFunction(() => performance.getEntriesByType('resource')
          .some((entry) => new URL(entry.name).pathname === '/assets/js/reader.js' && entry.responseEnd > 0));
        await settle(page);
        const card = page.locator('[data-case-grid] [data-case-card]').first();
        const href = await card.getAttribute('href');
        await card.click();
        await page.locator('dialog.reader[open]').waitFor({ state: 'visible' });
        await page.locator('[data-reader-study][aria-busy="true"]').waitFor({ state: 'hidden' });
        await settle(page);
        const reader = await page.locator('dialog.reader').evaluate((dialog) => ({
          open: dialog.open,
          /* Not every study contains code, so a styled <pre> cannot be the only
             evidence the reader worked. Record how much prose it rendered, and
             the code styling only when code is actually present. */
          proseLength: (dialog.querySelector('[data-reader-prose]')?.textContent ?? '').trim().length,
          preBackgrounds: [...dialog.querySelectorAll('pre')].map((pre) => getComputedStyle(pre).backgroundColor),
        }));
        interactions.readerDialogs.push({ ...identity, href, ...reader });
      } catch (error) {
        interactions.readerDialogs.push({ ...identity, error: String(error) });
      }
    }
    await context.close();
  }
  return interactions;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!existsSync(DIST)) throw new Error('dist/ missing — run `direnv exec . npm run build` first.');
  const discoveredRoutes = await deriveRoutes();
  const routes = args.routes ?? discoveredRoutes;
  if (!routes.length || routes.some((route) => !discoveredRoutes.includes(route))) throw new Error('Unknown or empty --routes selection');
  const viewports = args.viewports
    ? VIEWPORTS.filter((v) => args.viewports.includes(v.name))
    : args.allViewports ? VIEWPORTS : VIEWPORTS.filter((v) => [320, 375, 768, 1440].includes(v.width));
  if (!viewports.length || args.viewports?.some((name) => !VIEWPORTS.some((v) => v.name === name))) throw new Error('Unknown or empty --viewports selection');
  const outDir = path.resolve(ROOT, args.dir);
  const artifactRoot = path.join(ROOT, '.omo/qa');
  if (!outDir.startsWith(artifactRoot + path.sep) || outDir === path.join(artifactRoot, 'baseline') || outDir.startsWith(path.join(artifactRoot, 'baseline') + path.sep)) {
    throw new Error('--out must be below .omo/qa/ and must not overwrite baseline evidence');
  }
  await mkdir(outDir, { recursive: true });
  const { server, port } = await startServer(DIST);
  const base = `http://127.0.0.1:${port}`;
  let browser;
  const results = [];
  const zoomResults = [];
  const measureResults = [];
  const consoleErrors = [];
  let done = 0;
  const total = routes.length * viewports.length * 2;
  let interactions;
  try {
    browser = await chromium.launch({ headless: true });
    for (const vp of viewports) for (const colorScheme of ['light', 'dark']) for (const route of routes) {
      // A context per navigation guarantees empty localStorage before page scripts run.
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr,
        hasTouch: vp.touch, isMobile: vp.touch, reducedMotion: 'reduce', colorScheme,
      });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      const identity = { route, viewport: vp.name, viewportLabel: vp.label, colorScheme, pass: 'normal' };
      captureErrors(page, consoleErrors, identity);
      let record = { ...identity };
      try {
        const response = await page.goto(base + route, { waitUntil: 'load', timeout: 30000 });
        await settle(page);
        record = { ...identity, ...await page.evaluate(PROBE), status: response?.status() ?? 0 };
        record.measure = await page.evaluate(MEASURE);
        if (args.shots) {
          const dir = path.join(outDir, 'shots', colorScheme, vp.name);
          await mkdir(dir, { recursive: true });
          await page.screenshot({ path: path.join(dir, `${encodeURIComponent(route)}.png`), fullPage: true });
        }
        /* S11 asks whether the type scale honours a reader who raised their
           browser's default font size. Injecting an inline font-size on <html>
           cannot answer that: `rem` inside a custom property declared on :root
           resolves against the initial 16px, so the value never moves. CDP
           Page.setFontSizes changes the actual setting, which is what a reader
           changes, and requires a reload to take effect. The context is
           per-route, so nothing needs resetting afterwards. */
        await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 32 } });
        await page.reload({ waitUntil: 'load', timeout: 30000 });
        await settle(page);
        const zoom = args.zoom ? await page.evaluate(PROBE) : await page.evaluate(() => ({
          viewportWidth: innerWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          pageOverflows: document.documentElement.scrollWidth > innerWidth + 1,
          rootFontSize: getComputedStyle(document.documentElement).fontSize,
          bodyFontSize: getComputedStyle(document.body).fontSize,
        }));
        zoomResults.push({ ...identity, ...zoom, pass: 'zoom' });
        // Supplement the fast matrix with only S2's wide-container measurements.
        if (vp === viewports.at(-1)) {
          /* Undo the zoom first. A leaked 32px root doubles every rem and would
             silently report a 704px column as 1408px. */
          await cdp.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 13 } });
          await page.reload({ waitUntil: 'load', timeout: 30000 });
          await page.setViewportSize({ width: 2560, height: 1440 });
          await settle(page);
          measureResults.push({ ...identity, ...await page.evaluate(MEASURE), viewport: 'ultrawide-2560', pass: 'measure' });
        }
      } catch (error) {
        record.error = String(error);
      } finally {
        results.push(record);
        await ctx.close();
      }
      if (++done % 25 === 0) process.stderr.write(`  ...${done}/${total}\n`);
    }
    interactions = await interactionPass(browser, base, routes, consoleErrors);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  await writeFile(path.join(outDir, 'raw.json'), JSON.stringify({
    schemaVersion: 2,
    metadata: { routes: discoveredRoutes, selectedRoutes: routes, viewports, colorSchemes: ['light', 'dark'], fullZoom: args.zoom, generatedAt: new Date().toISOString() },
    results, zoomResults, measureResults, interactions, consoleErrors,
  }, null, 2));
  console.log(`Measured ${results.length} route/viewport/theme combinations -> ${path.join(args.dir, 'raw.json')}`);
  console.log(`Paired zoom: ${zoomResults.length}; wide measures: ${measureResults.length}; console errors: ${consoleErrors.length}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
