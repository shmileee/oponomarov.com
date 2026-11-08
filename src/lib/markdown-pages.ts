import { getCollection } from "astro:content";
import { formatCaseNumber, loadCaseStudies } from "./case-studies";
import { loadDocs } from "./docs";
import { plainText } from "./inline-markdown";
import { formatDate, slugForPost, sortPosts } from "./posts";
import { ownerName, siteOrigin, type SiteSection } from "./site-metadata";

/**
 * Every article on the site as plain Markdown: each case study, note and
 * manual, read straight from the content collections. An assistant that
 * fetches a page to answer a question gets the text and the code without the
 * navigation, the search dialog and the scripts around it.
 *
 * Three outputs read this one list: a `.md` copy beside every article
 * (src/pages/[...page].md.ts), the index at /llms.txt, and everything in one
 * file at /llms-full.txt. A new article appears in all three the moment its
 * file exists, like everywhere else on the site.
 */
export interface MarkdownPage {
  readonly section: Exclude<SiteSection, "contact">;
  /** The canonical HTML page, `/blog/posts/x/`. */
  readonly href: string;
  /** Its Markdown copy, `/blog/posts/x.md`. */
  readonly markdownPath: string;
  readonly title: string;
  readonly description: string;
  /** One line under the title: what the document is and, for a note, when. */
  readonly byline: string;
  readonly body: string;
}

/** "/blog/posts/x/" -> "/blog/posts/x.md", "/dotfiles/" -> "/dotfiles.md". */
export const markdownPathFor = (href: string) => `${href.replace(/\/$/, "")}.md`;

let cached: Promise<MarkdownPage[]> | undefined;

export function markdownPages(): Promise<MarkdownPage[]> {
  cached ??= (async () => {
    const pages: MarkdownPage[] = [];
    for (const study of await loadCaseStudies()) {
      const { data } = study.entry;
      pages.push({
        section: "portfolio",
        href: study.href,
        markdownPath: markdownPathFor(study.href),
        title: data.title,
        description: plainText(data.description ?? data.summary),
        byline: [`Case study ${formatCaseNumber(study.number)} by ${ownerName}`, data.period, data.role && `Role: ${plainText(data.role)}`].filter(Boolean).join(" · "),
        body: study.entry.body ?? "",
      });
    }
    for (const post of sortPosts(await getCollection("posts"))) {
      const href = `/blog/posts/${slugForPost(post)}/`;
      pages.push({
        section: "blog",
        href,
        markdownPath: markdownPathFor(href),
        title: post.data.title,
        description: plainText(post.data.description),
        byline: `Engineering note by ${ownerName} · ${formatDate(post.data.date, "display")} · Topics: ${post.data.categories.join(", ")}`,
        body: post.body ?? "",
      });
    }
    for (const page of await loadDocs()) {
      pages.push({
        section: "dotfiles",
        href: page.href,
        markdownPath: markdownPathFor(page.href),
        title: page.title,
        description: plainText(page.entry.data.description),
        byline: `Dotfiles manual by ${ownerName}`,
        body: page.entry.body ?? "",
      });
    }
    return pages;
  })();
  return cached;
}

/** One page as a standalone Markdown document: title, summary, provenance,
    then the body exactly as authored. */
export const renderMarkdownPage = (page: MarkdownPage) =>
  `# ${page.title}\n\n> ${page.description}\n\n${page.byline}\nCanonical: ${siteOrigin}${page.href}\n\n${page.body.trim()}\n`;
