import type { APIRoute } from "astro";
import { markdownPages, renderMarkdownPage } from "../lib/markdown-pages";
import { ownerName, pageDescriptions } from "../lib/site-metadata";

/* Every article on the site in one Markdown file, in the order /llms.txt
   lists them, for a model that would rather read the whole site at once
   than follow the links. */
export const GET: APIRoute = async () => {
  const pages = await markdownPages();
  const text = [`# ${ownerName}\n\n> ${pageDescriptions.home}\n`, ...pages.map(renderMarkdownPage)].join("\n---\n\n");
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
