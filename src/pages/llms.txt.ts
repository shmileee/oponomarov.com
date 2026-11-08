import type { APIRoute } from "astro";
import { markdownPages, type MarkdownPage } from "../lib/markdown-pages";
import { ownerName, pageDescriptions, sectionNames, sectionNotes, siteOrigin } from "../lib/site-metadata";

/* The site's index for language models, in the llms.txt format
   (https://llmstxt.org): who this is, then every article as a link to its
   Markdown copy with the description the page itself carries. Nothing in it
   is written by hand; it is the content collections, listed. */
export const GET: APIRoute = async () => {
  const pages = await markdownPages();
  const list = (section: MarkdownPage["section"]) =>
    pages.filter((page) => page.section === section).map((page) => `- [${page.title}](${siteOrigin}${page.markdownPath}): ${page.description}`).join("\n");

  const text = `# ${ownerName}

> ${pageDescriptions.home}

${sectionNotes.portfolio} ${sectionNotes.blog} ${sectionNotes.dotfiles}

Every link below is the plain-Markdown copy of a page; the HTML page is the same address without \`.md\`, with a trailing slash. All of it in one file: ${siteOrigin}/llms-full.txt

## Case studies

${list("portfolio")}

## ${sectionNames.blog}

${list("blog")}

## ${sectionNames.dotfiles}

${list("dotfiles")}

## Optional

- [Contact](${siteOrigin}/contact/): ${pageDescriptions.contact}
- [CV](https://cv.oponomarov.com/): ${ownerName}'s CV.
- [RSS feed](${siteOrigin}/blog/feed.xml): new engineering notes.
`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
