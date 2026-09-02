import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { caseStudyCatalog } from "../lib/catalog";
import { uniqueCategories } from "../lib/categories.mjs";
import { slugForPost } from "../lib/posts";

export const GET: APIRoute = async () => {
  const posts = await getCollection("posts");
  const categorySlugs = uniqueCategories(posts.map((post) => post.data.categories));
  const urls = [
    "/",
    ...caseStudyCatalog.map(({ folder }) => `/case-studies/${folder}/`),
    "/blog/",
    ...posts.map((post) => `/blog/posts/${slugForPost(post)}/`),
    ...categorySlugs.map((category) => `/blog/categories/${category}/`),
    "/dotfiles/",
    "/dotfiles/setup/",
    "/dotfiles/shortcuts/",
    "/dotfiles/opencode/",
    "/contact/",
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((path) => `  <url><loc>https://oponomarov.com${path}</loc></url>`).join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
