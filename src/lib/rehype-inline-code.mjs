import { isLongInlineCode } from "./inline-code.mjs";

/**
 * Marks inline code that is too long to stay unbroken on a phone with
 * `data-long` (inline-code.mjs holds the model: the 320px column, less what
 * the span's context indents, at the capsule size of the text around it).
 * Fenced code is never touched: Expressive Code renders it, and a <pre>
 * ancestor excludes every <code> under it.
 *
 * Three shapes occur. A Markdown span (`` `x` ``) arrives as a <code>
 * element. Authored block HTML (a card grid, a step list) arrives as Astro
 * leaves it: one opaque `raw` node holding the whole block as text, so its
 * tags are scanned and rewritten in place. Authored inline HTML inside a
 * Markdown paragraph or list item (`<code class="path-token">a/<wbr>b</code>`)
 * arrives split: a `raw` node for the opening tag, text and `raw` <wbr>
 * nodes for the content, a `raw` node for the closing tag, all siblings.
 */
const OPEN_CODE = /^<code\b([^>]*)>$/i;
const CLOSE_CODE = /^<\/code>$/i;
const ENTITY = /&(?:#\d+|#x[\da-f]+|[a-z]+);/gi;
const VOID = new Set(["br", "wbr", "img", "hr", "input", "source", "track", "col", "meta", "link"]);

/** The text a raw fragment renders: tags dropped, entities one character each. */
const rawText = (markup) => markup.replace(/<[^>]*>/g, "").replace(ENTITY, "x");

const classes = (value) => String(value ?? "").split(/\s+/).filter(Boolean);

/** What an element adds to the context: an inset name, a text size, both, or nothing. */
const contextOf = (tagName, classList) => {
  const out = {};
  if (tagName === "li") out.inset = "li";
  else if (tagName === "blockquote") out.inset = "blockquote";
  else if (tagName === "dd") out.inset = "dd";
  else if (tagName === "td" || tagName === "th") out.inset = "cell";
  else if (tagName === "aside" && classList.some((name) => name.startsWith("op-admonition"))) out.inset = "admonition";
  else if (classList.includes("tab")) out.inset = "tab";
  else if (tagName === "details") out.inset = "disclosure";
  if (classList.includes("surface-grid")) { out.inset = "card"; out.size = "small"; }
  if (classList.includes("steps")) { out.inset = "step"; out.size = "small"; }
  if (/^h[1-6]$/.test(tagName)) out.size = tagName;
  return out;
};

const extend = (context, tagName, classList) => {
  const { inset, size } = contextOf(tagName, classList);
  if (!inset && !size) return context;
  return { insets: inset ? [...context.insets, inset] : context.insets, size: size ?? context.size };
};

const mark = (attributes) => (/\sdata-long\b/i.test(attributes) ? attributes : `${attributes} data-long`);

/**
 * Rewrite every <code>…</code> inside one raw markup string, tracking the
 * open elements around it for context.
 * @param {string} markup
 * @param {{ insets: string[], size: string }} base
 */
export const markRawMarkup = (markup, base) => {
  const tags = [...markup.matchAll(/<(\/?)([a-z][a-z0-9]*)\b([^>]*?)(\/?)>/gi)];
  const stack = [];
  let out = "";
  let cursor = 0;
  for (let index = 0; index < tags.length; index += 1) {
    const [tag, closing, name, attributes, selfClosing] = tags[index];
    const tagName = name.toLowerCase();
    if (closing) {
      const at = stack.map((entry) => entry.tagName).lastIndexOf(tagName);
      if (at >= 0) stack.length = at;
      continue;
    }
    if (tagName === "code" && !stack.some((entry) => entry.tagName === "pre")) {
      const close = tags.slice(index + 1).find((candidate) => candidate[1] === "/" && candidate[2].toLowerCase() === "code");
      if (close) {
        const inner = markup.slice(tags[index].index + tag.length, close.index);
        const context = stack.reduce((acc, entry) => extend(acc, entry.tagName, entry.classList), base);
        if (isLongInlineCode(rawText(inner), context)) {
          out += markup.slice(cursor, tags[index].index) + `<code${mark(attributes)}${selfClosing}>`;
          cursor = tags[index].index + tag.length;
        }
      }
      continue;
    }
    if (!selfClosing && !VOID.has(tagName)) {
      stack.push({ tagName, classList: classes(/\bclass="([^"]*)"/i.exec(attributes)?.[1]) });
    }
  }
  return out + markup.slice(cursor);
};

/** @param {import("hast").Element} node */
const elementText = (node) => {
  let text = "";
  for (const child of node.children ?? []) {
    if (child.type === "text") text += child.value;
    else if (child.type === "raw") text += rawText(child.value);
    else if (child.type === "element") text += elementText(child);
  }
  return text;
};

export default function rehypeInlineCode() {
  /** @param {import("hast").Root} tree */
  return (tree) => {
    /**
     * @param {import("hast").Parents} parent
     * @param {{ insets: string[], size: string }} context
     */
    const walk = (parent, context) => {
      const children = parent.children;
      for (let index = 0; index < children.length; index += 1) {
        const node = children[index];
        if (node.type === "raw") {
          const open = OPEN_CODE.exec(node.value.trim());
          if (open) {
            /* An inline span split across siblings: gather its text up to the closing tag. */
            let text = "";
            let end = index + 1;
            while (end < children.length && !(children[end].type === "raw" && CLOSE_CODE.test(children[end].value.trim()))) {
              const part = children[end];
              text += part.type === "text" ? part.value : part.type === "raw" ? rawText(part.value) : part.type === "element" ? elementText(part) : "";
              end += 1;
            }
            if (end < children.length && isLongInlineCode(text, context)) node.value = `<code${mark(open[1])}>`;
            index = end;
            continue;
          }
          if (/<code\b/i.test(node.value)) node.value = markRawMarkup(node.value, context);
          continue;
        }
        if (node.type !== "element" || node.tagName === "pre") continue;
        const next = extend(context, node.tagName, classes(node.properties?.className?.join?.(" ") ?? node.properties?.className));
        if (node.tagName === "code") {
          if (isLongInlineCode(elementText(node), context)) node.properties.dataLong = true;
          continue;
        }
        if ("children" in node) walk(node, next);
      }
    };
    walk(tree, { insets: [], size: "body" });
  };
}
