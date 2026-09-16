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

test("two tables under one heading get distinct region names", async () => {
  // Given
  const tree = root(element("h2", [text("Voice dictation")]), element("table"), element("p", [text("and")]), element("table"));
  // When
  await transform(tree);
  // Then
  assert.equal(tree.children[1].properties.ariaLabel, "Voice dictation");
  assert.equal(tree.children[3].properties.ariaLabel, "Voice dictation (table 2)");
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

test("hoists the wide opt-in onto a wrapper that holds nothing but the table", async () => {
  // Given
  const table = element("table");
  const wrapper = element("div", [text("\n\n"), table, text("\n")], { className: ["setup-reference"] });
  const tree = root(element("h2", [text("Ansible roles")]), wrapper);
  // When
  await transform(tree);
  // Then
  assert.deepEqual(wrapper.properties.className, ["setup-reference", "wide"]);
  assert.deepEqual(wrapper.children[1], element("div", [table], {
    className: ["table-scroll"], tabIndex: 0, role: "region", ariaLabel: "Ansible roles",
  }));
});

test("does not add wide twice to a wrapper that already opts in", async () => {
  // Given
  const wrapper = element("div", [element("table")], { className: "setup-reference wide" });
  // When
  await transform(root(wrapper));
  // Then
  assert.equal(wrapper.properties.className, "setup-reference wide");
  assert.deepEqual(wrapper.children[0].properties.className, ["table-scroll"]);
});

test("keeps wide on the region when the wrapper holds other content too", async () => {
  // Given
  const table = element("table");
  const section = element("section", [element("h3", [text("Keys")]), table, element("p", [text("Note")])], { className: ["shortcut-reference"] });
  // When
  await transform(root(section));
  // Then
  assert.deepEqual(section.properties.className, ["shortcut-reference"]);
  assert.deepEqual(section.children[1].properties.className, ["table-scroll", "wide"]);
});

/* Astro's own pipeline runs no rehype-raw pass (astro.config.mjs): the Markdown
   inside block HTML is parsed, but the authored tags around it stay opaque
   `raw` nodes. Both shapes must hoist the same way. */
for (const [pipeline, rehypePlugins] of [["a rehype-raw", (plugin) => [rehypeRaw, plugin]], ["Astro's raw-node", (plugin) => [plugin]]]) {
  test(`hoists wide onto an authored group around a Markdown table in ${pipeline} pipeline`, async () => {
    // Given
    const plugin = (await import("./rehype-table-scroll.mjs")).default;
    const processor = await createMarkdownProcessor({ syntaxHighlight: false, rehypePlugins: rehypePlugins(plugin) });
    const markdown = '## Roles\n\n<div class="setup-reference">\n\n| Role | Purpose |\n| --- | --- |\n| a | b |\n\n</div>';
    // When
    const { code } = await processor.render(markdown);
    // Then
    assert.match(code, /<div class="setup-reference wide">\s*<div class="table-scroll" tabindex="0" role="region" aria-label="Roles">/);
    assert.equal((code.match(/wide/g) || []).length, 1);
  });

  test(`leaves wide on the region when the group holds more than the table in ${pipeline} pipeline`, async () => {
    // Given
    const plugin = (await import("./rehype-table-scroll.mjs")).default;
    const processor = await createMarkdownProcessor({ syntaxHighlight: false, rehypePlugins: rehypePlugins(plugin) });
    const markdown = '<section class="shortcut-reference">\n\n## Keys\n\n| Key | Action |\n| --- | --- |\n| a | b |\n\nA note.\n\n</section>';
    // When
    const { code } = await processor.render(markdown);
    // Then
    assert.match(code, /<section class="shortcut-reference">/);
    assert.match(code, /<div class="table-scroll wide" tabindex="0" role="region" aria-label="Keys">/);
  });
}

test("adds a class attribute to a raw wrapper that has none and respects one that already opts in", async () => {
  // Given
  const plugin = (await import("./rehype-table-scroll.mjs")).default;
  const processor = await createMarkdownProcessor({ syntaxHighlight: false, rehypePlugins: [plugin] });
  const markdown = "<div>\n\n| A |\n| --- |\n| 1 |\n\n</div>\n\n<div class='setup-reference wide'>\n\n| B |\n| --- |\n| 2 |\n\n</div>";
  // When
  const { code } = await processor.render(markdown);
  // Then (Astro serialises the authored tag afterwards, so quotes normalise; the class list is what matters)
  assert.match(code, /<div class="wide">\s*<div class="table-scroll" tabindex="0" role="region" aria-label="Table 1">/);
  assert.match(code, /<div class=["']setup-reference wide["']>\s*<div class="table-scroll" tabindex="0" role="region" aria-label="Table 2">/);
  assert.equal((code.match(/\bwide\b/g) || []).length, 2);
});

test("does not treat unmatched raw tags around a table as its wrapper", async () => {
  // Given
  const plugin = (await import("./rehype-table-scroll.mjs")).default;
  const processor = await createMarkdownProcessor({ syntaxHighlight: false, rehypePlugins: [plugin] });
  const markdown = '<div class="tabs">\n<section class="tab" data-tab-label="x">\n<span>x</span>\n\n| A |\n| --- |\n| 1 |\n\n</section>\n</div>';
  // When
  const { code } = await processor.render(markdown);
  // Then
  assert.match(code, /<section class="tab" data-tab-label="x">\n<span>x<\/span>/);
  assert.match(code, /<div class="table-scroll wide" tabindex="0" role="region" aria-label="Table 1">/);
});

test("writes explicit table roles so the stacked phone rendering keeps its semantics", async () => {
  // Given
  const plugin = (await import("./rehype-table-scroll.mjs")).default;
  const processor = await createMarkdownProcessor({ syntaxHighlight: false, rehypePlugins: [plugin] });
  const markdown = "| Key | Action |\n| --- | --- |\n| a | b |";
  // When
  const { code } = await processor.render(markdown);
  // Then
  assert.match(code, /<table role="table">/);
  assert.match(code, /<thead role="rowgroup">/);
  assert.match(code, /<tbody role="rowgroup">/);
  assert.equal((code.match(/<tr role="row">/g) || []).length, 2);
  assert.equal((code.match(/<th role="columnheader">/g) || []).length, 2);
  assert.equal((code.match(/<td role="cell">/g) || []).length, 2);
});

test("marks a column whose every cell is one token, and not a sentence that merely contains one", async () => {
  // Given
  const token = element("td", [text("\n  "), element("code", [text("stacks/")]), text(" ")]);
  const linked = element("td", [element("a", [element("code", [text("main.tf")])], { href: "#" })]);
  const keycap = element("td", [element("kbd", [text("Ctrl")])]);
  const sentence = element("td", [text("reads or is read via "), element("code", [text("terraform_remote_state")]), text(", owns shared networking")]);
  const two = element("td", [element("code", [text("ys")]), text(" / "), element("code", [text("ds")])]);
  const last = element("td", [element("code", [text("never")])]);
  const tree = root(element("table", [element("tbody", [element("tr", [token, linked, keycap, sentence, two, last])])]));
  // When
  await transform(tree);
  // Then
  assert.equal(token.properties.dataTokenCell, true);
  assert.equal(linked.properties.dataTokenCell, true);
  assert.equal(keycap.properties.dataTokenCell, true);
  assert.equal(sentence.properties.dataTokenCell, undefined);
  assert.equal(two.properties.dataTokenCell, undefined);
  assert.equal(last.properties.dataTokenCell, undefined, "the last column is the description, never a token column");
});

test("a lone token in a column of sentences is not a token column; a dash placeholder does not break one", async () => {
  // Given
  const lone = element("td", [element("code", [text("terraform_remote_state")])]);
  const prose = element("td", [text("single AWS context, no remote-state coupling")]);
  const mixed = element("table", [element("tbody", [
    element("tr", [prose, element("td", [text("migrate now")])]),
    element("tr", [lone, element("td", [text("migrate later")])]),
  ])]);
  const first = element("td", [element("code", [text("--tags")])]);
  const dash = element("td", [text("\u2014")]);
  const empty = element("td", [text("\n")]);
  const withPlaceholders = element("table", [element("thead", [element("tr", [element("th", [text("Flag")]), element("th", [text("Meaning")])])]), element("tbody", [
    element("tr", [first, element("td", [text("filter")])]),
    element("tr", [dash, element("td", [text("no filter")])]),
    element("tr", [empty, element("td", [text("nothing")])]),
  ])]);
  const onlyDashes = element("td", [text("-")]);
  const dashes = element("table", [element("tbody", [element("tr", [onlyDashes, element("td", [text("x")])])])]);
  // When
  await transform(root(mixed, withPlaceholders, dashes));
  // Then
  assert.equal(lone.properties.dataTokenCell, undefined);
  assert.equal(prose.properties.dataTokenCell, undefined);
  assert.equal(first.properties.dataTokenCell, true);
  assert.equal(dash.properties.dataTokenCell, true);
  assert.equal(empty.properties.dataTokenCell, true);
  assert.equal(onlyDashes.properties.dataTokenCell, undefined, "a column of placeholders alone is not a token column");
});

test("renders the token mark as data-token-cell through the markdown pipeline", async () => {
  // Given
  const processor = await createMarkdownProcessor({
    rehypePlugins: [rehypeRaw, (await import("./rehype-table-scroll.mjs")).default],
  });
  // When
  const { code } = await processor.render("| Key | Does |\n| --- | --- |\n| `q` | quits |\n| `w` | writes, via `:w` |\n");
  // Then
  assert.equal((code.match(/<td role="cell" data-token-cell>/g) || []).length, 2);
});

test("keeps a role an author already wrote on a table part", async () => {
  // Given
  const th = element("th", [text("Name")], { scope: "row" });
  const table = element("table", [element("tbody", [element("tr", [th, element("td", [text("x")])])])]);
  // When
  await transform(root(table));
  // Then
  assert.equal(th.properties.role, "rowheader");
  assert.equal(table.properties.role, "table");
});
