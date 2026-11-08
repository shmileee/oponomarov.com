import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { loadCaseStudies } from "../lib/case-studies";
import { uniqueCategories } from "../lib/categories.mjs";
import { loadDocs } from "../lib/docs";
import { slugForPost, sortPosts } from "../lib/posts";

/* Every canonical route, derived from the three content collections. Alias
   redirects and /work/ compatibility pages are deliberately absent: they carry
   noindex and point here. scripts/qa/measure.mjs reads this file for its
   route list, so a page missing here is also a page the QA never renders. */
/* A note is the only page with a date of its own, so it is the only page
   with a <lastmod>: the note's date, and on /blog/ and each topic page the
   newest note filed there. Studies and manuals carry no date in their
   content, and a made-up one teaches a crawler to ignore the field
   site-wide; they are listed without it. */
const day = (date: Date) => date.toISOString().slice(0, 10);

export const GET: APIRoute = async () => {
  const studies = await loadCaseStudies();
  const posts = sortPosts(await getCollection("posts"));
  const docs = await loadDocs();
  const categorySlugs = uniqueCategories(posts.map((post) => post.data.categories));
  const newest = (filed: typeof posts) => (filed[0] ? day(filed[0].data.date) : undefined);
  const urls: [path: string, lastmod?: string][] = [
    ["/"],
    ...studies.map((study): [string] => [study.href]),
    ["/blog/", newest(posts)],
    ...posts.map((post): [string, string] => [`/blog/posts/${slugForPost(post)}/`, day(post.data.date)]),
    ...categorySlugs.map((category): [string, string | undefined] => [`/blog/categories/${category}/`, newest(posts.filter((post) => post.data.categories.includes(category)))]),
    ...docs.map((page): [string] => [page.href]),
    ["/contact/"],
  ];
  const entry = ([path, lastmod]: [string, string?]) => `  <url><loc>https://oponomarov.com${path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(entry).join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
