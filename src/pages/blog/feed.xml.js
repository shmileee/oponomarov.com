import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { plainText } from "../../lib/inline-markdown";
import { slugForPost, sortPosts } from "../../lib/posts";
import { pageDescriptions } from "../../lib/site-metadata";
import { topicLabel } from "../../lib/topic-labels";

/* The feed's channel points at the notes index, not the site root; it names
   itself (atom:link rel="self", which validators ask for) and its language;
   and categories carry their display names, as the site shows
   them. The item description is the note's dek, with any inline marks
   removed, since a reader shows it as text. */
export async function GET(context) {
  const posts = sortPosts(await getCollection("posts"));
  const self = new URL("/blog/feed.xml", context.site).href;
  return rss({
    title: "Engineering notes",
    description: pageDescriptions.blog,
    site: new URL("/blog/", context.site).href,
    xmlns: { atom: "http://www.w3.org/2005/Atom" },
    customData: `<language>en</language><atom:link href="${self}" rel="self" type="application/rss+xml"/>`,
    items: posts.map((post) => ({
      title: post.data.title,
      description: plainText(post.data.description),
      pubDate: post.data.date,
      link: new URL(`/blog/posts/${slugForPost(post)}/`, context.site).href,
      categories: post.data.categories.map(topicLabel),
    })),
  });
}
