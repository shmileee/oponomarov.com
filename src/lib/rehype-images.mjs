/**
 * Article images load lazily and decode off the main thread, so a note with
 * a dozen screenshots does not fetch them all before the first paragraph
 * paints. The first image in a document is left eager: it is the one most
 * likely to sit in the first viewport, where lazy loading only delays it.
 * Authors never have to remember either attribute, and an authored value is
 * respected.
 *
 * Two shapes occur. A Markdown image (`![alt](src)`) arrives as an <img>
 * element. An authored figure (`<figure class="media-figure"><img …>`) arrives
 * as Astro leaves block HTML: an opaque `raw` node holding the tag as text, so
 * those are rewritten in place. Fenced code is never touched: a code block is
 * an element tree whose text is text, not raw HTML.
 */
const IMG_TAG = /<img\b([^>]*?)(\s*\/?)>/gi;

export default function rehypeImages() {
  /** @param {import("hast").Root} tree */
  return (tree) => {
    let seen = 0;
    const decorate = (attributes) => {
      seen += 1;
      let out = attributes;
      if (!/\sdecoding=/i.test(out)) out += ' decoding="async"';
      if (seen > 1 && !/\sloading=/i.test(out)) out += ' loading="lazy"';
      return out;
    };
    /** @param {import("hast").Parents} parent */
    const walk = (parent) => {
      for (const node of parent.children) {
        if (node.type === "raw" && /<img\b/i.test(node.value)) {
          node.value = node.value.replace(IMG_TAG, (tag, attributes, close) => `<img${decorate(attributes)}${close}>`);
          continue;
        }
        if (node.type !== "element") continue;
        if (node.tagName === "img") {
          seen += 1;
          node.properties.decoding ??= "async";
          if (seen > 1) node.properties.loading ??= "lazy";
        }
        if ("children" in node) walk(node);
      }
    };
    walk(tree);
  };
}
