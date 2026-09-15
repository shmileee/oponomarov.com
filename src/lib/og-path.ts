/**
 * Where a page's Open Graph card lives. Kept apart from og.ts so the layout
 * can import the path without pulling the renderer (satori, sharp, the
 * content collections) into every page's module graph.
 */

/** The card slug for a canonical page path: "/" -> "home", "/blog/posts/x/" -> "blog-posts-x". */
export const ogSlug = (pathname: string) => {
  const slug = pathname.replace(/^\/|\/$/g, "").replace(/\//g, "-");
  return slug || "home";
};

/** "/blog/posts/x/" -> "/og/blog-posts-x.png" */
export const ogImagePath = (pathname: string) => `/og/${ogSlug(pathname)}.png`;
