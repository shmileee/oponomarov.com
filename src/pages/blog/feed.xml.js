import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { slugForPost, sortPosts } from "../../lib/posts";

export async function GET(context) {
  const posts = sortPosts(await getCollection("posts"));
  return rss({
    title: "Engineering notes",
    description: "A home for poorly researched ideas that I find myself repeating a lot anyway.",
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/blog/posts/${slugForPost(post)}/`,
      categories: post.data.categories,
    })),
  });
}
