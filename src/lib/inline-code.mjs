/**
 * Legacy length estimate for the informational `data-long` attribute.
 * Rehype and frontmatter rendering keep this metadata, but prose.css now
 * lets every inline token reflow with its available space and text size.
 * Table cells follow their own scroll/stack policy. Neither relies on this
 * estimate to decide whether wrapping is safe.
 *
 * The constants below retain the original 320px layout model; they are
 * diagnostic estimates, not the current CSS typography contract.
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

/** True when the legacy model estimates a span would exceed its phone column. */
export const isLongInlineCode = (text, context) => !fitsInline(text, context);
