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
 *   - text colour against the background actually painted behind it (S14)
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
// allow: SIZE_OK — Playwright serializes PROBE into the browser, so its DOM helpers must remain in this closure.
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
    /* S22: the lines a span paints on (distinct fragment tops), whether the
       build marked it as too long to hold on a phone (data-long), and its
       text, so a failure names the token. */
    const lines = new Set([...el.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top))).size;
    return { ...fp, parentFontSize, ratio, lines, long: el.hasAttribute('data-long'), text: (el.textContent || '').trim().slice(0, 60) };
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

  // 9. Contrast (S14): every text sample against the background actually
  //    painted behind it, in the theme this context resolved. Chrome returns
  //    computed colours in the syntax they were authored in (oklch() here), so
  //    the CSS Color 4 syntaxes are converted exactly rather than read as
  //    three sRGB bytes. The background is composited from the element
  //    outward until an opaque layer is reached; a gradient contributes each
  //    of its stops as a candidate and the worst pair is recorded. Anything
  //    the probe cannot resolve - an image, an unknown colour syntax, an
  //    ancestor with opacity, no opaque layer before the root - is recorded
  //    with a reason and no background, which the contract fails: missing
  //    evidence is never a pass.
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const oklabToLinearSrgb = (L, a, b) => {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
  };
  const gammaEncode = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const colourNumber = (token) => (token === 'none' ? 0 : token.endsWith('%') ? parseFloat(token) / 100 : parseFloat(token));
  const fromLinear = ([lr, lg, lb], a) => ({ r: clamp01(gammaEncode(lr)), g: clamp01(gammaEncode(lg)), b: clamp01(gammaEncode(lb)), a });
  /** Computed colour string -> { r, g, b (0..1 sRGB), a } or null when the syntax is unknown. */
  const parseColour = (str) => {
    const text = (str ?? '').trim();
    if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    let m = text.match(/^rgba?\(\s*([^)]+)\)$/);
    if (m) {
      const parts = m[1].split(/[\s,/]+/).filter(Boolean);
      if (parts.length < 3) return null;
      const [r, g, b] = parts.slice(0, 3).map((t) => (t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t) / 255));
      const a = parts[3] === undefined ? 1 : colourNumber(parts[3]);
      return [r, g, b, a].every(Number.isFinite) ? { r, g, b, a } : null;
    }
    m = text.match(/^(oklch|oklab)\(\s*([^)]+)\)$/);
    if (m) {
      const [body, alpha] = m[2].split('/').map((t) => t.trim());
      const [c1, c2, c3] = body.split(/\s+/).map(colourNumber);
      const a = alpha === undefined ? 1 : colourNumber(alpha);
      if (![c1, c2, c3, a].every(Number.isFinite)) return null;
      if (m[1] === 'oklab') return fromLinear(oklabToLinearSrgb(c1, c2, c3), a);
      const hue = (c3 * Math.PI) / 180;
      return fromLinear(oklabToLinearSrgb(c1, c2 * Math.cos(hue), c2 * Math.sin(hue)), a);
    }
    m = text.match(/^color\(srgb\s+([^)]+)\)$/);
    if (m) {
      const [body, alpha] = m[1].split('/').map((t) => t.trim());
      const [r, g, b] = body.split(/\s+/).map(colourNumber);
      const a = alpha === undefined ? 1 : colourNumber(alpha);
      return [r, g, b, a].every(Number.isFinite) ? { r: clamp01(r), g: clamp01(g), b: clamp01(b), a } : null;
    }
    return null;
  };
  /** Source-over: `top` painted over `bottom`, both possibly translucent. */
  const over = (top, bottom) => {
    const a = top.a + bottom.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (k) => (top[k] * top.a + bottom[k] * bottom.a * (1 - top.a)) / a;
    return { r: mix('r'), g: mix('g'), b: mix('b'), a };
  };
  const toHex = (c) => `#${['r', 'g', 'b'].map((k) => Math.round(c[k] * 255).toString(16).padStart(2, '0')).join('')}`;
  const linearise = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = (c) => 0.2126 * linearise(c.r) + 0.7152 * linearise(c.g) + 0.0722 * linearise(c.b);
  const contrastRatio = (fg, bg) => {
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  /* Top-level split of a comma-separated CSS list: commas inside colour
     functions do not count. */
  const splitTopLevel = (text) => {
    const out = [];
    let depth = 0, start = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      else if (ch === ',' && depth === 0) { out.push(text.slice(start, i).trim()); start = i + 1; }
    }
    out.push(text.slice(start).trim());
    return out.filter(Boolean);
  };
  /** What one element paints, as a list of candidate layers (one per gradient stop), or a reason it cannot be known. */
  const paintOf = (el) => {
    const cs = getComputedStyle(el);
    if (parseFloat(cs.opacity) < 1) return { reason: `opacity ${cs.opacity} on ${describe(el)}` };
    const colour = parseColour(cs.backgroundColor);
    if (!colour) return { reason: `unknown background-color syntax "${cs.backgroundColor}" on ${describe(el)}` };
    if (cs.backgroundImage === 'none') return { layers: [colour] };
    const layers = [];
    for (const image of splitTopLevel(cs.backgroundImage)) {
      const gradient = image.match(/^(?:repeating-)?(?:linear|radial|conic)-gradient\((.*)\)$/s);
      if (!gradient) return { reason: `background-image "${image.slice(0, 60)}" on ${describe(el)}` };
      const stops = splitTopLevel(gradient[1])
        .map((arg) => arg.match(/^((?:rgba?|oklch|oklab|color)\([^)]*\)|transparent)(?:\s|$)/)?.[1])
        .filter(Boolean);
      if (!stops.length) return { reason: `gradient without readable colour stops on ${describe(el)}` };
      for (const stop of stops) {
        const parsed = parseColour(stop);
        if (!parsed) return { reason: `unknown gradient stop "${stop}" on ${describe(el)}` };
        layers.push(over(parsed, colour));
      }
    }
    return { layers };
  };
  /** Opaque colours that can sit behind `el`: every combination of the translucent layers between it and the first opaque paint. */
  const paintedBackgrounds = (el) => {
    let candidates = [{ r: 0, g: 0, b: 0, a: 0 }];
    for (let node = el; node; node = node.parentElement) {
      const paint = paintOf(node);
      if (paint.reason) return { reason: paint.reason };
      const next = [];
      for (const above of candidates) {
        if (above.a >= 1) { next.push(above); continue; }
        for (const layer of paint.layers) next.push(over(above, layer));
      }
      if (next.length > 16) return { reason: `${next.length} gradient combinations behind ${describe(el)}` };
      candidates = next;
      if (candidates.every((c) => c.a >= 1)) return { backgrounds: candidates };
    }
    return { reason: `no opaque background between ${describe(el)} and the root` };
  };
  const hasOwnText = (el) => [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  const isRendered = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const CONTRAST_SAMPLES = [
    ['body-prose', '.prose p'],
    ['prose-link', '.prose a[href]'],
    ['nav-link', '.op-app-nav a:not(.is-active, [aria-current="page"])'],
    ['nav-active', '.op-app-nav a:is(.is-active, [aria-current="page"])'],
    ['toc-link', '.toc__list a'],
    ['toc-label', '.toc__summary *'],
    ['article-meta', '.article-meta, .article-meta *'],
    ['inline-code', '.prose :not(pre) > code'],
  ];
  const contrast = [];
  const contrastSeen = new Set();
  for (const [kind, selector] of CONTRAST_SAMPLES) {
    for (const el of document.querySelectorAll(selector)) {
      if (!isRendered(el) || !hasOwnText(el)) continue;
      const cs = getComputedStyle(el);
      const fontSize = parseFloat(cs.fontSize);
      const fontWeight = parseInt(cs.fontWeight, 10);
      const text = parseColour(cs.color);
      const behind = text ? paintedBackgrounds(el) : { reason: `unknown color syntax "${cs.color}" on ${describe(el)}` };
      let sample = { kind, sel: describe(el), path: ancestry(el), color: cs.color, fontSize, fontWeight, foreground: null, background: null, ratio: null, reason: behind.reason ?? null };
      if (!behind.reason) {
        /* The worst pair is the evidence: a gradient is judged where it is darkest or lightest for this ink. */
        const worst = behind.backgrounds
          .map((bg) => ({ fg: over(text, bg), bg }))
          .map(({ fg, bg }) => ({ foreground: toHex(fg), background: toHex(bg), ratio: Math.round(contrastRatio(fg, bg) * 100) / 100 }))
          .sort((x, y) => x.ratio - y.ratio)[0];
        sample = { ...sample, ...worst, candidates: behind.backgrounds.length };
      }
      /* One record per distinct ink/background/size/weight per page keeps the
         artifact readable; the first path stands for the set. */
      const key = [kind, sample.color, sample.background, sample.foreground, fontSize, fontWeight, sample.reason].join('|');
      if (contrastSeen.has(key)) continue;
      contrastSeen.add(key);
      contrast.push(sample);
    }
  }

  // 10. Article grid tracks (S15): what the three named tracks of the body
  //     grid actually resolve to, where every direct child of the body sits,
  //     and whether a scrolling table region first took every pixel it could.
  //     The tracks are measured with throwaway children placed in each one and
  //     removed again, because a named grid line has no box of its own.
  const articleGrid = (() => {
    const body = document.querySelector('.article > .prose.content-grid');
    if (!body) return null;
    const track = (className) => {
      const el = document.createElement('div');
      el.className = className;
      body.append(el);
      const r = el.getBoundingClientRect();
      el.remove();
      return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
    };
    const content = track(''), wide = track('wide'), full = track('full-bleed');
    const toc = document.querySelector('.article > .toc');
    const rail = toc && getComputedStyle(toc).position === 'sticky' ? Math.round(toc.getBoundingClientRect().left) : null;
    const children = [...body.children]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => {
        const r = el.getBoundingClientRect();
        /* The opt-in is what the grid was told, not only what the author
           wrote: a landing page's card grids are placed on `wide` by the
           engine (primitives.css `[data-landing]`) without the class. */
        const placed = getComputedStyle(el).gridColumnStart;
        const optIn = el.matches('.full-bleed') || placed === 'full' ? 'full-bleed' : el.matches('.wide') || placed === 'wide' ? 'wide' : null;
        return { sel: describe(el), left: Math.round(r.left), right: Math.round(r.right), optIn };
      });
    const tables = [...document.querySelectorAll('.table-scroll')].map((el) => ({
      sel: describe(el), label: el.getAttribute('aria-label'),
      left: Math.round(el.getBoundingClientRect().left),
      width: Math.round(el.getBoundingClientRect().width),
      parentWidth: Math.round(el.parentElement.getBoundingClientRect().width),
      parentLeft: Math.round(el.parentElement.getBoundingClientRect().left),
      scrolls: el.scrollWidth > el.clientWidth + 1,
    }));
    /* The Dotfiles landing is the one body that spreads to the wide track. */
    const landing = body.matches('[data-landing]');
    return { content, wide, full, rail, landing, children, tables };
  })();

  // 11. Typographic parity samples (S16-S20). Rendered elements only: a closed
  //     <dialog> (context-help, global search) has computed styles but no box,
  //     and its heading/keycap are component chrome, not article content.
  const typeSample = (el) => { const cs = getComputedStyle(el); return {
    sel: describe(el), path: ancestry(el), text: (el.textContent || '').trim().slice(0, 30),
    fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight,
    letterSpacing: cs.letterSpacing, textTransform: cs.textTransform, textAlign: cs.textAlign }; };
  const rendered = (selector) => [...document.querySelectorAll(selector)].filter(isRendered);
  const parity = {
    proseH2: rendered('.prose h2').map(typeSample),
    commentsH2: rendered('.comments-region h2').map(typeSample),
    th: rendered('th').map(typeSample),
    /* Every direct prose paragraph except the lede step, which is larger by
       design (docs section 4). Unlike S1 this does NOT exclude `header`: the
       one paragraph this scenario exists to catch sits inside one
       (src/pages/blog/index.astro:34). */
    proseParagraphs: rendered('.prose > p').filter((el) => !el.closest('.prose--lede')).map(typeSample),
  };

  // 12. Gutter parity (S21). Where each region's text starts against where the
  //     header's text starts. Every hub section, article header and article
  //     body is a shell whose first rendered child stands at the page gutter;
  //     a shell that stands anywhere else has picked up a second gutter (the
  //     homepage's full-bleed sections did, on a phone: 40px in beside a 20px
  //     hero and header). Article shells are centred from 40rem by design, so
  //     the contract compares them only below it; hub shells at every width.
  const gutter = (() => {
    const inner = document.querySelector('.op-header__inner');
    if (!inner) return null;
    const headerEdge = inner.getBoundingClientRect().left + parseFloat(getComputedStyle(inner).paddingLeft);
    const shells = [...document.querySelectorAll(
      'main .section-shell, main .article-header, main [data-article-body], main .category-detail, main.article > .prose:not([data-article-body])',
    )];
    const blocks = shells.flatMap((shell) => {
      const first = [...shell.children].find((child) => child.getBoundingClientRect().width > 0 && child.textContent.trim());
      if (!first) return [];
      return [{ sel: describe(shell), article: Boolean(shell.closest('main.article')), left: Math.round(first.getBoundingClientRect().left * 100) / 100 }];
    });
    return { headerEdge: Math.round(headerEdge * 100) / 100, blocks };
  })();

  // 13. Block edges (S23). Every block a prose body holds - a code frame, a
  //     table region, an admonition, a quote, a figure, a disclosure, a tab
  //     group - against the edge of the paragraph text beside it. Direct
  //     children of a prose root measure against the root's first paragraph;
  //     blocks inside a list item against the item's own content box, since
  //     the item is what indents them. A block that opted into a wider track
  //     (`wide`, `full-bleed`, or placed there by the engine) keeps the left
  //     edge and may run further right. The reader dialog is closed here and
  //     is measured by S12.
  const blockEdges = (() => {
    const roots = [...document.querySelectorAll('.prose')].filter((root) => isRendered(root) && !root.closest('dialog'));
    const BLOCKS = '.expressive-code, .table-scroll, .op-admonition, blockquote, figure, details, .tabs, pre';
    const out = [];
    for (const root of roots) {
      const reference = [...root.children].find((child) => child.matches('p') && isRendered(child));
      if (!reference) continue;
      const ref = reference.getBoundingClientRect();
      for (const el of root.querySelectorAll(BLOCKS)) {
        if (!isRendered(el) || el.closest('pre') && el.tagName !== 'PRE' || el.closest('.expressive-code') && !el.matches('.expressive-code')) continue;
        if (el.closest('.prose') !== root) continue;
        const item = el.parentElement?.closest('li');
        let expectedLeft, expectedRight;
        if (el.parentElement === root) { expectedLeft = ref.left; expectedRight = ref.right; }
        else if (item && item.closest('.prose') === root) {
          const cs = getComputedStyle(item); const r = item.getBoundingClientRect();
          expectedLeft = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
          expectedRight = r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
        } else continue; /* inside a panel, a quote or an admonition: that container's own concern */
        const r = el.getBoundingClientRect();
        const placed = getComputedStyle(el).gridColumnStart;
        const optIn = el.matches('.full-bleed') || placed === 'full' ? 'full-bleed' : el.matches('.wide') || placed === 'wide' || el.parentElement?.matches('.wide') ? 'wide' : null;
        out.push({ sel: describe(el), path: ancestry(el), left: Math.round(r.left * 100) / 100, right: Math.round(r.right * 100) / 100,
          expectedLeft: Math.round(expectedLeft * 100) / 100, expectedRight: Math.round(expectedRight * 100) / 100, optIn, inItem: Boolean(item) });
      }
    }
    return out;
  })();

  return {
    viewportWidth: vw,
    articleGrid,
    gutter,
    blockEdges,
    parity,
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
      /* Keycaps are em-relative like inline code (docs section 4 line 291).
         `.global-search-field kbd` is dialog chrome outside the content model,
         so it is deliberately not in this set. */
      kbds: rendered('.prose kbd').map((el, index) => ({ sel: describe(el), path: ancestry(el), index, ...inlineFp(el) })),
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
    contrast,
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
