import { getCollection, type CollectionEntry } from "astro:content";

/**
 * The Dotfiles manual sequence, derived from the docs collection: the
 * overview (`index.md`) first, then every other manual by its `order`
 * frontmatter, then any unnumbered manual alphabetically by title. Adjacent
 * navigation reads the sequence, so a new manual is reachable from its
 * neighbours the moment its file exists.
 */
export interface DocsPage {
  readonly entry: CollectionEntry<"docs">;
  /** "" for the overview, otherwise the file name without .md. */
  readonly slug: string;
  readonly href: string;
  readonly title: string;
}

export const docsSlug = (entry: CollectionEntry<"docs">) => entry.id.replace(/\.md$/, "").replace(/^index$/, "");

export const docsHref = (slug: string) => slug ? `/dotfiles/${slug}/` : "/dotfiles/";

const compareDocs = (a: CollectionEntry<"docs">, b: CollectionEntry<"docs">) => {
  const overviewA = docsSlug(a) === "" ? 0 : 1;
  const overviewB = docsSlug(b) === "" ? 0 : 1;
  if (overviewA !== overviewB) return overviewA - overviewB;
  const orderA = a.data.order ?? Number.POSITIVE_INFINITY;
  const orderB = b.data.order ?? Number.POSITIVE_INFINITY;
  if (orderA !== orderB) return orderA - orderB;
  return a.data.title.localeCompare(b.data.title, "en");
};

let cached: Promise<DocsPage[]> | undefined;

export function loadDocs(): Promise<DocsPage[]> {
  cached ??= (async () => {
    const entries = (await getCollection("docs")).sort(compareDocs);
    if (!entries.some((entry) => docsSlug(entry) === "")) {
      throw new Error("The docs collection has no index.md: the Dotfiles overview page needs one.");
    }
    return entries.map((entry) => ({ entry, slug: docsSlug(entry), href: docsHref(docsSlug(entry)), title: entry.data.title }));
  })();
  return cached;
}

/** Neighbours in the manual sequence; undefined at either end. */
export const adjacentDocs = (pages: readonly DocsPage[], page: DocsPage) => {
  const index = pages.indexOf(page);
  return { previous: index > 0 ? pages[index - 1] : undefined, next: index < pages.length - 1 ? pages[index + 1] : undefined };
};
