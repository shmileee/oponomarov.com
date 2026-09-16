/** @param {import("hast").Nodes} node @returns {string} */
const textContent = (node) => {
  if (node.type === "text") return node.value;
  if (node.type === "element" && node.tagName === "img") return String(node.properties.alt || "");
  if (node.type === "element" && node.tagName === "br") return " ";
  return "children" in node ? node.children.map(textContent).join("") : "";
};

/** @param {import("hast").Element} node @returns {string[]} */
const classList = (node) => {
  const classes = node.properties.className;
  return Array.isArray(classes) ? classes.map(String) : String(classes || "").split(/\s+/).filter(Boolean);
};

/** @param {import("hast").Nodes} node */
const isBlank = (node) => node.type === "text" && !node.value.trim();

/* A single authored opening or closing tag, as Astro leaves it: the pipeline
   parses Markdown inside block HTML but keeps the surrounding tags as opaque
   `raw` nodes, so `<div class="setup-reference">` and its `</div>` arrive as
   two strings either side of the table element. */
const OPEN_TAG = /^\s*<(div|section)(\s[^<>]*)?>\s*$/i;
const CLOSE_TAG = /^\s*<\/(div|section)\s*>\s*$/i;
const CLASS_ATTR = /\sclass=(["'])(.*?)\1/i;

/** @param {string} tag @returns {string} The same opening tag with `wide` in its class list. */
const withWide = (tag) => {
  const match = CLASS_ATTR.exec(tag);
  if (!match) return tag.replace(/\s*>\s*$/, ' class="wide">');
  const classes = match[2].split(/\s+/).filter(Boolean);
  if (classes.includes("wide")) return tag;
  return tag.replace(CLASS_ATTR, ` class=${match[1]}${[...classes, "wide"].join(" ")}${match[1]}`);
};

/**
 * The authored wrapper that holds nothing but this table, if there is one: a
 * `setup-reference` group, or any div or section with no other content. The
 * grid honours `wide` only on its direct children, so a region created inside
 * such a wrapper would carry an opt-in nothing can see; the wrapper is what
 * stands in the grid, so the wrapper takes it. Two shapes occur: a real
 * element (a pipeline that ran rehype-raw) and Astro's raw open/close pair.
 * @param {import("hast").Parents} parent @param {number} index
 * @returns {(() => void) | null} The hoist to apply, or null when the table stands alone or shares its wrapper.
 */
const wrapperHoist = (parent, index) => {
  const table = parent.children[index];
  if (parent.type === "element") {
    const alone = parent.children.every((child) => child === table || isBlank(child));
    if (!alone) return null;
    return () => {
      if (!classList(parent).includes("wide")) parent.properties.className = [...classList(parent), "wide"];
    };
  }
  let before = index - 1;
  while (before >= 0 && isBlank(parent.children[before])) before -= 1;
  let after = index + 1;
  while (after < parent.children.length && isBlank(parent.children[after])) after += 1;
  const open = parent.children[before];
  const close = parent.children[after];
  if (open?.type !== "raw" || close?.type !== "raw") return null;
  const opened = OPEN_TAG.exec(open.value);
  const closed = CLOSE_TAG.exec(close.value);
  if (!opened || !closed || opened[1].toLowerCase() !== closed[1].toLowerCase()) return null;
  return () => {
    open.value = withWide(open.value);
  };
};

/* Explicit table roles. Below 40rem prose.css stacks the rows of a two- or
   three-column table (`display: block` on table, tbody, tr and td), and a
   table part whose display is no longer table-* loses its implicit role in
   Chromium and WebKit. Writing the roles the parts already have keeps the
   table a table for assistive technology in both renderings; at every other
   width the attributes restate the default and change nothing. */
const TABLE_ROLES = {
  table: "table",
  thead: "rowgroup",
  tbody: "rowgroup",
  tfoot: "rowgroup",
  tr: "row",
  th: "columnheader",
  td: "cell",
};

/* A token column is a body column whose every cell is one verbatim token
   and nothing else - a code span, a keycap, or a link around one of those:
   `stacks/`, `Ctrl`, a linked path - or an empty or dash placeholder among
   them. prose.css sizes such a column to its widest token, keeps each token
   on one line, and centres it beside the description it labels. It used to
   find the cells with `td:has(> code:first-child)`, which CSS evaluates over
   element children only: "reads or is read via <code>x</code>, owns…" also
   has code as its first element child, and a prose cell in a note's
   classification table was set nowrap, pushing the whole table into a 600px
   scroll at 1440. The decision needs the text nodes and the whole column
   (one token in a column of sentences is a short sentence, not a label), so
   it is made here, and the last column is never one: it is the description.
   Cells with a rowspan or colspan are not tokens; a table that uses them is
   a grid, not a list of labelled pairs. */
const TOKEN_TAGS = new Set(["code", "kbd"]);
const PLACEHOLDER = /^[\s\-\u2013\u2014]*$/;
/** @param {import("hast").Element} cell @returns {"token" | "placeholder" | "prose"} */
const cellKind = (cell) => {
  if (cell.properties.rowSpan > 1 || cell.properties.colSpan > 1) return "prose";
  const children = cell.children.filter((child) => !isBlank(child));
  if (children.length === 0) return "placeholder";
  if (children.length !== 1) return "prose";
  const [only] = children;
  if (only.type === "text") return PLACEHOLDER.test(only.value) ? "placeholder" : "prose";
  if (only.type !== "element") return "prose";
  if (TOKEN_TAGS.has(only.tagName)) return "token";
  if (only.tagName !== "a") return "prose";
  const inner = only.children.filter((child) => !isBlank(child));
  return inner.length === 1 && inner[0].type === "element" && TOKEN_TAGS.has(inner[0].tagName) ? "token" : "prose";
};

/** @param {import("hast").Element} table */
const markTokenColumns = (table) => {
  /** @type {import("hast").Element[][]} */
  const rows = [];
  /** @param {import("hast").Element} node */
  const collect = (node) => {
    for (const child of node.children) {
      if (child.type !== "element" || child.tagName === "table") continue;
      if (child.tagName === "tr") {
        const cells = child.children.filter((cell) => cell.type === "element" && cell.tagName === "td");
        if (cells.length > 0) rows.push(/** @type {import("hast").Element[]} */ (cells));
      } else if (child.tagName === "thead") {
        continue;
      } else {
        collect(child);
      }
    }
  };
  collect(table);
  const width = Math.max(0, ...rows.map((cells) => cells.length));
  for (let column = 0; column < width - 1; column += 1) {
    const kinds = rows.map((cells) => (cells[column] ? cellKind(cells[column]) : "prose"));
    if (kinds.includes("prose") || !kinds.includes("token")) continue;
    for (const cells of rows) cells[column].properties.dataTokenCell = true;
  }
};

/** @param {import("hast").Element} table */
const assignTableRoles = (table) => {
  /** @param {import("hast").Element} node */
  const visit = (node) => {
    const role = TABLE_ROLES[node.tagName];
    if (role && !node.properties.role) {
      node.properties.role = role === "columnheader" && node.properties.scope === "row" ? "rowheader" : role;
    }
    for (const child of node.children) {
      if (child.type === "element" && child.tagName !== "table") visit(child);
    }
  };
  visit(table);
  markTokenColumns(table);
};

/** Wrap parsed Markdown and HTML tables; register rehype-raw before this plugin. */
export default function rehypeTableScroll() {
  /** @param {import("hast").Root} tree */
  return (tree) => {
    let heading = "";
    let tableNumber = 0;
    /* Two tables under one heading would be two regions with one name, and
       a screen reader's landmark list cannot tell them apart (axe
       landmark-unique): the second and later tables of a heading count
       themselves. */
    const used = new Map();
    const uniqueLabel = (label) => {
      const seen = (used.get(label) ?? 0) + 1;
      used.set(label, seen);
      return seen === 1 ? label : `${label} (table ${seen})`;
    };

    /** @param {import("hast").Parents} parent @param {boolean} insideScroll */
    const walk = (parent, insideScroll) => {
      for (const [index, node] of parent.children.entries()) {
        if (node.type !== "element") continue;
        const isScroll = classList(node).includes("table-scroll");
        if (/^h[1-6]$/.test(node.tagName)) {
          heading = textContent(node).replace(/\s+/g, " ").trim();
        }
        if (node.tagName === "table") {
          tableNumber += 1;
          if (!insideScroll) {
            assignTableRoles(node);
            const caption = node.children.find((child) => child.type === "element" && child.tagName === "caption");
            const label = caption ? textContent(caption).replace(/\s+/g, " ").trim() : "";
            const hoist = wrapperHoist(parent, index);
            hoist?.();
            parent.children[index] = {
              type: "element",
              tagName: "div",
              properties: {
                className: hoist ? ["table-scroll"] : ["table-scroll", "wide"],
                tabIndex: 0,
                role: "region",
                ariaLabel: uniqueLabel(label || heading || `Table ${tableNumber}`),
              },
              children: [node],
            };
          }
        }
        walk(node, insideScroll || isScroll || node.tagName === "table");
      }
    };

    walk(tree, false);
  };
}
