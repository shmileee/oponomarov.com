import assert from "node:assert/strict";
import { test } from "node:test";
import rehypeImages, { ARTICLE_SIZES } from "./rehype-images.mjs";

const element = (tagName, children = [], properties = {}) => ({ type: "element", tagName, properties, children });
const raw = (value) => ({ type: "raw", value });
const root = (...children) => ({ type: "root", children });
const manifest = {
  "/blog-static/shot.png": { width: 1654, height: 676, variants: [{ src: "/blog-static/shot.640.webp", width: 640 }, { src: "/blog-static/shot.960.webp", width: 960 }, { src: "/blog-static/shot.1654.webp", width: 1654 }] },
};
const transform = (tree) => rehypeImages({ manifest })(tree);

test("a Markdown image gets its dimensions, renditions and sizes from the manifest; the first is not lazy", () => {
  // Given
  const first = element("img", [], { src: "/blog-static/shot.png", alt: "A shot" });
  const second = element("img", [], { src: "/blog-static/shot.png", alt: "Again", width: 800 });
  const unknown = element("img", [], { src: "https://elsewhere.example/x.png", alt: "Away" });
  const tree = root(element("p", [first]), element("p", [second]), element("p", [unknown]));
  // When
  transform(tree);
  // Then
  assert.equal(first.properties.width, 1654);
  assert.equal(first.properties.height, 676);
  assert.equal(first.properties.srcSet, "/blog-static/shot.640.webp 640w, /blog-static/shot.960.webp 960w, /blog-static/shot.1654.webp 1654w");
  assert.equal(first.properties.sizes, ARTICLE_SIZES);
  assert.equal(first.properties.decoding, "async");
  assert.equal(first.properties.loading, undefined, "the first image is the likeliest first-screen image");
  assert.equal(second.properties.width, 800, "an attribute the author wrote wins");
  assert.equal(second.properties.height, 676);
  assert.equal(second.properties.loading, "lazy");
  assert.equal(unknown.properties.width, undefined);
  assert.equal(unknown.properties.srcSet, undefined);
  assert.equal(unknown.properties.loading, "lazy");
});

test("an authored figure in raw HTML is rewritten the same way", () => {
  // Given
  const node = raw('<figure class="media-exhibit"><div class="media-exhibit-frame"><img src="/blog-static/shot.png" alt="Shot" loading="eager"></div></figure>');
  const tree = root(raw('<p><img src="/blog-static/shot.png" alt="First" width="1654" height="676"></p>'), node);
  // When
  transform(tree);
  // Then
  assert.equal(
    node.value,
    `<figure class="media-exhibit"><div class="media-exhibit-frame"><img src="/blog-static/shot.png" alt="Shot" loading="eager" decoding="async" width="1654" height="676" srcset="/blog-static/shot.640.webp 640w, /blog-static/shot.960.webp 960w, /blog-static/shot.1654.webp 1654w" sizes="${ARTICLE_SIZES}"></div></figure>`,
  );
  assert.match(tree.children[0].value, /width="1654" height="676" decoding="async" srcset=/, "written dimensions are kept, renditions still added");
  assert.doesNotMatch(tree.children[0].value, /loading=/, "the first image stays eager");
});
