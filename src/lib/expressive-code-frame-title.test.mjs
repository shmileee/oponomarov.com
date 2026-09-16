import assert from "node:assert/strict";
import { test } from "node:test";
import { ExpressiveCode } from "expressive-code";
import { toHtml } from "hast-util-to-html";
import pluginFrameTitlePath, { splitFrameTitle } from "./expressive-code-frame-title.mjs";

const render = async (meta) => {
  const engine = new ExpressiveCode({ plugins: [pluginFrameTitlePath()], themes: [] });
  const { renderedGroupAst } = await engine.render({ code: "x = 1", language: "hcl", meta });
  return toHtml(renderedGroupAst);
};

test("splits a rendered frame title at its last slash, the slash travelling with the file name", async () => {
  // Given
  const path = "stacks/aws/acme-development/eu-west-1/acm/stack.tm.hcl";
  // When
  const html = await render(`title="${path}"`);
  // Then
  assert.match(html, new RegExp(`<span class="title" title="${path}"><span class="title-dir">stacks/aws/acme-development/eu-west-1/acm</span><span class="title-name">/stack.tm.hcl</span></span>`));
});

test("wraps a bare file name as the name alone, and leaves an untitled block as Expressive Code rendered it", async () => {
  // When
  const bare = await render('title="mise.toml"');
  const untitled = await render("");
  // Then
  assert.match(bare, /<span class="title" title="mise\.toml"><span class="title-name">mise\.toml<\/span><\/span>/);
  assert.doesNotMatch(bare, /title-dir/);
  assert.match(untitled, /<figcaption class="header"><\/figcaption>/);
  assert.doesNotMatch(untitled, /title-name|title-dir/);
});

test("splits a rooted path, keeps a root-level or directory-only title whole, and skips a title that is not plain text", () => {
  // Given
  const text = (value) => ({ type: "text", value });
  const span = (children, properties = {}) => ({ type: "element", tagName: "span", properties, children });
  const rooted = span([text("/etc/hosts")]);
  const rootLevel = span([text("/hosts")]);
  const directory = span([text("stacks/")]);
  const marked = span([text("a/"), { type: "element", tagName: "em", properties: {}, children: [text("b")] }]);
  const empty = span([]);
  // When / Then
  assert.equal(splitFrameTitle(rooted), true, "a rooted path has a directory (`/etc`) and a name");
  assert.deepEqual(rooted.children.map((child) => child.children[0].value), ["/etc", "/hosts"]);
  assert.equal(splitFrameTitle(rootLevel), true);
  assert.deepEqual(rootLevel.children.map((child) => child.properties.className[0]), ["title-name"]);
  assert.equal(splitFrameTitle(directory), true);
  assert.deepEqual(directory.children.map((child) => child.properties.className[0]), ["title-name"]);
  assert.equal(splitFrameTitle(marked), false);
  assert.equal(marked.properties.title, undefined);
  assert.equal(splitFrameTitle(empty), false);
});
