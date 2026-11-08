/**
 * Addresses from the sites this one replaced that are still requested, and
 * the page each now lives at. A renamed note, study or topic carries its old
 * slug in its own frontmatter (or categories.mjs); this map is for what has
 * no entry to carry it: manuals the Dotfiles site retired, the old docs
 * site's /features/ pages, and the blog's About page.
 *
 * Every target must be a canonical page: src/pages/[...legacy].astro fails
 * the build on one that is not, and scripts/verify-build.mjs checks each
 * redirect was built. The subdomains (blog., dotfiles., portfolio.) are
 * redirected by Cloudflare before a request reaches these pages.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const legacyRedirects = Object.freeze({
  "/blog/about/": "/contact/",
  "/dotfiles/hotkeys/": "/dotfiles/shortcuts/",
  "/dotfiles/what-how-and-why/": "/dotfiles/",
  "/features/Hotkeys/": "/dotfiles/shortcuts/",
  "/features/Installation/": "/dotfiles/setup/",
  "/features/Tools/": "/dotfiles/",
  "/features/1-UsageGuide/": "/dotfiles/",
});
