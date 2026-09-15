import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { loadCaseStudies } from "../lib/case-studies";
import { uniqueCategories } from "../lib/categories.mjs";
import { loadDocs } from "../lib/docs";
import { slugForPost } from "../lib/posts";

/* Every canonical route, derived from the three content collections. Alias
   redirects and /work/ compatibility pages are deliberately absent: they carry
   noindex and point here. scripts/qa/measure.mjs reads this file for its
   route list, so a page missing here is also a page the QA never renders. */
export const GET: APIRoute = async () => {
  const studies = await loadCaseStudies();
  const posts = await getCollection("posts");
  const docs = await loadDocs();
  const categorySlugs = uniqueCategories(posts.map((post) => post.data.categories));
  const urls = [
    "/",
    ...studies.map((study) => study.href),
    "/blog/",
    ...posts.map((post) => `/blog/posts/${slugForPost(post)}/`),
    ...categorySlugs.map((category) => `/blog/categories/${category}/`),
    ...docs.map((page) => page.href),
    "/contact/",
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((path) => `  <url><loc>https://oponomarov.com${path}</loc></url>`).join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
