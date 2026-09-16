import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Every image in a body loads well: sized, so nothing moves when it arrives;
 * in a rendition the column can use, so a 1654px screenshot is not sent to a
 * 320px phone; asynchronously decoded; and lazily, except the first, which
 * is the likeliest first-screen image.
 *
 * Dimensions and renditions come from the manifest scripts/sync-content.mjs
 * writes when it copies the content repositories' assets into public/
 * (src/lib/generated/image-manifest.json): the file's width and height and
 * the WebP renditions it produced. An author writes `![alt](/blog-static/x.png)`
 * or a plain <img> in a figure and gets width, height, srcset and sizes; an
 * attribute already written wins. The original stays as src, the fallback
 * and the lightbox's full-size view. An image the manifest does not know
 * (an external URL) is left as written, apart from decoding and loading.
 *
 * Two shapes occur. A Markdown image (`![alt](src)`) arrives as an <img>
 * element. An authored figure (`<figure class="media-figure"><img …>`) arrives
 * as Astro leaves block HTML: an opaque `raw` node holding the tag as text, so
 * it is rewritten as text, with the same decisions, rather than parsed into
 * an element tree whose text is text, not raw HTML.
 */
const IMG_TAG = /<img\b([^>]*?)(\s*\/?)>/gi;
const MANIFEST_PATH = fileURLToPath(new URL("./generated/image-manifest.json", import.meta.url));

/* The widths an article image is drawn at: the reading measure from 80rem,
   the wide track between 64rem and 80rem, the column less the gutters below. */
export const ARTICLE_SIZES = "(min-width: 80rem) 736px, (min-width: 64rem) 928px, calc(100vw - 2.5rem)";

/** @returns {Record<string, { width: number, height: number, variants: { src: string, width: number }[] }>} */
export const readManifest = () => (existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) : {});

const attribute = (attributes, name) => new RegExp(`\\s${name}=("[^"]*"|'[^']*'|[^\\s>]+)`, "i").exec(attributes)?.[1]?.replace(/^["']|["']$/g, "");

export default function rehypeImages({ manifest = readManifest() } = {}) {
  const srcset = (entry) => entry.variants.map((variant) => `${variant.src} ${variant.width}w`).join(", ");
  /** @param {import("hast").Root} tree */
  return (tree) => {
    let seen = 0;
    const decorate = (attributes) => {
      seen += 1;
      let out = attributes;
      if (!/\sdecoding=/i.test(out)) out += ' decoding="async"';
      if (seen > 1 && !/\sloading=/i.test(out)) out += ' loading="lazy"';
      const entry = manifest[attribute(out, "src") ?? ""];
      if (entry) {
        if (!/\swidth=/i.test(out)) out += ` width="${entry.width}"`;
        if (!/\sheight=/i.test(out)) out += ` height="${entry.height}"`;
        if (!/\ssrcset=/i.test(out) && entry.variants.length) out += ` srcset="${srcset(entry)}"`;
        if (!/\ssizes=/i.test(out) && entry.variants.length) out += ` sizes="${ARTICLE_SIZES}"`;
      }
      return out;
    };
    /** @param {import("hast").Parents} parent */
    const walk = (parent) => {
      for (const node of parent.children) {
        if (node.type === "raw" && /<img\b/i.test(node.value)) {
          node.value = node.value.replace(IMG_TAG, (tag, attributes, close) => `<img${decorate(attributes)}${close}>`);
          continue;
        }
        if (node.type !== "element") continue;
        if (node.tagName === "img") {
          seen += 1;
          node.properties.decoding ??= "async";
          if (seen > 1) node.properties.loading ??= "lazy";
          const entry = manifest[String(node.properties.src ?? "")];
          if (entry) {
            node.properties.width ??= entry.width;
            node.properties.height ??= entry.height;
            if (entry.variants.length) {
              node.properties.srcSet ??= srcset(entry);
              node.properties.sizes ??= ARTICLE_SIZES;
            }
          }
        }
        if ("children" in node) walk(node);
      }
    };
    walk(tree);
  };
}
