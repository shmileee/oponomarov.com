import assert from "node:assert/strict";
import { test } from "node:test";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import rehypeRaw from "rehype-raw";

const element = (tagName, children = [], properties = {}) => ({ type: "element", tagName, properties, children });
const text = (value) => ({ type: "text", value });
const root = (...children) => ({ type: "root", children });
const transform = async (tree) => (await import("./rehype-table-scroll.mjs")).default()(tree);

test("wraps a table in a named keyboard-accessible region when no heading exists", async () => {
  // Given
  const table = element("table");
  const tree = root(table);
  // When
  await transform(tree);
  // Then
  assert.deepEqual(tree.children[0], element("div", [table], {
    className: ["table-scroll", "wide"], tabIndex: 0, role: "region", ariaLabel: "Table 1",
  }));
});

test("prefers caption text when a preceding heading also exists", async () => {
  // Given
  const tree = root(element("h2", [text("Commands")]), element("table", [
    element("caption", [text("  Install "), element("em", [text("options")]), text("\n")]),
  ]));
  // When
  await transform(tree);
  // Then
  assert.equal(tree.children[1].properties.ariaLabel, "Install options");
});

test("uses the nearest preceding heading across nested containers", async () => {
  // Given
  const table = element("table", [element("caption", [text(" ")])]);
  const tree = root(element("h2", [text("Old")]), element("section", [
    element("h3", [text("Key "), element("code", [text("bindings")])]),
  ]), element("div", [table]), element("h2", [text("Later")]));
  // When
  await transform(tree);
  // Then
  assert.equal(tree.children[2].children[0].properties.ariaLabel, "Key bindings");
});

test("numbers generic labels deterministically when headings are empty", async () => {
  // Given
  const tree = root(element("h2", [text(" ")]), element("table"), element("table"));
  // When
  await transform(tree);
  // Then
  assert.deepEqual(tree.children.slice(1).map((node) => node.properties.ariaLabel), ["Table 1", "Table 2"]);
});

for (const className of [["table-scroll", "wide"], "wide table-scroll"]) {
  test(`preserves existing ancestor wrappers when className is ${typeof className}`, async () => {
    // Given
    const tree = root(element("div", [element("section", [element("table")])], { className }));
    const before = structuredClone(tree);
    // When
    await transform(tree);
    // Then
    assert.deepEqual(tree, before);
  });
}

test("is idempotent when the plugin runs twice", async () => {
  // Given
  const tree = root(element("table"));
  await transform(tree);
  const once = structuredClone(tree);
  // When
  await transform(tree);
  // Then
  assert.deepEqual(tree, once);
});

test("resets heading and numbering state when a transformer renders another document", async () => {
  // Given
  const plugin = (await import("./rehype-table-scroll.mjs")).default();
  plugin(root(element("h2", [text("Other document")]), element("table")));
  const tree = root(element("table"));
  // When
  plugin(tree);
  // Then
  assert.equal(tree.children[0].properties.ariaLabel, "Table 1");
});

test("wraps raw HTML tables and Markdown tables inside HTML sections in Astro's pipeline", async () => {
  // Given
  const plugin = (await import("./rehype-table-scroll.mjs")).default;
  const processor = await createMarkdownProcessor({ syntaxHighlight: false, rehypePlugins: [rehypeRaw, plugin] });
  const markdown = '<section>\n\n## Commands\n\n| Key | Action |\n| --- | --- |\n| A | Start |\n\n</section>\n\n<table><caption>Raw options</caption><tr><td>B</td></tr></table>';
  // When
  const { code } = await processor.render(markdown);
  // Then
  assert.equal((code.match(/class="table-scroll wide"/g) || []).length, 2);
  assert.match(code, /tabindex="0" role="region" aria-label="Commands"/);
  assert.match(code, /tabindex="0" role="region" aria-label="Raw options"/);
});

test("preserves an existing HTML scroll ancestor around a Markdown table", async () => {
  // Given
  const plugin = (await import("./rehype-table-scroll.mjs")).default;
  const processor = await createMarkdownProcessor({ syntaxHighlight: false, rehypePlugins: [rehypeRaw, plugin] });
  const markdown = '<div class="table-scroll" tabindex="0" role="region" aria-label="Existing"><section>\n\n| Key | Action |\n| --- | --- |\n| A | Start |\n\n</section></div>';
  // When
  const { code } = await processor.render(markdown);
  // Then
  assert.equal((code.match(/class="table-scroll/g) || []).length, 1);
  assert.match(code, /aria-label="Existing"/);
});
