/* Frame titles are file paths. Every titled block on the site names the file
   its code belongs in (`stacks/aws/acme-development/eu-west-1/acm/stack.tm.hcl`,
   `mise.toml`), and a path is verbatim: its case is part of it (`Makefile`,
   `README.md`), and it is one thing, not a sentence that may break after a
   hyphen. Set as an uppercased, tracked label, the longest titles in the
   corpus (78 characters) wrapped onto three lines under the window dots at
   every width, splitting `eu-west-1` at its hyphens.

   prose.css therefore keeps the title on one line and, when the header is
   too narrow for the whole path, cuts it with an ellipsis, and the cut must
   fall on the directory, never on the file name: `stacks/aws/acme-dev…/
   stack.tm.hcl` still says which file, `STACKS/AWS/ACME-DEVELOPMENT/EU-WES…`
   does not. That is a two-part layout, so this Expressive Code plugin splits
   the rendered title at its last slash into a directory span and a name
   span (the slash travels with the name, so a cut directory still reads
   `…/stack.tm.hcl`). The full path stays the element's text, read aloud as
   one, and is repeated in a tooltip for the widths that cut it. A title with
   no directory is left as EC rendered it. */

const CLASS_TITLE = "title";

/** @param {import("hast").Element} node @returns {string[]} */
const classList = (node) => {
  const classes = node.properties?.className;
  return Array.isArray(classes) ? classes.map(String) : String(classes || "").split(/\s+/).filter(Boolean);
};

/**
 * @param {import("hast").Element} node
 * @returns {import("hast").Element | undefined} The frame's title span, if the block has a header.
 */
const findTitle = (node) => {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    if (child.tagName === "span" && classList(child).includes(CLASS_TITLE)) return child;
    /* The header is the figure's first child; the code itself is never
       searched, a `.title` inside a rendered line is code. */
    if (child.tagName === "pre") continue;
    const found = findTitle(child);
    if (found) return found;
  }
  return undefined;
};

/**
 * Split a rendered title in place. Exported for the unit test; the plugin
 * below is what the Astro config registers.
 * @param {import("hast").Element} title
 * @returns {boolean} Whether the title was plain text and was marked up.
 */
export const splitFrameTitle = (title) => {
  if (title.children.length === 0 || !title.children.every((child) => child.type === "text")) return false;
  const text = title.children.map((child) => child.value).join("");
  if (!text.trim()) return false;
  /** @param {string} className @param {string} value */
  const span = (className, value) => ({ type: "element", tagName: "span", properties: { className: [className] }, children: [{ type: "text", value }] });
  const cut = text.lastIndexOf("/");
  /* No slash, a name directly under the root (`/hosts`: the slash is the
     name's), or a trailing slash (`stacks/` is all name): the whole title
     is the name. `/etc/hosts` splits into `/etc` and `/hosts`. The name is
     always its own span so that the stylesheet has an element to cut with
     an ellipsis (text-overflow does not reach an anonymous flex item). */
  title.children = cut <= 0 || cut === text.length - 1
    ? [span("title-name", text)]
    : [span("title-dir", text.slice(0, cut)), span("title-name", text.slice(cut))];
  title.properties = { ...title.properties, title: text };
  return true;
};

/** @returns {import("astro-expressive-code").ExpressiveCodePlugin} */
export default function pluginFrameTitlePath() {
  return {
    name: "Frame title path",
    hooks: {
      /* Runs after the frames plugin has wrapped the block in its figure:
         default plugins precede configured ones in the hook order. */
      postprocessRenderedBlock: ({ renderData }) => {
        const title = findTitle(renderData.blockAst);
        if (title) splitFrameTitle(title);
      },
    },
  };
}
