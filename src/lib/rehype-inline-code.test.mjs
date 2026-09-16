import assert from "node:assert/strict";
import { test } from "node:test";
import { CAPSULE_CHROME, CHAR_WIDTH, CONTEXT_INSET, FLOOR_COLUMN, fitsInline, isLongInlineCode } from "./inline-code.mjs";
import rehypeInlineCode, { markRawMarkup } from "./rehype-inline-code.mjs";

const element = (tagName, children = [], properties = {}) => ({ type: "element", tagName, properties, children });
const text = (value) => ({ type: "text", value });
const raw = (value) => ({ type: "raw", value });
const root = (...children) => ({ type: "root", children });
const transform = (tree) => rehypeInlineCode()(tree);
const path = "~/.config/opencode/plugins/tmux-window-notification.ts";
/** The most characters that fit a context at 320px. */
const fit = (size = "body", insets = []) => Math.floor((FLOOR_COLUMN - insets.reduce((sum, name) => sum + CONTEXT_INSET[name], 0) - CAPSULE_CHROME) / CHAR_WIDTH[size]);

test("the model is the 320px column at the capsule size of each context", () => {
  assert.equal(fit(), 31, "a paragraph holds 31 characters");
  assert.equal(fit("body", ["li"]), 26, "a list item holds 26");
  assert.equal(fit("body", ["li", "li"]), 22, "a nested list item holds 22");
  assert.equal(fit("h3"), 24, "an h3 holds 24");
  assert.equal(fit("h2"), 20, "an h2 holds 20");
  assert.equal(fit("small", ["card"]), 31, "a card's small copy holds 31");
  for (const [size, insets] of [["body", []], ["body", ["li"]], ["h3", []], ["small", ["card"]]]) {
    const max = fit(size, insets);
    assert.equal(fitsInline("x".repeat(max), { size, insets }), true, `${max} fit in ${size} ${insets}`);
    assert.equal(fitsInline("x".repeat(max + 1), { size, insets }), false, `${max + 1} do not fit in ${size} ${insets}`);
  }
  assert.equal(isLongInlineCode(`  ${"x".repeat(31)}  `), false, "surrounding whitespace does not count");
});

test("a span is judged in its context: the same token fits a paragraph and not an h3", () => {
  // Given
  const token = "HelmChartInflationGenerator"; // 27 characters
  const inParagraph = element("code", [text(token)]);
  const inHeading = element("code", [text(token)]);
  const inNestedItem = element("code", [text(token)]);
  const tree = root(
    element("p", [inParagraph]),
    element("h3", [text("Option 5: "), inHeading]),
    element("ul", [element("li", [element("ul", [element("li", [inNestedItem])])])]),
  );
  // When
  transform(tree);
  // Then
  assert.equal(inParagraph.properties.dataLong, undefined);
  assert.equal(inHeading.properties.dataLong, true);
  assert.equal(inNestedItem.properties.dataLong, true);
});

test("fenced code is never marked", () => {
  // Given
  const code = element("code", [text(path)]);
  const tree = root(element("pre", [code]));
  // When
  transform(tree);
  // Then
  assert.equal(code.properties.dataLong, undefined);
});

test("nested markup inside a span counts as its text", () => {
  // Given
  const code = element("code", [text("~/.config/"), element("wbr"), text("opencode/plugins/tmux.ts")]);
  const tree = root(element("p", [code]));
  // When
  transform(tree);
  // Then
  assert.equal(code.properties.dataLong, true);
});

test("authored block HTML arriving as one raw node is scanned with its own nesting", () => {
  // Given: a card grid (small copy, 42px of padding) and a plain paragraph.
  const thirtyTwo = "x".repeat(32);
  const thirtyOne = "w".repeat(31);
  const twentyNine = "y".repeat(29);
  const markup = `<section class="surface-grid"><article><span>OpenCode</span><a class="path-token" href="#"><code class="path-token">${path}</code></a><p>Uses <code>${thirtyTwo}</code>, <code>${thirtyOne}</code> and <code>${twentyNine}</code>.</p></article></section><p><code>${twentyNine}</code> <code>${thirtyOne}</code></p>`;
  const node = raw(markup);
  const tree = root(node);
  // When
  transform(tree);
  // Then: the path and the 32-character span are long in a card and in a
  // paragraph (both hold 31); 31 and 29 fit in both.
  assert.equal(node.value, `<section class="surface-grid"><article><span>OpenCode</span><a class="path-token" href="#"><code class="path-token" data-long>${path}</code></a><p>Uses <code data-long>${thirtyTwo}</code>, <code>${thirtyOne}</code> and <code>${twentyNine}</code>.</p></article></section><p><code>${twentyNine}</code> <code>${thirtyOne}</code></p>`);
});

test("authored inline HTML split across sibling nodes is marked on its opening tag", () => {
  // Given: <li><code class="path-token">a/<wbr>b</code></li> as Astro leaves it.
  const open = raw('<code class="path-token">');
  const tree = root(element("ul", [element("li", [text("Store it at "), open, text("~/.config/opencode/"), raw("<wbr>"), text("secrets/home-assistant-mcp-url"), raw("</code>"), text(".")])]));
  // When
  transform(tree);
  // Then
  assert.equal(open.value, '<code class="path-token" data-long>');
});

test("raw markup under a <pre> is left alone, an authored mark is not doubled, and entities count once", () => {
  assert.equal(markRawMarkup(`<pre><code>${path}</code></pre>`, { insets: [], size: "body" }), `<pre><code>${path}</code></pre>`);
  assert.equal(markRawMarkup(`<code data-long>${path}</code>`, { insets: [], size: "body" }), `<code data-long>${path}</code>`);
  const entities = `<code>&lt;${"z".repeat(29)}&gt;</code>`; // 31 characters rendered
  assert.equal(markRawMarkup(entities, { insets: [], size: "body" }), entities);
  assert.equal(markRawMarkup(`<code>&lt;${"z".repeat(30)}&gt;</code>`, { insets: [], size: "body" }), `<code data-long>&lt;${"z".repeat(30)}&gt;</code>`);
});
