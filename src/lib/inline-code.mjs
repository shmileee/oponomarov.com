/**
 * Inline code is one token: `pre-commit` must never split at its hyphen,
 * `terraform apply` must never leave `apply` on the next line, a path must
 * not break after a slash that happens to land at the line end. prose.css
 * therefore sets every capsule to `white-space: nowrap`.
 *
 * That is safe only while the token fits the narrowest line the site lays
 * out, which is the 320px viewport: a 280px column, less whatever the
 * token's context indents (a list item's 36px, an admonition's padding, a
 * card's padding), at the capsule size of the text around it (0.85 of the
 * body's 17px in a paragraph, of a card's 14px copy, of a 22px h3; the
 * scale is tokens.css's --code-inline-scale, kept in step by hand). The
 * build works that out per span (rehype-inline-code for Markdown and
 * authored HTML, inline-markdown.ts for frontmatter strings) and marks
 * every span that would not fit with `data-long`; those wrap the way a long
 * URL in running text does — at spaces, slashes and hyphens first, anywhere
 * as the last resort. Everything here is in CSS pixels at 320px.
 */

/** The reading column at 320px: the viewport less the two 20px gutters. */
export const FLOOR_COLUMN = 280;

/** A capsule's own horizontal chrome: 4px padding each side and a 1px border. */
export const CAPSULE_CHROME = 10;

/**
 * Advance of one IBM Plex Mono character (0.6em) at the capsule size
 * (--code-inline-scale, 0.85em) of each text size the ramp resolves to at
 * 320px.
 */
const CAPSULE_SCALE = 0.85;
export const CHAR_WIDTH = {
  body: CAPSULE_SCALE * 17 * 0.6, // paragraphs, list items, cells, admonitions: --text-base
  small: CAPSULE_SCALE * 14 * 0.6, // card and step copy: --text-sm
  lede: CAPSULE_SCALE * 19 * 0.6, // the article dek: --text-lg
  h1: CAPSULE_SCALE * 38 * 0.6, // (3xl + 4xl) / 2
  h2: CAPSULE_SCALE * 26 * 0.6, // (xl + 2xl) / 2
  h3: CAPSULE_SCALE * 22 * 0.6, // xl
  h4: CAPSULE_SCALE * 19 * 0.6, // lg
  h5: CAPSULE_SCALE * 17 * 0.6,
  h6: CAPSULE_SCALE * 17 * 0.6,
};

/** Horizontal room each enclosing context takes from the column at 320px. */
export const CONTEXT_INSET = {
  li: 36, // --list-indent (prose.css), per nesting level
  blockquote: 23, // 20px padding and the 3px rule
  dd: 24, // --space-6
  admonition: 42, // 20px padding and a 1px border, both sides
  tab: 42, // a tab panel's padding and border
  disclosure: 42, // a disclosure body's padding and border
  cell: 50, // 12px cell padding, 12px stacked-row padding, the region's border
  card: 42, // a surface-grid card's padding and border
  step: 100, // a step's padding plus its 40px marker column and 20px gap
};

/**
 * @param {string} text
 * @param {{ insets?: readonly (keyof typeof CONTEXT_INSET)[], size?: keyof typeof CHAR_WIDTH }} [context]
 */
export function fitsInline(text, { insets = [], size = "body" } = {}) {
  const available = FLOOR_COLUMN - insets.reduce((sum, name) => sum + (CONTEXT_INSET[name] ?? 0), 0);
  const characters = [...text.trim()].length;
  return characters * (CHAR_WIDTH[size] ?? CHAR_WIDTH.body) + CAPSULE_CHROME <= available;
}

/** True when a span's text is too long to be held unbroken on a phone in its context. */
export const isLongInlineCode = (text, context) => !fitsInline(text, context);
