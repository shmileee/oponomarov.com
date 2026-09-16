/**
 * A link whose whole content is one code span - `terraform apply` linked to
 * its docs, a path token linked to the file - is drawn as a capsule with a
 * solid accent edge and no underline (prose.css). A link that merely
 * *contains* a code span ("the official `Application` specification
 * reference") is running text: its words need the underline, or they are
 * told apart from the sentence by colour alone (WCAG 1.4.1; axe
 * link-in-text-block found one at 1.98:1). CSS cannot see text nodes, so
 * `a:has(> code)` matched both. This marks the token-only shape at build
 * time as `data-token-link`, and prose.css keys the capsule treatment to
 * the mark.
 *
 * Token-only means: one <code> element, optionally followed by one <span>
 * (the content's `<span aria-hidden>↗</span>` external arrow), and nothing
 * else but whitespace.
 *
 * Three shapes reach this plugin. A Markdown link (`[\`x\`](url)`) is an
 * element tree. Authored block HTML (a card with a path link) is one `raw`
 * node holding the markup as text. Authored inline HTML in a paragraph or
 * list item arrives split: `raw("<a …>")`, `raw("<code …>")`, text,
 * `raw("</code>")`, `raw("</a>")` as siblings, exactly as Astro leaves it.
 */

const RAW_TOKEN_LINK = /<a\b(?![^>]*\bdata-token-link\b)([^>]*)>(\s*<code\b[^>]*>(?:(?!<\/code>)[\s\S])*<\/code>\s*(?:<span\b[^>]*>[^<]*<\/span>\s*)?)<\/a>/gi;

const isBlank = (node) => node.type === "text" && !node.value.trim();
const isRawTag = (node, pattern) => node.type === "raw" && pattern.test(node.value.trim());

/** True when the element children are one code span plus an optional arrow span. */
export const isTokenOnlyLink = (link) => {
  const children = link.children.filter((child) => !isBlank(child));
  if (children.length === 0 || children.length > 2) return false;
  const [first, second] = children;
  if (first.type !== "element" || first.tagName !== "code") return false;
  return second === undefined || (second.type === "element" && second.tagName === "span");
};

/** Marks token-only links inside a string of authored HTML. */
export const markRawTokenLinks = (markup) => markup.replace(RAW_TOKEN_LINK, (_match, attributes, content) => `<a${attributes} data-token-link>${content}</a>`);

/**
 * Marks a link split across sibling raw nodes: `<a …>` `<code …>` … `</code>`
 * [`<span …>` … `</span>`] `</a>`, with only whitespace text between the tags.
 * Returns the index after the link, or -1 when the siblings are not that shape.
 */
const markSplitLink = (siblings, start) => {
  const open = siblings[start];
  if (!isRawTag(open, /^<a\b[^>]*>$/i) || /\bdata-token-link\b/.test(open.value)) return -1;
  let index = start + 1;
  const skipBlank = () => { while (index < siblings.length && isBlank(siblings[index])) index += 1; };
  skipBlank();
  if (!(index < siblings.length && isRawTag(siblings[index], /^<code\b[^>]*>$/i))) return -1;
  index += 1;
  while (index < siblings.length && !isRawTag(siblings[index], /^<\/code>$/i)) {
    const node = siblings[index];
    if (node.type !== "text" && !isRawTag(node, /^<wbr\s*\/?>$/i)) return -1;
    index += 1;
  }
  if (index >= siblings.length) return -1;
  index += 1;
  skipBlank();
  if (index < siblings.length && isRawTag(siblings[index], /^<span\b[^>]*>$/i)) {
    index += 1;
    while (index < siblings.length && siblings[index].type === "text") index += 1;
    if (!(index < siblings.length && isRawTag(siblings[index], /^<\/span>$/i))) return -1;
    index += 1;
    skipBlank();
  }
  if (!(index < siblings.length && isRawTag(siblings[index], /^<\/a>$/i))) return -1;
  open.value = open.value.replace(/^<a\b/i, "<a data-token-link");
  return index + 1;
};

export default function rehypeTokenLinks() {
  /** @param {import("hast").Root} tree */
  return (tree) => {
    /** @param {import("hast").Parents} parent */
    const walk = (parent) => {
      const siblings = parent.children;
      for (let index = 0; index < siblings.length; index += 1) {
        const node = siblings[index];
        if (node.type === "raw") {
          if (/<a\b/i.test(node.value) && /<\/a>/i.test(node.value)) node.value = markRawTokenLinks(node.value);
          else {
            const next = markSplitLink(siblings, index);
            if (next !== -1) index = next - 1;
          }
          continue;
        }
        if (node.type !== "element") continue;
        if (node.tagName === "a" && isTokenOnlyLink(node)) node.properties.dataTokenLink = true;
        if (node.tagName !== "pre" && "children" in node) walk(node);
      }
    };
    walk(tree);
  };
}
