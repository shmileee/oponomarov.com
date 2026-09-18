/**
 * A post's slug is its file name without the leading date and extension:
 * `2024-12-15-mise-faster-smarter-tool-versioning.md` is served at
 * `/blog/posts/mise-faster-smarter-tool-versioning/`.
 *
 * @param {string} id the collection entry id (the file name)
 * @returns {string}
 */
export const slugForPostId = (id) => id.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");

/**
 * One route per post plus one per alias it declares, checked for collisions:
 * an alias that is also a post's slug, or one claimed by two posts, would
 * make one URL point two ways, so it fails the build naming both owners
 * rather than letting whichever route came later win.
 *
 * @template {{ id: string, data: { aliases?: readonly string[] } }} P
 * @param {readonly P[]} posts
 * @returns {{ slug: string, post: P, redirect: boolean }[]}
 */
export const postRoutes = (posts) => {
  /** @type {Map<string, string>} */
  const owners = new Map();
  const claim = (slug, owner) => {
    const claimed = owners.get(slug);
    if (claimed && claimed !== owner) throw new Error(`Post route "${slug}" is claimed by both ${claimed} and ${owner}.`);
    owners.set(slug, owner);
  };
  for (const post of posts) claim(slugForPostId(post.id), post.id);
  const routes = [];
  for (const post of posts) {
    const slug = slugForPostId(post.id);
    routes.push({ slug, post, redirect: false });
    for (const alias of post.data.aliases ?? []) {
      if (alias === slug) continue;
      claim(alias, post.id);
      routes.push({ slug: alias, post, redirect: true });
    }
  }
  return routes;
};
