import assert from "node:assert/strict";
import { test } from "node:test";
import rehypeTokenLinks, { isTokenOnlyLink, markRawTokenLinks } from "./rehype-token-links.mjs";

const element = (tagName, children = [], properties = {}) => ({ type: "element", tagName, properties, children });
const text = (value) => ({ type: "text", value });
const raw = (value) => ({ type: "raw", value });
const root = (...children) => ({ type: "root", children });
const transform = (tree) => rehypeTokenLinks()(tree);

test("a link that is one code span is a token link; one that also carries words is not", () => {
  // Given
  const tokenOnly = element("a", [element("code", [text("terraform apply")])], { href: "/x" });
  const withArrow = element("a", [text(" "), element("code", [text("main.tf")]), element("span", [text("↗")], { ariaHidden: "true" })], { href: "/y" });
  const mixed = element("a", [text("the official "), element("code", [text("Application")]), text(" specification")], { href: "/z" });
  const twoCodes = element("a", [element("code", [text("a")]), element("code", [text("b")])], { href: "/w" });
  const tree = root(element("p", [tokenOnly, withArrow, mixed, twoCodes]));
  // When
  transform(tree);
  // Then
  assert.equal(tokenOnly.properties.dataTokenLink, true);
  assert.equal(withArrow.properties.dataTokenLink, true);
  assert.equal(mixed.properties.dataTokenLink, undefined);
  assert.equal(twoCodes.properties.dataTokenLink, undefined);
  assert.equal(isTokenOnlyLink(element("a", [])), false, "an empty link is not a token link");
});

test("authored block HTML is marked in place, and an existing mark is not doubled", () => {
  const card = '<section class="surface-grid"><div><a class="path-token" href="#"><code class="path-token">mise/<wbr>config.toml</code></a><p>Read <a href="/d">the <code>docs</code> page</a>.</p></div></section>';
  assert.equal(
    markRawTokenLinks(card),
    '<section class="surface-grid"><div><a class="path-token" href="#" data-token-link><code class="path-token">mise/<wbr>config.toml</code></a><p>Read <a href="/d">the <code>docs</code> page</a>.</p></div></section>',
  );
  const arrow = '<a href="https://x"><code>repo</code> <span aria-hidden="true">↗</span></a>';
  assert.equal(markRawTokenLinks(arrow), '<a href="https://x" data-token-link><code>repo</code> <span aria-hidden="true">↗</span></a>');
  assert.equal(markRawTokenLinks(markRawTokenLinks(arrow)), markRawTokenLinks(arrow));
});

test("authored inline HTML split across sibling nodes is marked on its opening tag", () => {
  // Given: <li>Store it at <a class="path-token" href="#"><code>a/<wbr>b</code></a>.</li> as Astro leaves it.
  const open = raw('<a class="path-token" href="#">');
  const li = element("li", [text("Store it at "), open, raw("<code>"), text("~/.config/"), raw("<wbr>"), text("secrets"), raw("</code>"), raw("</a>"), text(".")]);
  const mixedOpen = raw('<a href="#">');
  const mixedLi = element("li", [mixedOpen, text("read the "), raw("<code>"), text("docs"), raw("</code>"), raw("</a>")]);
  const tree = root(element("ul", [li, mixedLi]));
  // When
  transform(tree);
  // Then
  assert.equal(open.value, '<a data-token-link class="path-token" href="#">');
  assert.equal(mixedOpen.value, '<a href="#">', "words before the code span keep the link a text link");
});

test("fenced code is never scanned", () => {
  const link = element("a", [element("code", [text("x")])], { href: "/" });
  const tree = root(element("pre", [element("code", [link])]));
  transform(tree);
  assert.equal(link.properties.dataTokenLink, undefined);
});
