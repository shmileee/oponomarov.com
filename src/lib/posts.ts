import type { CollectionEntry } from "astro:content";

export const slugForPost = (post: CollectionEntry<"posts">) => post.id.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");

export const sortPosts = (posts: CollectionEntry<"posts">[]) => posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

export const formatDate = (date: Date, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }) =>
  new Intl.DateTimeFormat("en-GB", options).format(date);
