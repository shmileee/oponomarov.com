export const STUDY_HASH = /^#study-([a-z0-9-]+)$/;

/* The manifest src/pages/index.astro embeds: one entry per study, `id` being
   its content folder and `aliases` the old slugs and reader ids the content
   still answers to. `#study-<id>`, `#study-<alias>` and the bare legacy
   number (`#study-12`, the digits an old numbered slug started with) all
   resolve to the same entry, so links shared before a rename keep opening
   the study they named. */
export function createManifestIndex(manifestNode) {
  const entries = JSON.parse(manifestNode.textContent || "[]");
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const byAlias = new Map();
  for (const entry of entries) {
    for (const alias of entry.aliases ?? []) {
      byAlias.set(alias, entry);
      const legacyNumber = /^\d+-/.test(alias) ? String(Number.parseInt(alias, 10)) : undefined;
      if (legacyNumber && !byAlias.has(legacyNumber)) byAlias.set(legacyNumber, entry);
    }
  }
  return {
    entries,
    ids: entries.map(({ id }) => id),
    byId,
    byAlias,
    byPath: new Map(
      entries.map((entry) => [new URL(entry.url, window.location.origin).pathname, entry]),
    ),
  };
}

/* Expressive Code's hashed assets: `/_astro/ec.<hash>.css` and `.js`. */
const CODE_ASSET = /\/ec\.[^/]+\.(?:css|js)$/;

const isCodeAsset = (value) => {
  if (!value) return false;
  try {
    return CODE_ASSET.test(new URL(value, window.location.origin).pathname);
  } catch {
    return false;
  }
};

function normalizeProse(prose, responseUrl) {
  /* The code assets travel inside the prose (see adoptCodeAssets). Drop them
     from the injected copy: the <link> would load the sheet a second time and
     the <script> would sit in the DOM inert. */
  for (const asset of prose.querySelectorAll('link[rel="stylesheet"][href], script[src]')) {
    if (isCodeAsset(asset.getAttribute("href") ?? asset.getAttribute("src"))) asset.remove();
  }
  for (const element of prose.querySelectorAll("[src], [poster], [href]")) {
    for (const attribute of ["src", "poster", "href"]) {
      const value = element.getAttribute(attribute);
      if (value?.trim()) element.setAttribute(attribute, new URL(value, responseUrl).href);
    }
  }
  for (const heading of prose.querySelectorAll("h2")) {
    const replacement = prose.ownerDocument.createElement("h3");
    for (const attribute of heading.attributes) replacement.setAttribute(attribute.name, attribute.value);
    replacement.append(...heading.childNodes);
    heading.replaceWith(replacement);
  }
  return prose.innerHTML;
}

/* Expressive Code emits its hashed stylesheet and its script module inline,
   beside the first code block of any page that has one. The homepage has
   none, so a study pulled into the reader arrives carrying both. Injected via
   innerHTML, the <link> loads but the <script> never runs (scripts inserted
   that way are inert by spec), which left the copy button with no click
   handler: nothing reached the clipboard and no "Copied!" tooltip was ever
   created. Adopt both into <head> the first time each is seen. The module
   binds every copy button already in the document and watches <body> for new
   ones, so it does not matter whether it lands before or after the study. */
function adoptCodeAssets(source) {
  for (const node of source.querySelectorAll('link[rel="stylesheet"][href], script[src]')) {
    const attribute = node.localName === "link" ? "href" : "src";
    const value = node.getAttribute(attribute);
    if (!isCodeAsset(value)) continue;
    const absolute = new URL(value, window.location.origin).href;
    if (document.head.querySelector(`${node.localName}[${attribute}="${CSS.escape(absolute)}"]`)) continue;
    const adopted = document.createElement(node.localName);
    if (node.localName === "link") adopted.rel = "stylesheet";
    else adopted.type = "module";
    adopted.setAttribute(attribute, absolute);
    document.head.append(adopted);
  }
}

export function createContentLoader() {
  const cache = new Map();
  return (entry) => {
    const cached = cache.get(entry.id);
    if (cached) return cached;

    const pending = fetch(entry.url).then(async (response) => {
      if (!response.ok) throw new Error(`Study request failed with ${response.status}`);
      const source = new DOMParser().parseFromString(await response.text(), "text/html");
      /* ArticleShell marks the rendered Markdown body; the class is a fallback
         for any page not yet on the shared shell. */
      const prose = source.querySelector("[data-article-body]") ?? source.querySelector(".prose");
      if (!prose) throw new Error("Study response has no canonical prose");
      adoptCodeAssets(source);
      return normalizeProse(prose, response.url);
    });
    cache.set(entry.id, pending);
    pending.catch(() => {
      if (cache.get(entry.id) === pending) cache.delete(entry.id);
    });
    return pending;
  };
}

export function isPrimarySameTab(event, anchor) {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !anchor.hasAttribute("target") &&
    !anchor.hasAttribute("download")
  );
}

export function isReaderState(state) {
  return state?.portfolioReader === true && typeof state.id === "string";
}
