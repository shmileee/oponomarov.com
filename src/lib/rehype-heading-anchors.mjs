import { rehypeHeadingIds } from "@astrojs/markdown-remark";

/**
 * A section link on every article heading. Astro gives each heading an id
 * and the table of contents links to it, but the heading itself offered no
 * way to copy that address: readers who wanted to send someone to "Step 3"
 * had to find it in the TOC. Each h2–h4 now ends with an empty
 * <a class="heading-anchor" href="#id"> carrying the heading's text as its
 * accessible name; prose.css draws the "#" and shows it on hover or focus
 * (and not at all where nothing can hover). The link is empty so it adds
 * nothing to the TOC text, to search excerpts or to the heading's own
 * accessible name.
 *
 * Astro assigns the ids after the configured rehype plugins have run, so
 * this plugin runs Astro's own rehypeHeadingIds first: the same slugger,
 * the same ids, and Astro's later pass keeps an id that is already there.
 *
 * Only article bodies take it. The homepage renders the portfolio's hero,
 * arc and principle copy through the same pipeline, and a section link
 * inside a hero paragraph or a card would point at nothing a reader means
 * to share, so those collections are left alone by their source path.
 *
 * The heading's own content is wrapped in one <span class="heading-text">
 * first. The portfolio's numbered section headings are flex rows (the
 * counter, the text, the hairline), and a flex row lays out every child
 * separately: a heading that held words and a code span came out as two
 * columns, the words squeezed beside a tall capsule. Wrapped, the text is
 * one flex item and wraps like a paragraph, whatever inline markup it holds.
 */
const ENGINE_COPY = /[\\/]content[\\/](home|arc|principles)[\\/]/;
const HEADINGS = new Set(["h2", "h3", "h4"]);

const textOf = (node) => {
  if (node.type === "text") return node.value;
  if (node.type === "element" && node.tagName === "code") return node.children.map(textOf).join("");
  return (node.children ?? []).map(textOf).join("");
};

export default function rehypeHeadingAnchors() {
  const assignIds = rehypeHeadingIds();
  /** @param {import("hast").Root} tree @param {import("vfile").VFile} file */
  return (tree, file) => {
    const path = file?.path ?? file?.history?.[0] ?? "";
    if (ENGINE_COPY.test(path)) return;
    assignIds(tree, file);
    /** @param {import("hast").Parents} parent */
    const walk = (parent) => {
      for (const node of parent.children) {
        if (node.type !== "element") continue;
        if (HEADINGS.has(node.tagName) && typeof node.properties?.id === "string" && node.properties.id) {
          if (node.children.some((child) => child.type === "element" && child.properties?.className?.includes?.("heading-anchor"))) continue;
          const label = textOf(node).replace(/\s+/g, " ").trim();
          node.children = [
            { type: "element", tagName: "span", properties: { className: ["heading-text"] }, children: node.children },
            {
              type: "element",
              tagName: "a",
              properties: { className: ["heading-anchor"], href: `#${node.properties.id}`, ariaLabel: `Link to “${label}”` },
              children: [],
            },
          ];
          continue;
        }
        if (node.tagName !== "pre" && "children" in node) walk(node);
      }
    };
    walk(tree);
  };
}
