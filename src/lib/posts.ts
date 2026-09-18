import type { CollectionEntry } from "astro:content";
import { postRoutes as routesFor, slugForPostId } from "./post-routes.mjs";

export const slugForPost = (post: CollectionEntry<"posts">) => slugForPostId(post.id);

export const sortPosts = (posts: CollectionEntry<"posts">[]) => posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

export interface PostRoute {
  readonly slug: string;
  readonly post: CollectionEntry<"posts">;
  /** True for an old slug (an `aliases` entry) that redirects to the canonical one. */
  readonly redirect: boolean;
}

/** Canonical route per post plus a redirect route per alias; see post-routes.mjs. */
export const postRoutes = (posts: readonly CollectionEntry<"posts">[]): PostRoute[] => routesFor(posts);

export { formatDate } from "./dates";
