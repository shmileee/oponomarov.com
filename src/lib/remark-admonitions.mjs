const variants = new Map([
  ["note", { kind: "note", title: "Note" }],
  ["info", { kind: "note", title: "Note" }],
  ["tip", { kind: "tip", title: "Tip" }],
  ["important", { kind: "important", title: "Important" }],
  ["warning", { kind: "warning", title: "Warning" }],
  ["warn", { kind: "warning", title: "Warning" }],
  ["caution", { kind: "caution", title: "Caution" }],
  ["danger", { kind: "danger", title: "Danger" }],
  ["critical", { kind: "critical", title: "Critical" }],
]);

const markerPattern = /^\[!([a-z]+)\](?:\s+(.+))?$/i;

const transformChildren = (parent) => {
  if (!Array.isArray(parent.children)) return;

  for (const node of parent.children) {
    if (node.type === "blockquote") {
      const marker = node.children?.[0];
      const markerText = marker?.type === "paragraph"
        && marker.children?.length === 1
        && marker.children[0]?.type === "text"
        ? marker.children[0].value.trim()
        : "";
      const match = markerText.match(markerPattern);
      const variant = match ? variants.get(match[1].toLowerCase()) : undefined;

      if (variant) {
        const title = match[2]?.trim() || variant.title;
        node.data = {
          ...node.data,
          hName: "aside",
          hProperties: {
            className: ["op-admonition", `op-admonition--${variant.kind}`],
            dataAdmonition: variant.kind,
            role: "note",
          },
        };
        node.children = [
          {
            type: "paragraph",
            children: [{ type: "text", value: title }],
            data: {
              hName: "header",
              hProperties: { className: ["op-admonition__title"] },
            },
          },
          ...node.children.slice(1),
        ];
      }
    }

    transformChildren(node);
  }
};

export default function remarkAdmonitions() {
  return transformChildren;
}
