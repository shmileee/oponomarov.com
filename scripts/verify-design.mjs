// Design-system invariants, checked against source CSS and built HTML.
//
// verify-build.mjs answers "is the content all there?". This answers "is it all
// presented the same way?" - the class of defect that produced four prose
// treatments, three inline-code renderings and two different theme behaviours.
//
// Same conventions as verify-build.mjs: linear top-level checks, throw on the
// first failure, string and regex inspection of built output, expectations
// derived from the repository rather than hard-coded.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const styles = join(root, "src/styles");

if (!existsSync(dist)) throw new Error("Missing dist/ (run npm run build first)");

const filesBelow = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });

const htmlFiles = filesBelow(dist).filter((path) => extname(path) === ".html");
const cssSources = filesBelow(styles).filter((path) => extname(path) === ".css");
const isRedirect = (html) => html.includes('http-equiv="refresh"');
const pages = htmlFiles
  .map((path) => ({ path, html: readFileSync(path, "utf8") }))
  .filter(({ html }) => !isRedirect(html));
const named = ({ path }) => relative(dist, path);

const LAYER_ORDER =
  "@layer reset, tokens, base, expressive-code, layout, components, prose, primitives, utilities, print;";
const LAYER_NAMES = LAYER_ORDER.replace("@layer ", "").replace(";", "")
  .split(",").map((name) => name.trim());
const BREAKPOINTS = ["40rem", "48rem", "64rem", "80rem", "96rem"];
const TOKEN_FILE = join(styles, "tokens.css");

// V1 - the layer order is declared before any stylesheet, identically everywhere.
{
  const indexCss = readFileSync(join(styles, "index.css"), "utf8");
  const firstStatement = indexCss
    .replace(/\/\*[\s\S]*?\*\//g, "")   // block comments span lines; strip before reading the first statement
    .split("\n").map((line) => line.trim())
    .find(Boolean);
  if (firstStatement !== LAYER_ORDER) {
    throw new Error(`src/styles/index.css must open with the layer order.\nExpected: ${LAYER_ORDER}\nActual:   ${firstStatement}`);
  }
  for (const page of pages) {
    const head = page.html.slice(0, page.html.indexOf("</head>"));
    if (!head.includes(LAYER_ORDER)) {
      throw new Error(`${named(page)} does not declare the cascade layer order in <head>.`);
    }
    const layerAt = head.indexOf(LAYER_ORDER);
    const firstSheet = head.search(/<link[^>]+rel="stylesheet"/);
    if (firstSheet !== -1 && firstSheet < layerAt) {
      throw new Error(`${named(page)} links a stylesheet before declaring the layer order; cascade order becomes dependent on load order.`);
    }
  }
}

// V2 - every source stylesheet is fully layered, using only declared layers.
for (const path of cssSources) {
  const css = readFileSync(path, "utf8");
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const name = relative(root, path);
  for (const match of stripped.matchAll(/@layer\s+([a-z-]+)\s*{/g)) {
    if (!LAYER_NAMES.includes(match[1])) {
      throw new Error(`${name} uses undeclared cascade layer "${match[1]}". Declared: ${LAYER_NAMES.join(", ")}`);
    }
  }
  if (name.endsWith("index.css")) continue;
  const outsideLayer = stripped
    .replace(/@layer\s+[a-z-]+\s*{[\s\S]*}/m, "")
    .replace(/@(import|charset)[^;]*;/g, "")
    .trim();
  if (outsideLayer) {
    throw new Error(`${name} has rules outside a @layer block; unlayered author CSS beats every layer.\nFirst offending text: ${outsideLayer.slice(0, 160)}`);
  }
}

// V3 - no !important, and raw colours only in the token file.
for (const path of cssSources) {
  const css = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const name = relative(root, path);
  if (/!\s*important/.test(css)) {
    const line = css.split("\n").findIndex((l) => /!\s*important/.test(l)) + 1;
    throw new Error(`${name}:${line} uses !important. The layer order exists so it is never needed.`);
  }
  if (path === TOKEN_FILE) continue;
  const colour = css.match(/(?<![\w-])(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|light-dark\([^)]*\))/i);
  if (colour) {
    const line = css.slice(0, colour.index).split("\n").length;
    throw new Error(`${name}:${line} declares the raw colour "${colour[0]}". Only src/styles/tokens.css may; everything else consumes semantic tokens.`);
  }
  if (/\[data-theme/.test(css)) {
    throw new Error(`${name} branches on [data-theme]. Only tokens.css may; components must theme through light-dark() tokens so light and dark cannot diverge.`);
  }
}

// V4 - breakpoints come from the fixed scale.
for (const path of cssSources) {
  const css = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const name = relative(root, path);
  for (const query of css.matchAll(/@(?:media|container)[^{]*?(?:width\s*[<>]=?\s*|min-width:\s*|max-width:\s*)([\d.]+(?:rem|px|em))/g)) {
    if (!BREAKPOINTS.includes(query[1])) {
      const line = css.slice(0, query.index).split("\n").length;
      throw new Error(`${name}:${line} uses breakpoint ${query[1]}, which is not on the scale ${BREAKPOINTS.join(" ")}.`);
    }
  }
}

// V5 - the legacy parallel design systems are gone from the build.
for (const page of pages) {
  const legacy = page.html.match(/href="\/(assets|blog-assets)\/css\/[^"]+"/);
  if (legacy) throw new Error(`${named(page)} still links the legacy stylesheet ${legacy[0]}.`);
}
for (const stale of ["dist/assets/css", "dist/blog-assets/css"]) {
  if (existsSync(join(root, stale))) throw new Error(`${stale} still exists in the build output.`);
}

// V6 - one theme-init script, byte-identical, honouring the OS preference.
{
  const scripts = new Map();
  for (const page of pages) {
    const match = page.html.match(/<script>([\s\S]*?om-theme[\s\S]*?)<\/script>/);
    if (!match) throw new Error(`${named(page)} has no theme-init script; it would flash the wrong theme.`);
    const body = match[1].trim();
    if (!scripts.has(body)) scripts.set(body, []);
    scripts.get(body).push(named(page));
  }
  if (scripts.size !== 1) {
    const summary = [...scripts.values()].map((routes) => `${routes.length} page(s) e.g. ${routes[0]}`).join("\n  ");
    throw new Error(`Found ${scripts.size} different theme-init scripts. They must be identical or the theme changes as the reader navigates.\n  ${summary}`);
  }
  const [body] = [...scripts.keys()];
  if (!body.includes("prefers-color-scheme")) {
    throw new Error("The theme-init script ignores prefers-color-scheme; a first-time visitor gets a theme unrelated to their system setting.");
  }
}

// V7 - every page loads the same author stylesheets.
{
  const normalise = (html) =>
    [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
      .map((m) => m[1].replace(/\?.*$/, "").replace(/\.[A-Za-z0-9_-]{8}\.css$/, ".[hash].css"))
      .filter((href) => !/\/ec\./.test(href))  // expressive-code ships only where code exists
      .sort().join(" ");
  const sets = new Map();
  for (const page of pages) {
    const key = normalise(page.html);
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key).push(named(page));
  }
  if (sets.size !== 1) {
    const summary = [...sets.entries()].map(([key, routes]) => `  [${routes.length}] ${key || "(none)"}\n      e.g. ${routes[0]}`).join("\n");
    throw new Error(`Pages load ${sets.size} different stylesheet sets. One set means one design system.\n${summary}`);
  }
}

// V8 - the content-primitive contract holds in both directions.
{
  const contract = JSON.parse(readFileSync(join(root, "src/lib/content-primitives.json"), "utf8"));
  const primitives = readFileSync(join(styles, "primitives.css"), "utf8");
  const elsewhere = ["layout.css", "prose.css"].map((f) => readFileSync(join(styles, f), "utf8")).join("\n");
  const unstyled = Object.keys(contract.classes)
    .filter((cls) => !primitives.includes(`.${cls}`) && !elsewhere.includes(`.${cls}`));
  if (unstyled.length) {
    throw new Error(`Contract classes with no CSS: ${unstyled.join(", ")}. Adding a class to the contract means styling it.`);
  }
  const retired = { ...contract.renames, ...contract.removed };
  for (const page of pages) {
    for (const attr of page.html.matchAll(/class="([^"]*)"/g)) {
      for (const cls of attr[1].split(/\s+/).filter(Boolean)) {
        if (cls in retired) {
          throw new Error(`${named(page)} still renders retired class "${cls}". Contract says: ${retired[cls]}`);
        }
      }
    }
  }
}

// V9 - every table is a reachable, announced scroll region.
{
  let tables = 0;
  for (const page of pages) {
    for (const table of page.html.matchAll(/<table[\s>]/g)) {
      tables += 1;
      const before = page.html.slice(Math.max(0, table.index - 400), table.index);
      const wrapper = before.lastIndexOf("<div");
      const tag = wrapper === -1 ? "" : before.slice(wrapper);
      if (!tag.includes("table-scroll")) {
        throw new Error(`${named(page)} has a table that is not wrapped in .table-scroll; on a narrow screen its columns are unreachable.`);
      }
      if (!tag.includes('tabindex="0"') || !tag.includes('role="region"')) {
        throw new Error(`${named(page)} has a table whose scroll container is not keyboard reachable (needs tabindex="0" and role="region").`);
      }
      if (!/aria-label="[^"]+"/.test(tag)) {
        throw new Error(`${named(page)} has a table scroll region with no accessible name.`);
      }
    }
  }
  if (tables === 0) throw new Error("No tables found in the build; the table checks are not actually running.");
}

// V10 - images reserve their space and describe themselves.
for (const page of pages) {
  for (const img of page.html.matchAll(/<img[^>]*>/g)) {
    const tag = img[0];
    if (!/\salt=/.test(tag)) throw new Error(`${named(page)} has an <img> without alt: ${tag.slice(0, 120)}`);
    if (!/\swidth=/.test(tag) || !/\sheight=/.test(tag)) {
      throw new Error(`${named(page)} has an <img> without width/height, which shifts the page as it loads: ${tag.slice(0, 120)}`);
    }
  }
}

// V11 - no inline style attributes except expressive-code's token variables.
for (const page of pages) {
  for (const attr of page.html.matchAll(/\sstyle="([^"]*)"/g)) {
    const value = attr[1].trim();
    if (value.startsWith("--")) continue;          // EC sets custom properties on token spans
    if (/^transform:\s*scaleX/.test(value)) continue; // reading progress, set at runtime
    throw new Error(`${named(page)} carries the inline style "${value.slice(0, 80)}". Presentation belongs in the stylesheet.`);
  }
}

// V12 - no scoped <style> blocks reintroducing per-page CSS.
{
  const componentDirs = [join(root, "src/components"), join(root, "src/pages")];
  for (const dir of componentDirs) {
    for (const path of filesBelow(dir).filter((p) => p.endsWith(".astro"))) {
      const source = readFileSync(path, "utf8");
      for (const block of source.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)) {
        /* SiteLayout declares the cascade layer order inline, before any
           stylesheet link, because first appearance fixes the order. That is
           the one permitted <style> block. */
        if (block[1].includes("is:inline") && block[2].trim().startsWith("@layer ")) continue;
        throw new Error(`${relative(root, path)} contains a <style> block. All CSS lives in src/styles/ so the cascade stays predictable.`);
      }
    }
  }
}

// V13 - expressive-code is layered and scrolls rather than wraps: a line is a
//       line, and a block wider than its column scrolls inside its own frame
//       (astro.config.mjs wrap: false; prose.css draws the scrollbar). QA S4
//       checks the rendered blocks; this checks the shipped stylesheet.
{
  const ec = filesBelow(join(dist, "_astro")).find((p) => /\/ec\.[^/]+\.css$/.test(p));
  if (!ec) throw new Error("No expressive-code stylesheet in dist/_astro/.");
  const css = readFileSync(ec, "utf8");
  if (!css.includes("@layer expressive-code")) {
    throw new Error("The expressive-code stylesheet is not in its cascade layer; our code styling would need !important to win.");
  }
  if (!/\.expressive-code pre\{[^}]*overflow-x:\s*auto/.test(css)) {
    throw new Error("Expressive-code blocks are not their own horizontal scroll containers; a long line would widen the page.");
  }
  const built = pages.map(({ html }) => html).join("\n");
  if (/<pre[^>]*class="[^"]*\bwrap\b/.test(built)) {
    throw new Error("A fenced block still renders with Expressive Code's wrap class; long lines must scroll, not wrap (astro.config.mjs defaultProps.wrap).");
  }
}

// V14 - keycaps are em-relative, like inline code (docs section 4, line 291):
//       every font-size on a rule that names `kbd` in the content layers is
//       var(--code-inline-size). A fixed step here is the defect that rendered
//       one keycap at two sizes on one page. A check that finds nothing to
//       inspect proves nothing, so that is a failure too.
{
  let seen = 0;
  for (const file of ["prose.css", "primitives.css"]) {
    const css = readFileSync(join(styles, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/\bkbd\b/.test(selector)) continue;
      const size = /font-size:\s*([^;]+);/.exec(body)?.[1].trim();
      if (!size) continue;
      seen += 1;
      if (size !== "var(--code-inline-size)") throw new Error(`${file}: \`${selector.trim()}\` sizes a keycap with ${size}; keycaps take var(--code-inline-size) so they stay a fraction of their text.`);
    }
  }
  if (!seen) throw new Error("V14 found no keycap font-size rule to check.");
}

// V15 - a byte budget. The design system is one stylesheet and a handful of
//       scripts, and both grow only when someone means them to: a fix that
//       adds a rule is fine, a fix that adds a subsystem shows up here first.
//       Budgets sit about 15% over the build they were set against
//       (author CSS 111KB, syntax-theme CSS 17KB, scripts 44KB, fonts 162KB,
//       all uncompressed); raise one deliberately, in the same change that
//       needs it. Pagefind's index is content-sized and is not budgeted.
{
  const bytes = (paths) => paths.reduce((sum, path) => sum + readFileSync(path).length, 0);
  const built = filesBelow(dist);
  const authorCss = built.filter((path) => /\/_astro\/(?!ec\.)[^/]+\.css$/.test(path));
  const syntaxCss = built.filter((path) => /\/_astro\/ec\.[^/]+\.css$/.test(path));
  const scripts = built.filter((path) => extname(path) === ".js" && !path.includes(`${join(dist, "pagefind")}/`));
  const fonts = built.filter((path) => extname(path) === ".woff2");
  const budgets = [
    ["author stylesheets", authorCss, 128_000],
    ["syntax-theme stylesheet", syntaxCss, 24_000],
    ["scripts (own and Astro chunks)", scripts, 64_000],
    ["web fonts", fonts, 200_000],
  ];
  for (const [label, paths, budget] of budgets) {
    if (!paths.length) throw new Error(`V15 found no ${label} to weigh.`);
    const total = bytes(paths);
    if (total > budget) throw new Error(`${label} weigh ${total} bytes, over the ${budget}-byte budget: ${paths.map((path) => `${relative(dist, path)} (${readFileSync(path).length})`).join(", ")}. Raise the budget in verify-design.mjs only on purpose.`);
  }
}

// V16 - authored SVG paints with semantic tokens. Every fill and stroke in the
//       built HTML is `none`, `currentColor`, a `url(#…)` reference, or exactly
//       one `var(--color-…)` naming a token the token file declares. A legacy
//       alias (`--w88`, `--ab4`, `--bg`) would render only while tokens.css
//       keeps its shim; a malformed value (`var(--color-text))`, a stray
//       parenthesis from a rewrite) is invalid and paints black text and no
//       border, which passes unnoticed in the light theme and fails in the
//       dark one.
{
  const tokens = readFileSync(join(styles, "tokens.css"), "utf8");
  const declared = new Set([...tokens.matchAll(/--(color-[a-z0-9-]+):/g)].map((match) => match[1]));
  const allowed = /^(?:none|currentColor|url\(#[^)]+\)|var\(--(color-[a-z0-9-]+)\))$/;
  const offences = [];
  for (const page of pages) {
    for (const match of page.html.matchAll(/\s(?:fill|stroke)="([^"]*)"/g)) {
      const value = match[1];
      const ok = allowed.exec(value);
      if (!ok) offences.push(`${named(page)}: ${value}`);
      else if (ok[1] && !declared.has(ok[1])) offences.push(`${named(page)}: var(--${ok[1]}) is not declared in tokens.css`);
    }
  }
  if (offences.length) {
    throw new Error(`SVG paint attributes must be none, currentColor, a url(#…) reference, or one declared var(--color-…):\n  ${[...new Set(offences)].slice(0, 12).join("\n  ")}`);
  }
}

console.log(
  `Verified the design system: ${pages.length} pages on one stylesheet set and one theme script, ` +
  `${cssSources.length} fully layered stylesheets with no !important and no stray colours, ` +
  `every table a reachable scroll region, every image sized, expressive-code layered and scrolling in its own frame, keycaps sized like inline code, and everything inside its byte budget.`,
);
