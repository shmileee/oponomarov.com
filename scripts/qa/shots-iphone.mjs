#!/usr/bin/env node
/**
 * Every page as an iPhone 14 Pro sees it.
 *
 *   node scripts/qa/shots-iphone.mjs [--out=<dir>] [--routes=/a/,/b/] [--browser=chromium|webkit]
 *
 * Serves the built `dist/` and captures every route in the sitemap plus the
 * 404 page and three interactive states (a case study open in the reader,
 * the reader scrolled, the search overlay with a query typed) with
 * Playwright's `iPhone 14 Pro` device: a 393×660 viewport under Safari's
 * bars, an 852px screen, 3× pixels, the iOS Safari user agent and touch.
 * Per route it writes the full page (`<name>.png`), the first screen
 * (`<name>--fold.png`) and a thumbnail, then an `index.html` gallery and a
 * `shots.json` manifest. The light theme covers every route; the dark theme
 * covers the hubs, one note, one study, one manual and the three states.
 *
 * `--browser=webkit` renders with WebKit (Safari's engine) when Playwright's
 * WebKit build and its system libraries are installed; the default is
 * Chromium under the same emulation, whose glyph rasterisation and native
 * controls differ from Safari's while layout, breakpoints and sizes match.
 *
 * Chromium rasterises a single full-page capture only up to about 32k
 * device pixels — 10 900 CSS px at 3× — and the longest manuals are taller,
 * so a page above `TALL` is captured in `STRIP`-high viewport strips,
 * scrolling between them with the sticky header and the floating controls
 * made transparent after the first strip, and stitched.
 *
 * Output defaults to `.omo/screenshots/iphone-14-pro/` (git-ignored). Run
 * `npm run build` first; the script reads `dist/`.
 */
import { chromium, devices, webkit } from "playwright";
import sharp from "sharp";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;
const DIST = path.resolve("dist");
const OUT = path.resolve(option("out", ".omo/screenshots/iphone-14-pro"));
const ONLY = option("routes", "")?.split(",").filter(Boolean);
const engine = option("browser", "chromium") === "webkit" ? webkit : chromium;

if (!existsSync(path.join(DIST, "sitemap.xml"))) throw new Error("dist/sitemap.xml is missing: run `npm run build` first.");

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4", ".json": "application/json", ".xml": "application/xml" };
const server = createServer(async (request, response) => {
  let file = path.join(DIST, decodeURIComponent(request.url.split("?")[0]));
  if (file.endsWith("/")) file = path.join(file, "index.html");
  if (!existsSync(file)) {
    const index = path.join(file, "index.html");
    if (existsSync(index)) file = index;
    else {
      response.writeHead(404, { "content-type": "text/html" }).end(await readFile(path.join(DIST, "404.html")));
      return;
    }
  }
  response.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(await readFile(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const sitemapRoutes = [...readFileSync(path.join(DIST, "sitemap.xml"), "utf8").matchAll(/<loc>https:\/\/oponomarov\.com([^<]*)<\/loc>/g)].map((match) => match[1]);
const routes = ONLY.length ? ONLY : [...sitemapRoutes, "/this-page-does-not-exist/"];
const nameOf = (route) => (route === "/" ? "home" : route.replace(/^\/|\/$/g, "").replace(/\//g, "__"));
const sectionOf = (route) => {
  if (route === "/") return "Portfolio";
  if (route.startsWith("/case-studies/")) return "Case studies";
  if (route.startsWith("/blog/categories/")) return "Note topics";
  if (route.startsWith("/blog")) return "Notes";
  if (route.startsWith("/dotfiles")) return "Dotfiles";
  return "Other";
};

const device = devices["iPhone 14 Pro"];
const DSF = device.deviceScaleFactor;
const WIDTH = device.viewport.width;
const STRIP = 1980;
const TALL = 9000;
const browser = await engine.launch();
const shots = [];

const fullPageShot = async (page, out) => {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (height <= TALL) return page.screenshot({ path: out, fullPage: true });
  await page.setViewportSize({ width: WIDTH, height: STRIP });
  const strips = [];
  for (let y = 0; y < height; y += STRIP) {
    await page.evaluate((top) => scrollTo(0, top), y);
    await page.waitForTimeout(120);
    if (y > 0) await page.addStyleTag({ content: "[data-site-header],[data-back-to-top],.context-help-trigger{opacity:0 !important;pointer-events:none}" });
    const at = await page.evaluate(() => scrollY);
    const shot = await page.screenshot({ fullPage: false });
    /* The last strip is scrolled back to the page's end; keep only the rows below the previous strip. */
    const keepFrom = Math.round((y - at) * DSF);
    strips.push(keepFrom > 0 ? await sharp(shot).extract({ left: 0, top: keepFrom, width: WIDTH * DSF, height: STRIP * DSF - keepFrom }).toBuffer() : shot);
  }
  await page.setViewportSize(device.viewport);
  const metas = await Promise.all(strips.map((strip) => sharp(strip).metadata()));
  const total = metas.reduce((sum, meta) => sum + meta.height, 0);
  await sharp({ create: { width: WIDTH * DSF, height: total, channels: 3, background: "#ffffff" } })
    .composite(strips.map((input, index) => ({ input, left: 0, top: metas.slice(0, index).reduce((sum, meta) => sum + meta.height, 0) })))
    .png()
    .toFile(out);
};

const capture = async (context, theme, name, title, route, prepare) => {
  const page = await context.newPage();
  await page.goto(base + route, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  if (prepare) await prepare(page);
  await page.waitForTimeout(250);
  const dir = path.join(OUT, theme);
  await mkdir(dir, { recursive: true });
  const full = path.join(dir, `${name}.png`);
  const fold = path.join(dir, `${name}--fold.png`);
  const thumb = path.join(dir, `${name}--thumb.webp`);
  await page.screenshot({ path: fold, fullPage: false });
  /* A fixed dialog (the reader, the search) fills the viewport; a full-page capture of the page behind it says nothing. */
  const fixedDialog = await page.evaluate(() => Boolean(document.querySelector("dialog[open]")));
  if (!fixedDialog) await fullPageShot(page, full);
  await sharp(fold).resize({ width: 262 }).webp({ quality: 80 }).toFile(thumb);
  const pageTitle = title || (await page.title()).split(" - ")[0];
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  shots.push({ theme, name, route, title: pageTitle, section: sectionOf(route), full: fixedDialog ? null : path.relative(OUT, full), fold: path.relative(OUT, fold), thumb: path.relative(OUT, thumb), height });
  await page.close();
  console.log(theme, name, fixedDialog ? "(viewport)" : `(${height}px)`);
};

const openReader = async (page) => {
  await page.waitForSelector("dialog[open]", { timeout: 5000 });
  await page.waitForTimeout(400);
};
const readerScrolled = async (page) => {
  await openReader(page);
  await page.evaluate(() => {
    const dialog = document.querySelector("dialog[open]");
    dialog.scrollTop = dialog.scrollHeight * 0.35;
  });
  await page.waitForTimeout(300);
};
const openSearch = async (page) => {
  await page.click(".op-global-search-open");
  await page.waitForSelector("dialog[open] input");
  await page.fill("dialog[open] input", "terraform");
  await page.waitForTimeout(1200);
};

const darkRoutes = ["/", "/blog/", "/blog/posts/rewriting-docker-image-registries-with-kyverno/", "/case-studies/kafka-topics-as-code/", "/dotfiles/", "/dotfiles/shortcuts/", "/contact/"].filter((route) => sitemapRoutes.includes(route));
for (const theme of ONLY.length ? ["light"] : ["light", "dark"]) {
  const context = await browser.newContext({ ...device, colorScheme: theme, reducedMotion: "reduce" });
  for (const route of theme === "light" ? routes : darkRoutes) await capture(context, theme, nameOf(route), null, route);
  if (!ONLY.length) {
    await capture(context, theme, "home--reader", "Homepage · case study open in the reader", "/#study-kafka-topics-as-code", openReader);
    await capture(context, theme, "home--reader-scrolled", "Homepage · reader, scrolled into the study", "/#study-kafka-topics-as-code", readerScrolled);
    await capture(context, theme, "home--search", "Homepage · search open, “terraform” typed", "/", openSearch);
  }
  await context.close();
}
await browser.close();
server.close();

const sections = ["Portfolio", "Case studies", "Notes", "Note topics", "Dotfiles", "Other"];
const card = (shot) => `<figure><a href="${shot.full ?? shot.fold}" title="${shot.full ? "Open the full page" : "Open the first screen"}"><img src="${shot.thumb}" width="262" height="440" alt="" loading="lazy"></a><figcaption><strong>${shot.title}</strong><span><code>${shot.route}</code>${shot.height && shot.full ? ` · ${Math.round((shot.height / device.viewport.height) * 10) / 10} screens` : ""}</span><span class="links"><a href="${shot.fold}">first screen</a>${shot.full ? ` · <a href="${shot.full}">full page</a>` : ""}</span></figcaption></figure>`;
const group = (title, items) => (items.length ? `<section><h2>${title} <small>${items.length}</small></h2><div class="grid">${items.map(card).join("")}</div></section>` : "");
const light = shots.filter((shot) => shot.theme === "light");
const dark = shots.filter((shot) => shot.theme === "dark");
const engineName = engine === webkit ? "WebKit" : "Chromium";
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>oponomarov.com on an iPhone 14 Pro</title>
<style>
:root{color-scheme:light dark;font:14px/1.45 system-ui,sans-serif;background:#f4f5f7;color:#1b1d22}@media(prefers-color-scheme:dark){:root{background:#14161a;color:#e6e8ec}}
body{margin:0;padding:24px clamp(16px,4vw,48px)}h1{font-size:22px;margin:0 0 6px}p.lede{margin:0 0 28px;opacity:.75;max-width:70ch}h2{font-size:16px;margin:36px 0 12px;border-block-end:1px solid #8884;padding-block-end:6px}h2 small{opacity:.55;font-weight:400}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(262px,1fr));gap:22px 18px}figure{margin:0}figure a img{display:block;width:100%;height:auto;aspect-ratio:393/660;object-fit:cover;object-position:top;border-radius:14px;border:1px solid #8884;background:#fff;box-shadow:0 8px 24px #0002}
figcaption{display:grid;gap:2px;margin-top:8px}figcaption strong{font-size:13px;font-weight:600}figcaption span{font-size:12px;opacity:.7}figcaption code{font-family:ui-monospace,monospace;font-size:11px}figcaption .links a{color:inherit}
</style>
<h1>oponomarov.com on an iPhone 14 Pro</h1>
<p class="lede">Every route from the sitemap plus the 404 page and three interactive states, captured with Playwright’s <code>iPhone 14 Pro</code> device (393×660 viewport under Safari’s bars, 852 screen, 3× pixels, iOS Safari user agent, touch) at ${new Date().toISOString().slice(0, 16).replace("T", " ")}. Rendered by ${engineName} under that emulation${engineName === "Chromium" ? ", so glyph rasterisation and native controls are Chromium’s, not Safari’s" : ""}. The thumbnail is the first screen; click it for the full page.</p>
${sections.map((section) => group(section, light.filter((shot) => shot.section === section && !shot.name.startsWith("home--")))).join("")}
${group("Interactive states", light.filter((shot) => shot.name.startsWith("home--")))}
${group("Dark theme", dark)}
`;
await writeFile(path.join(OUT, "index.html"), html);
await writeFile(path.join(OUT, "shots.json"), JSON.stringify(shots, null, 1));
console.log(`${shots.length} captures → ${path.relative(process.cwd(), OUT)}`);
