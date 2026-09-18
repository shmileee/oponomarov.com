import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { readPostCategories, uniqueCategories } from "../src/lib/categories.mjs";

/* Every expectation below is derived from the content roots, never typed in:
   a new case study, note, topic or manual changes the expected counts and
   names with it, and a build that drops one still fails. */
const readFrontmatter = (path) => {
  const block = readFileSync(path, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  if (block === undefined) throw new Error(`${path} has no leading --- frontmatter block`);
  const data = yaml.load(block);
  return data && typeof data === "object" ? data : {};
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const portfolioRoot = resolve(root, process.env.PORTFOLIO_DIR ?? "./content/portfolio");
const blogRoot = resolve(root, process.env.BLOG_DIR ?? "./content/blog");
const dotfilesRoot = resolve(root, process.env.DOTFILES_DIR ?? "./content/dotfiles");
for (const [envName, directory] of [
  ["PORTFOLIO_DIR", portfolioRoot],
  ["BLOG_DIR", blogRoot],
  ["DOTFILES_DIR", dotfilesRoot],
]) {
  if (!existsSync(directory)) throw new Error(`Missing content root ${directory} (sync content/ or set ${envName})`);
}
const required = [
  "dist/index.html",
  "dist/404.html",
  "dist/robots.txt",
  "dist/sitemap.xml",
  "dist/assets/fonts/bricolage-grotesque-latin.woff2",
  "dist/favicon.svg",
  "dist/favicon-32x32.png",
  "dist/apple-touch-icon.png",
  "dist/site.webmanifest",
  "dist/pagefind/pagefind.js",
  "dist/contact/index.html",
  "dist/blog/index.html",
  "dist/blog/feed.xml",
  "dist/dotfiles/index.html",
];

const missing = required.filter((path) => !existsSync(join(root, path)));
if (missing.length > 0) throw new Error(`Missing build artifacts:\n${missing.join("\n")}`);

const filesBelow = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? filesBelow(path) : [path];
});

const brokenLinks = [];
const htmlFiles = filesBelow(dist).filter((path) => path.endsWith(".html"));
for (const htmlPath of htmlFiles) {
  const html = readFileSync(htmlPath, "utf8");
  const documentMarkup = html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  for (const match of documentMarkup.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const raw = match[1].replaceAll("&amp;", "&");
    if (/^(?:[a-z]+:|\/\/|#|data:)/i.test(raw)) continue;
    const clean = raw.split(/[?#]/)[0];
    if (!clean) continue;
    const candidate = clean.startsWith("/") ? join(dist, clean) : resolve(dirname(htmlPath), clean);
    const candidates = extname(candidate) ? [candidate] : [candidate, join(candidate, "index.html")];
    if (!candidates.some(existsSync)) brokenLinks.push(`${relative(dist, htmlPath)} → ${normalize(raw)}`);
  }
}

if (brokenLinks.length > 0) throw new Error(`Broken internal references:\n${brokenLinks.join("\n")}`);

for (const htmlPath of htmlFiles) {
  const html = readFileSync(htmlPath, "utf8");
  const route = relative(dist, htmlPath);
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  /* A hub page is "Oleksandr Ponomarov - <Section>"; every other page puts
     its own title first and ends with the section and the name. */
  if (!title || !(title.startsWith("Oleksandr Ponomarov - ") || title.endsWith(" - Oleksandr Ponomarov"))) throw new Error(`${route} has an inconsistent document title: ${title || "missing"}`);
  if (title.includes("·")) throw new Error(`${route} still uses the legacy title separator`);
  for (const metadata of [
    'href="/favicon.svg"',
    'href="/favicon-32x32.png"',
    'href="/apple-touch-icon.png"',
    'href="/site.webmanifest"',
    'name="theme-color"',
  ]) {
    if (!html.includes(metadata)) throw new Error(`${route} is missing shared identity metadata ${metadata}`);
  }
  if (/rel="icon"[^>]+href="data:/i.test(html)) throw new Error(`${route} still embeds an inconsistent data-URI favicon`);
}

const routeDirectories = (directory) => readdirSync(directory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(directory, entry.name, "index.html")))
  .map((entry) => entry.name);

const caseStudies = routeDirectories(join(dist, "case-studies"));
const isRedirectRoute = (name) => readFileSync(join(dist, "case-studies", name, "index.html"), "utf8").includes('http-equiv="refresh"');
const canonicalCaseStudies = caseStudies.filter((name) => !isRedirectRoute(name));
const workRedirects = routeDirectories(join(dist, "work"));
const postRoutes = routeDirectories(join(dist, "blog/posts"));
const isPostRedirect = (name) => readFileSync(join(dist, "blog/posts", name, "index.html"), "utf8").includes('http-equiv="refresh"');
/* A post's canonical route plus one redirect per alias it declares, the same
   split the case studies get below. */
const postPages = postRoutes.filter((name) => !isPostRedirect(name));
const postRedirects = postRoutes.filter(isPostRedirect).sort();
const categoryPages = routeDirectories(join(dist, "blog/categories"));

const formatSet = (values) => (values.length > 0 ? values.join(", ") : "(none)");
const caseStudySources = filesBelow(join(portfolioRoot, "content/case-studies")).filter((path) => basename(path) === "index.md");
const caseStudyFrontmatter = caseStudySources.map((path) => ({ folder: basename(dirname(path)), data: readFrontmatter(path) }));
const expectedCaseStudies = caseStudyFrontmatter.map(({ folder }) => folder).sort();
/* Every alias a study declares becomes a redirect page under /case-studies/;
   every study also keeps its /work/ compatibility page. */
const expectedAliases = caseStudyFrontmatter.flatMap(({ folder, data }) => (Array.isArray(data.aliases) ? data.aliases : []).filter((alias) => alias !== folder)).sort();
const postsSourceDir = join(blogRoot, "content/posts");
const postSources = readdirSync(postsSourceDir).filter((name) => name.endsWith(".md")).sort();
const expectedPosts = postSources.length;
const postSlug = (name) => name.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
const expectedPostAliases = postSources
  .flatMap((name) => {
    const { aliases } = readFrontmatter(join(postsSourceDir, name));
    return (Array.isArray(aliases) ? aliases : []).filter((alias) => alias !== postSlug(name));
  })
  .sort();
const expectedCategories = uniqueCategories(readPostCategories(postsSourceDir));

if (canonicalCaseStudies.sort().join("\n") !== expectedCaseStudies.join("\n")) throw new Error(`Canonical case-study routes diverge from the folders under ${relative(root, join(portfolioRoot, "content/case-studies"))}.\nExpected: ${formatSet(expectedCaseStudies)}\nActual:   ${formatSet(canonicalCaseStudies)}`);
const aliasRedirects = caseStudies.filter((name) => expectedAliases.includes(name)).sort();
if (aliasRedirects.join("\n") !== expectedAliases.join("\n")) throw new Error(`Case-study alias redirects diverge from the aliases declared in frontmatter.\nExpected: ${formatSet(expectedAliases)}\nActual:   ${formatSet(aliasRedirects)}`);
const unexpectedRoutes = caseStudies.filter((name) => !expectedCaseStudies.includes(name) && !expectedAliases.includes(name));
if (unexpectedRoutes.length > 0) throw new Error(`Case-study routes exist that no folder or alias declares: ${formatSet(unexpectedRoutes)}`);
if (workRedirects.sort().join("\n") !== expectedCaseStudies.join("\n")) throw new Error(`/work compatibility redirects diverge from the case-study folders.\nExpected: ${formatSet(expectedCaseStudies)}\nActual:   ${formatSet(workRedirects)}`);
if (postPages.length !== expectedPosts) throw new Error(`Expected ${expectedPosts} blog routes (*.md posts under ${relative(root, postsSourceDir)}), found ${postPages.length}`);
if (postRedirects.join("\n") !== expectedPostAliases.join("\n")) throw new Error(`Post alias redirects diverge from the aliases declared in frontmatter.\nExpected: ${formatSet(expectedPostAliases)}\nActual:   ${formatSet(postRedirects)}`);
const builtCategories = [...categoryPages].sort();
if (builtCategories.join("\n") !== expectedCategories.join("\n")) throw new Error(`Built blog category pages diverge from post frontmatter categories.\nExpected: ${formatSet(expectedCategories)}\nActual:   ${formatSet(builtCategories)}`);

const docsSourceDir = join(dotfilesRoot, "docs/content");
const markdownSources = [
  ...caseStudySources,
  ...[postsSourceDir, docsSourceDir].flatMap((directory) => readdirSync(directory).filter((name) => name.endsWith(".md")).map((name) => join(directory, name))),
];
const admonitionKindOf = { note: "note", info: "note", tip: "tip", important: "important", warning: "warning", warn: "warning", caution: "caution", danger: "danger", critical: "critical" };
const authoredAdmonitions = markdownSources
  .flatMap((path) => readFileSync(path, "utf8").match(/^> \[!(note|info|tip|important|warning|warn|caution|danger|critical)\]/gim) ?? [])
  .map((marker) => admonitionKindOf[marker.slice(4, -1).toLowerCase()]);
const expectedAdmonitions = authoredAdmonitions.length;
const expectedAdmonitionKinds = [...new Set(authoredAdmonitions)].sort();
/* Every titled code fence in the content becomes one titled frame: as many
   frames per title as fences carry it (two notes may both show a
   `versions.tf`), never fewer and never more. */
const expectedCodeTitles = new Map();
for (const title of markdownSources.flatMap((path) => [...readFileSync(path, "utf8").matchAll(/^```[^\n]*?\btitle="([^"]+)"/gm)].map((match) => match[1]))) {
  expectedCodeTitles.set(title, (expectedCodeTitles.get(title) ?? 0) + 1);
}
const expectedDocSlugs = readdirSync(docsSourceDir)
  .filter((name) => name.endsWith(".md"))
  .map((name) => name.replace(/\.md$/, ""))
  .sort();
for (const slug of expectedDocSlugs) {
  const target = slug === "index" ? join(dist, "dotfiles/index.html") : join(dist, "dotfiles", slug, "index.html");
  if (!existsSync(target)) throw new Error(`Dotfiles manual ${slug}.md did not produce ${relative(root, target)}`);
}
const expectedDocRoutes = expectedDocSlugs.filter((slug) => slug !== "index");
const builtDocRoutes = routeDirectories(join(dist, "dotfiles")).sort();
if (builtDocRoutes.join("\n") !== expectedDocRoutes.join("\n")) throw new Error(`Built Dotfiles routes diverge from ${relative(root, docsSourceDir)}.\nExpected: ${formatSet(expectedDocRoutes)}\nActual:   ${formatSet(builtDocRoutes)}`);

const readRoutes = (base, names) => names.map((name) => readFileSync(join(base, name, "index.html"), "utf8")).join("\n");
const portfolioHtml = readRoutes(join(dist, "case-studies"), canonicalCaseStudies);
const portfolioHomeHtml = readFileSync(join(dist, "index.html"), "utf8");
const blogHtml = readRoutes(join(dist, "blog/posts"), postPages);
const blogHomeHtml = readFileSync(join(dist, "blog/index.html"), "utf8");
const contactHtml = readFileSync(join(dist, "contact/index.html"), "utf8");
const docsHomeHtml = readFileSync(join(dist, "dotfiles/index.html"), "utf8");
const docsHtml = expectedDocSlugs
  .map((slug) => readFileSync(join(dist, "dotfiles", slug === "index" ? "index.html" : `${slug}/index.html`), "utf8"))
  .join("\n");

const allArticleHtml = portfolioHtml + blogHtml + docsHtml;
/* A rendered title is the path split at its last slash into a directory span
   and a name span (expressive-code-frame-title.mjs), the whole path repeated
   in the tooltip; a bare file name is a name span alone. */
const renderedTitle = (filename) => {
  const cut = filename.lastIndexOf("/");
  const parts = cut <= 0 || cut === filename.length - 1
    ? `<span class="title-name">${filename}</span>`
    : `<span class="title-dir">${filename.slice(0, cut)}</span><span class="title-name">${filename.slice(cut)}</span>`;
  return `<span class="title" title="${filename}">${parts}</span>`;
};
for (const [filename, expected] of expectedCodeTitles) {
  const occurrences = allArticleHtml.split(renderedTitle(filename)).length - 1;
  if (occurrences !== expected) throw new Error(`Expected ${expected} code frame(s) titled ${filename} (${expected} titled fence(s) in the content), found ${occurrences}`);
}
/* And no frame carries a title the content did not write: EC's frames plugin
   can lift a title out of a block's first line (astro.config.mjs turns that
   off), which retitled a transcript and swallowed its first line. */
const renderedTitles = [...allArticleHtml.matchAll(/<span class="title" title="([^"]*)"/g)].map((match) => match[1]);
const expectedTitleCount = [...expectedCodeTitles.values()].reduce((sum, count) => sum + count, 0);
if (renderedTitles.length !== expectedTitleCount) {
  const unexpected = renderedTitles.filter((title) => !expectedCodeTitles.has(title));
  throw new Error(`Rendered ${renderedTitles.length} code frame titles for ${expectedTitleCount} titled fences; titles no fence declares: ${formatSet(unexpected)}`);
}
if (portfolioHtml.includes('class="code-exhibit"')) throw new Error("A legacy portfolio code wrapper would create a nested code frame");
/* The index and reader are bundled from src/scripts: the homepage loads one
   hashed module and the reader arrives as a chunk of its own. */
if (!/<script type="module" src="\/_astro\/[^"]+\.js"><\/script>/.test(portfolioHomeHtml)) throw new Error("The portfolio home page does not load a bundled module (the case-study index and reader)");
/* The homepage lists every study, numbered in the published order, and the
   reader manifest carries the same set. */
const homeCards = [...portfolioHomeHtml.matchAll(/data-case-card[^>]*data-open-study="([^"]+)"/g)].map((match) => match[1]).sort();
if (homeCards.join("\n") !== expectedCaseStudies.join("\n")) throw new Error(`Homepage case cards diverge from the case-study folders.\nExpected: ${formatSet(expectedCaseStudies)}\nActual:   ${formatSet(homeCards)}`);
const manifest = JSON.parse(portfolioHomeHtml.match(/<script[^>]*data-reader-manifest[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? "[]");
if (manifest.map((entry) => entry.id).sort().join("\n") !== expectedCaseStudies.join("\n")) throw new Error("The reader manifest does not list every case study by folder");
for (const entry of manifest) {
  if (!Number.isInteger(entry.number) || entry.number < 1 || entry.number > manifest.length) throw new Error(`Reader manifest entry ${entry.id} has no valid case number`);
}
/* Every study's summary, role and evidence render as inline Markdown: a
   backtick never reaches the page as a literal character. */
for (const name of canonicalCaseStudies) {
  const html = readFileSync(join(dist, "case-studies", name, "index.html"), "utf8");
  const header = html.match(/<header class="article-header">([\s\S]*?)<\/header>/)?.[1] ?? "";
  if (header.includes("`")) throw new Error(`Case study ${name} renders a literal backtick in its header; frontmatter strings must pass through renderInline`);
}
if (portfolioHomeHtml.match(/<main[\s\S]*<\/main>/)?.[0].includes("`")) throw new Error("The homepage renders a literal backtick; frontmatter strings must pass through renderInline");
const readerChunk = readdirSync(join(dist, "_astro")).find((name) => /^reader\.[\w-]+\.js$/.test(name));
if (!readerChunk) throw new Error("The portfolio reader chunk (dist/_astro/reader.*.js) was not built");
const readerScript = readFileSync(join(dist, "_astro", readerChunk), "utf8");
if (!readerScript.includes("oponomarov:content-updated")) throw new Error("The portfolio reader is missing its dynamic-enhancement event");
/* Every article route carries a table of contents, case studies included: the
   rule is a property of ArticleShell, not of whichever routes remembered to
   pass headings. Counted per route rather than over the joined HTML, so one
   study keeping its TOC cannot cover for the rest losing theirs. The Dotfiles
   landing page is the one deliberate exemption and is asserted separately. */
for (const name of canonicalCaseStudies) {
  const html = readFileSync(join(dist, "case-studies", name, "index.html"), "utf8");
  if (!html.includes("toc__list")) throw new Error(`Case study ${name} renders no table of contents`);
}
for (const slug of expectedDocRoutes) {
  const html = readFileSync(join(dist, "dotfiles", slug, "index.html"), "utf8");
  if (!html.includes("toc__list")) throw new Error(`Dotfiles manual ${slug} renders no table of contents`);
}
if (docsHomeHtml.includes("toc__list")) throw new Error("The Dotfiles landing page is a hub, not an article, and must not render a table of contents");
/* Inline code, the layer architecture and the single stylesheet set are design
   invariants; scripts/verify-design.mjs owns them against the real output. */
if (/\{%|\{\{\s*['"]\//.test(blogHtml)) throw new Error("Unconverted Jekyll syntax remains in blog output");
if (!blogHtml.includes("comments-region") || !blogHtml.includes("toc__list")) throw new Error("Blog article interactions are missing");
/* Interactions the content authors opt into must reach the page intact. */
const docsSource = readdirSync(docsSourceDir).filter((name) => name.endsWith(".md")).map((name) => readFileSync(join(docsSourceDir, name), "utf8")).join("\n");
if (docsSource.includes("data-shortcut-filter") && !docsHtml.includes("data-shortcut-status")) throw new Error("A Dotfiles manual authors a shortcut filter but the built page carries no result-count region");
if (docsSource.includes("context-help-source") && !docsHtml.includes("context-help")) throw new Error("A Dotfiles manual authors quick context but the built page carries none");
/* Every manual's title reaches its page as the h1. */
for (const slug of expectedDocSlugs) {
  const { title } = readFrontmatter(join(docsSourceDir, `${slug}.md`));
  const target = slug === "index" ? join(dist, "dotfiles/index.html") : join(dist, "dotfiles", slug, "index.html");
  const html = readFileSync(target, "utf8");
  const heading = html.match(/<h1\b[^>]*>([^<]*)<\/h1>/)?.[1];
  if (slug !== "index" && typeof title === "string" && heading !== title.replace(/&/g, "&amp;")) throw new Error(`Dotfiles manual ${slug}.md does not render its title "${title}" as the page heading (found ${heading ?? "no h1"})`);
}
const admonitionHtml = allArticleHtml;
const admonitionCount = admonitionHtml.split('class="op-admonition ').length - 1;
if (admonitionCount !== expectedAdmonitions) throw new Error(`Expected ${expectedAdmonitions} native Astro admonitions (the [!KIND] quotes in the content), found ${admonitionCount}`);
for (const variant of expectedAdmonitionKinds) {
  if (!admonitionHtml.includes(`data-admonition="${variant}"`)) throw new Error(`Built content is missing the ${variant} admonition variant the content authors`);
}
if (admonitionHtml.includes('class="admonition ') || /(?:ℹ️|⚠️|💡)/u.test(admonitionHtml)) throw new Error("Legacy HTML or emoji callouts remain in built content");

for (const [section, html] of [
  ["portfolio", portfolioHomeHtml],
  ["blog", blogHomeHtml],
  ["dotfiles", docsHomeHtml],
  ["contact", contactHtml],
]) {
  if (!html.includes('aria-label="Site sections"')) throw new Error(`${section} does not use the shared product shell`);
  if (!html.includes("data-global-search-open") || !html.includes("data-global-search-dialog")) throw new Error(`${section} is missing global search`);
  if (!html.includes("data-pagefind-body")) throw new Error(`${section} is missing its search-index boundary`);
  for (const href of ['href="/"', 'href="/blog/"', 'href="/dotfiles/"']) {
    if (!html.includes(href)) throw new Error(`${section} is missing shared path navigation ${href}`);
  }
  if (!html.includes('href="/contact/"')) throw new Error(`${section} is missing the shared Contact destination`);
  if (!html.includes("data-back-to-top")) throw new Error(`${section} is missing the shared back-to-top control`);
  if (!html.includes('aria-label="Contact"') || !html.includes('aria-label="GitHub profile"') || !html.includes('aria-label="LinkedIn profile"')) throw new Error(`${section} is missing the shared contact or social-profile controls`);
}

if ((portfolioHomeHtml + portfolioHtml + blogHomeHtml + blogHtml + docsHtml + contactHtml).includes("op-section-nav")) throw new Error("A redundant secondary navigation bar remains in canonical output");
const docsSidebarCount = docsHtml.split('aria-label="Dotfiles documentation"').length - 1;
if (docsSidebarCount !== 0) throw new Error(`Expected no redundant Dotfiles sidebars, found ${docsSidebarCount}`);
if (docsHtml.includes('class="eyebrow">Dotfiles')) throw new Error("A redundant Dotfiles breadcrumb remains above a manual title");
if (portfolioHomeHtml.includes("Platform &amp; Site Reliability Engineer</p>")) throw new Error("Portfolio still repeats the role above its hero title");
if (docsHomeHtml.includes("Personal workstation · documented publicly")) throw new Error("Dotfiles still contains the redundant hero eyebrow");
if ((portfolioHomeHtml + portfolioHtml + blogHtml + docsHtml).includes('href="/#contact"')) throw new Error("A legacy Contact anchor still bypasses the dedicated Contact page");
for (const destination of [
  'href="mailto:ponomarov.aleksandr@gmail.com"',
  'href="https://www.linkedin.com/in/aleksandr-ponomarov"',
  'href="https://github.com/shmileee"',
]) {
  if (!contactHtml.includes(destination)) throw new Error(`Contact page is missing ${destination}`);
}
if (docsHtml.includes("View shmileee/dotfiles on GitHub")) throw new Error("Dotfiles still duplicates the GitHub link in its shared shell");
if (blogHomeHtml.includes("<span>#")) throw new Error("Notes topic labels still use hashtag prefixes");

const codeCssHref = blogHtml.match(/href="(\/_astro\/ec\.[^"]+\.css)"/)?.[1];
if (!codeCssHref) throw new Error("Expressive Code stylesheet is not linked");
const codeCssPath = join(dist, codeCssHref);
if (!existsSync(codeCssPath)) throw new Error(`Expressive Code stylesheet is missing: ${codeCssHref}`);
const codeCss = readFileSync(codeCssPath, "utf8");
if (!codeCss.includes("data-theme='light'") || !codeCss.includes("var(--1")) throw new Error("Shared light/dark syntax themes are incomplete");

/* The sitemap is the QA harness's route list, so it must name every
   canonical page: each study, post, topic and manual, plus the four hubs. */
const sitemap = readFileSync(join(dist, "sitemap.xml"), "utf8");
const sitemapPaths = [...sitemap.matchAll(/<loc>https:\/\/oponomarov\.com([^<]*)<\/loc>/g)].map((match) => match[1]);
const expectedSitemapPaths = [
  "/", "/blog/", "/dotfiles/", "/contact/",
  ...expectedCaseStudies.map((folder) => `/case-studies/${folder}/`),
  ...postPages.map((slug) => `/blog/posts/${slug}/`),
  ...expectedCategories.map((category) => `/blog/categories/${category}/`),
  ...expectedDocRoutes.map((slug) => `/dotfiles/${slug}/`),
];
const missingFromSitemap = expectedSitemapPaths.filter((path) => !sitemapPaths.includes(path));
if (missingFromSitemap.length > 0) throw new Error(`Sitemap is missing canonical routes: ${formatSet(missingFromSitemap)}`);
const strayInSitemap = sitemapPaths.filter((path) => !expectedSitemapPaths.includes(path));
if (strayInSitemap.length > 0) throw new Error(`Sitemap lists routes that are not canonical pages: ${formatSet(strayInSitemap)}`);

/* One Open Graph card per canonical page, at the path src/lib/og-path.ts
   derives from the page path, and every page (redirects and 404 included)
   points its og:image at a card that exists. */
const ogSlug = (path) => path.replace(/^\/|\/$/g, "").replace(/\//g, "-") || "home";
const expectedCards = expectedSitemapPaths.map((path) => `${ogSlug(path)}.png`).sort();
const builtCards = readdirSync(join(dist, "og")).sort();
const missingCards = expectedCards.filter((name) => !builtCards.includes(name));
if (missingCards.length > 0) throw new Error(`Open Graph cards missing for canonical pages: ${formatSet(missingCards)}`);
const strayCards = builtCards.filter((name) => !expectedCards.includes(name));
if (strayCards.length > 0) throw new Error(`Open Graph cards without a canonical page: ${formatSet(strayCards)}`);
for (const htmlPath of htmlFiles) {
  const html = readFileSync(htmlPath, "utf8");
  const route = relative(dist, htmlPath);
  const image = html.match(/<meta property="og:image" content="https:\/\/oponomarov\.com(\/og\/[^"]+\.png)"/)?.[1];
  if (!image) throw new Error(`${route} has no og:image under /og/`);
  if (!existsSync(join(dist, image))) throw new Error(`${route} points og:image at a card that was not built: ${image}`);
  if (!html.includes(`<meta name="twitter:image" content="https://oponomarov.com${image}"`)) throw new Error(`${route} twitter:image disagrees with og:image`);
  const canonicalHref = html.match(/<link rel="canonical" href="https:\/\/oponomarov\.com([^"]*)"/)?.[1];
  if (canonicalHref && sitemapPaths.includes(canonicalHref) && image !== `/og/${ogSlug(canonicalHref)}.png`) {
    throw new Error(`${route} carries the card of another page: ${image} for ${canonicalHref}`);
  }
}
for (const name of builtCards) {
  const header = readFileSync(join(dist, "og", name)).subarray(0, 24);
  if (header.toString("latin1", 1, 4) !== "PNG") throw new Error(`og/${name} is not a PNG`);
  if (header.readUInt32BE(16) !== 1200 || header.readUInt32BE(20) !== 630) throw new Error(`og/${name} is not 1200×630`);
}

console.log(`Verified one Astro build: ${canonicalCaseStudies.length} case studies, ${aliasRedirects.length + workRedirects.length + postRedirects.length} compatibility redirects, ${postPages.length} posts, ${categoryPages.length} categories, ${expectedDocSlugs.length} Dotfiles manuals, one shared Contact page, ${builtCards.length} Open Graph cards, RSS, global cross-product search, interactions, shared syntax themes, and all internal links/assets.`);
