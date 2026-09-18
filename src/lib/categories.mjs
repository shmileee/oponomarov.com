import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

/**
 * Flatten category entries (each a string or an array of strings) into a
 * unique, sorted list. Mirrors the posts collection schema, which normalizes
 * `categories: string | string[]` to `string[]`.
 *
 * @param {ReadonlyArray<string | ReadonlyArray<string>>} lists
 * @returns {string[]}
 */
export const uniqueCategories = (lists) =>
  [...new Set(lists.flatMap((entry) => (typeof entry === "string" ? [entry] : [...entry])))].sort();

/**
 * Read the `categories` frontmatter of every `*.md` post in a directory,
 * normalized exactly like the posts collection schema (string → [string]).
 *
 * @param {string} dirPath
 * @returns {string[][]}
 */
export const readPostCategories = (dirPath) =>
  readdirSync(dirPath)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      const path = join(dirPath, name);
      const frontmatter = readFileSync(path, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
      if (frontmatter === undefined) throw new Error(`${path} has no leading --- frontmatter block`);
      const data = yaml.load(frontmatter);
      const categories = data && typeof data === "object" ? data.categories : undefined;
      if (typeof categories === "string") return [categories];
      if (Array.isArray(categories) && categories.every((category) => typeof category === "string")) return categories;
      throw new Error(`${path} frontmatter must declare categories as a string or an array of strings`);
    });

/**
 * Old category slugs and the slug each now lives at. A renamed category
 * keeps its URL working: the categories page renders a redirect for every
 * alias whose old slug no longer names a live category and whose new slug
 * does. An alias that does not yet apply — the content repository has not
 * renamed the category, or has not been deployed with the rename — is
 * skipped, so the engine builds against any content revision and the
 * redirect appears the moment the content catches up.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const categoryAliases = Object.freeze({
  "developer-tools": "devex",
});

/**
 * The alias routes that apply to a set of live categories: [oldSlug,
 * newSlug] pairs whose old slug is not itself live and whose new slug is.
 *
 * @param {readonly string[]} categories
 * @param {Readonly<Record<string, string>>} [aliases]
 * @returns {[string, string][]}
 */
export const categoryRedirects = (categories, aliases = categoryAliases) =>
  Object.entries(aliases).filter(([from, to]) => !categories.includes(from) && categories.includes(to));
