/**
 * A GitHub-flavoured task list (`- [x] done`, `- [ ] to do`) renders as a
 * disabled, unlabelled <input type="checkbox"> before each item: a 13px
 * native control that cannot be operated, has no name (axe `label`), and
 * takes the platform's chrome rather than the site's. The state is the
 * content; the control is not. Each box becomes a marked <span> the sheet
 * draws (prose.css), with the state as its accessible name.
 */
export default function rehypeTaskLists() {
  /** @param {import("hast").Root} tree */
  return (tree) => {
    /** @param {import("hast").Parents} parent */
    const walk = (parent) => {
      parent.children.forEach((node, index) => {
        if (node.type !== "element") return;
        if (node.tagName === "input" && node.properties?.type === "checkbox" && parent.type === "element" && parent.tagName === "li") {
          const checked = node.properties.checked === true || node.properties.checked === "";
          parent.children[index] = {
            type: "element",
            tagName: "span",
            properties: { className: ["task-mark"], role: "img", ariaLabel: checked ? "Done" : "Not done", ...(checked ? { dataChecked: true } : {}) },
            children: [],
          };
          return;
        }
        if (node.tagName !== "pre" && "children" in node) walk(node);
      });
    };
    walk(tree);
  };
}
