import type { APIRoute, GetStaticPaths } from "astro";
import { markdownPages, renderMarkdownPage, type MarkdownPage } from "../lib/markdown-pages";

/* A plain-Markdown copy beside every article: /blog/posts/x/ is also
   /blog/posts/x.md (src/lib/markdown-pages.ts). The page links it as
   rel="alternate" type="text/markdown", and /llms.txt lists them all. */
export const getStaticPaths = (async () => {
  const pages = await markdownPages();
  return pages.map((page) => ({ params: { page: page.markdownPath.replace(/^\/|\.md$/g, "") }, props: { page } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ page: MarkdownPage }> = ({ props }) =>
  new Response(renderMarkdownPage(props.page), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
