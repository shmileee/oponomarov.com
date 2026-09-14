/** @param {import("hast").Nodes} node @returns {string} */
const textContent = (node) => {
  if (node.type === "text") return node.value;
  if (node.type === "element" && node.tagName === "img") return String(node.properties.alt || "");
  if (node.type === "element" && node.tagName === "br") return " ";
  return "children" in node ? node.children.map(textContent).join("") : "";
};

/** Wrap parsed Markdown and HTML tables; register rehype-raw before this plugin. */
export default function rehypeTableScroll() {
  /** @param {import("hast").Root} tree */
  return (tree) => {
    let heading = "";
    let tableNumber = 0;

    /** @param {import("hast").Parents} parent @param {boolean} insideScroll */
    const walk = (parent, insideScroll) => {
      for (const [index, node] of parent.children.entries()) {
        if (node.type !== "element") continue;
        const classes = node.properties.className;
        const isScroll = (Array.isArray(classes) ? classes : String(classes || "").split(/\s+/)).includes("table-scroll");
        if (/^h[1-6]$/.test(node.tagName)) {
          heading = textContent(node).replace(/\s+/g, " ").trim();
        }
        if (node.tagName === "table") {
          tableNumber += 1;
          if (!insideScroll) {
            const caption = node.children.find((child) => child.type === "element" && child.tagName === "caption");
            const label = caption ? textContent(caption).replace(/\s+/g, " ").trim() : "";
            parent.children[index] = {
              type: "element",
              tagName: "div",
              properties: {
                className: ["table-scroll", "wide"],
                tabIndex: 0,
                role: "region",
                ariaLabel: label || heading || `Table ${tableNumber}`,
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
