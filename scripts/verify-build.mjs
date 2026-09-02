import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPostCategories, uniqueCategories } from "../src/lib/categories.mjs";

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
  "dist/assets/css/site.css",
  "dist/assets/js/site.js",
  "dist/assets/fonts/bricolage-grotesque-latin.woff2",
  "dist/favicon.svg",
  "dist/favicon-32x32.png",
  "dist/apple-touch-icon.png",
  "dist/site.webmanifest",
  "dist/pagefind/pagefind.js",
  "dist/contact/index.html",
  "dist/blog/index.html",
  "dist/blog/feed.xml",
  "dist/blog-assets/css/main.css",
  "dist/blog-assets/css/syntax.css",
  "dist/blog-assets/js/site.js",
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
  if (!title?.startsWith("Oleksandr Ponomarov - ")) throw new Error(`${route} has an inconsistent document title: ${title || "missing"}`);
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
const canonicalCaseStudies = caseStudies.filter((name) => !/^\d+-/.test(name));
const numberedRedirects = caseStudies.filter((name) => /^\d+-/.test(name));
const workRedirects = routeDirectories(join(dist, "work"));
const postPages = routeDirectories(join(dist, "blog/posts"));
const categoryPages = routeDirectories(join(dist, "blog/categories"));

const formatSet = (values) => (values.length > 0 ? values.join(", ") : "(none)");
const expectedCaseStudies = filesBelow(join(portfolioRoot, "content/case-studies")).filter((path) => basename(path) === "index.md").length;
const catalogSource = readFileSync(join(root, "src/lib/catalog.ts"), "utf8");
const catalogBlock = catalogSource.match(/const definitions = \[([\s\S]*?)\] as const;/)?.[1];
if (!catalogBlock) throw new Error("Could not locate the case-study definitions block in src/lib/catalog.ts");
const expectedRedirects = (catalogBlock.match(/^\s*\[/gm) ?? []).length;
const postsSourceDir = join(blogRoot, "content/posts");
const expectedPosts = readdirSync(postsSourceDir).filter((name) => name.endsWith(".md")).length;
const expectedCategories = uniqueCategories(readPostCategories(postsSourceDir));

if (canonicalCaseStudies.length !== expectedCaseStudies) throw new Error(`Expected ${expectedCaseStudies} canonical case-study routes (index.md files under ${relative(root, join(portfolioRoot, "content/case-studies"))}), found ${canonicalCaseStudies.length}`);
if (numberedRedirects.length !== expectedRedirects) throw new Error(`Expected ${expectedRedirects} numbered case-study redirects (catalog entries in src/lib/catalog.ts), found ${numberedRedirects.length}`);
if (workRedirects.length !== expectedRedirects) throw new Error(`Expected ${expectedRedirects} /work compatibility redirects (catalog entries in src/lib/catalog.ts), found ${workRedirects.length}`);
if (postPages.length !== expectedPosts) throw new Error(`Expected ${expectedPosts} blog routes (*.md posts under ${relative(root, postsSourceDir)}), found ${postPages.length}`);
const builtCategories = [...categoryPages].sort();
if (builtCategories.join("\n") !== expectedCategories.join("\n")) throw new Error(`Built blog category pages diverge from post frontmatter categories.\nExpected: ${formatSet(expectedCategories)}\nActual:   ${formatSet(builtCategories)}`);

const docsSourceDir = join(dotfilesRoot, "docs/content");
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

const namedPortfolioCodeFrames = [
  "composition.yaml",
  "images/cloudwatch-exporter/image.yaml",
  "mise.toml",
  "opencode.jsonc",
  "team.json",
  "topics/orders-events.yaml",
  "versions.tf",
];
for (const filename of namedPortfolioCodeFrames) {
  const title = `<span class="title">${filename}</span>`;
  const occurrences = portfolioHtml.split(title).length - 1;
  if (occurrences !== 1) throw new Error(`Expected one portfolio code frame titled ${filename}, found ${occurrences}`);
}
if (portfolioHtml.includes('class="code-exhibit"')) throw new Error("A legacy portfolio code wrapper would create a nested code frame");
if (!portfolioHtml.includes("diagram-exhibit") || !portfolioHtml.includes("media-exhibit")) throw new Error("Portfolio media exhibits were not fully migrated");
if (/>THE (?:SITUATION|INTERESTING PART)<|>WHAT (?:I DID|IT CHANGED)</.test(portfolioHtml)) throw new Error("Case-study section headings were not normalized to sentence case");
if (!portfolioHomeHtml.includes("oponomarov:content-updated") || !portfolioHomeHtml.includes("unifiedCopyBound")) throw new Error("The portfolio reader cannot enhance dynamically loaded code frames");
const readerScript = readFileSync(join(dist, "assets/js/reader.js"), "utf8");
if (!readerScript.includes('new CustomEvent("oponomarov:content-updated"') || !readerScript.includes("closeButton.focus()")) throw new Error("The portfolio reader is missing dynamic enhancement or initial focus management");
const siteCss = readFileSync(join(dist, "assets/css/site.css"), "utf8");
const inlineCodeRule = siteCss.match(/\.prose :not\(pre\) > code \{([^}]*)\}/)?.[1] ?? "";
if (!inlineCodeRule.includes("display: inline-block;") || !inlineCodeRule.includes("width: max-content;") || !inlineCodeRule.includes("max-width: 100%;") || !inlineCodeRule.includes("overflow-wrap: anywhere;") || !inlineCodeRule.includes("vertical-align: baseline;") || inlineCodeRule.includes("overflow-x: auto;")) throw new Error("Inline code can fragment, misalign with body text, reserve a scrollbar gutter, or overflow its reading column");
if (/\{%|\{\{\s*['"]\//.test(blogHtml)) throw new Error("Unconverted Jekyll syntax remains in blog output");
if (!blogHtml.includes("comments-region") || !blogHtml.includes("data-article-toc")) throw new Error("Blog article interactions are missing");
if (!docsHtml.includes("data-shortcut-status") || !docsHtml.includes("context-help")) throw new Error("Dotfiles interactions are missing");
if (!docsHtml.includes("Bootstrap before using tasks") || !docsHtml.includes("OpenCode + OmO")) throw new Error("Full Dotfiles manuals were not migrated");
const admonitionHtml = blogHtml + docsHtml;
const admonitionCount = admonitionHtml.split('class="op-admonition ').length - 1;
if (admonitionCount !== 8) throw new Error(`Expected 8 native Astro admonitions, found ${admonitionCount}`);
for (const variant of ["note", "tip", "important", "warning"]) {
  if (!admonitionHtml.includes(`data-admonition="${variant}"`)) throw new Error(`Built content is missing the ${variant} admonition variant`);
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

const sitemap = readFileSync(join(dist, "sitemap.xml"), "utf8");
for (const path of ["/blog/", "/dotfiles/", "/dotfiles/setup/", "/case-studies/", "/contact/"]) {
  if (!sitemap.includes(path)) throw new Error(`Sitemap is missing ${path}`);
}
const sitemapCategories = [...sitemap.matchAll(/<loc>https:\/\/oponomarov\.com\/blog\/categories\/([^<]+)\/<\/loc>/g)]
  .map((match) => match[1])
  .sort();
if (sitemapCategories.join("\n") !== expectedCategories.join("\n")) throw new Error(`Sitemap /blog/categories/ URLs diverge from post frontmatter categories.\nExpected: ${formatSet(expectedCategories)}\nActual:   ${formatSet(sitemapCategories)}`);

console.log(`Verified one Astro build: ${canonicalCaseStudies.length} case studies, ${numberedRedirects.length + workRedirects.length} compatibility redirects, ${postPages.length} posts, ${categoryPages.length} categories, ${expectedDocSlugs.length} Dotfiles manuals, one shared Contact page, RSS, global cross-product search, interactions, shared syntax themes, and all internal links/assets.`);
