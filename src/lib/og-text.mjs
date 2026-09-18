/**
 * Text fitting for the Open Graph cards (src/lib/og.ts).
 *
 * A card has room for about three lines of dek and three of title, and a
 * preview is read at a glance, so a text that does not fit is cut where a
 * reader would expect: at the end of a sentence when one ends late enough,
 * otherwise at the last word, never in the middle of one. Trailing
 * punctuation before the ellipsis is dropped so "…, …" cannot appear.
 */

/**
 * @param {string} value
 * @param {number} max the most characters the card can show
 * @returns {string} the value, or a prefix of it ending in a full sentence or in a word and an ellipsis
 */
export const fitText = (value, max) => {
  const text = value.trim();
  if (text.length <= max) return text;
  const room = text.slice(0, max - 1);
  const floor = Math.floor(max * 0.6);
  const sentenceEnd = Math.max(room.lastIndexOf(". "), room.lastIndexOf("! "), room.lastIndexOf("? "));
  if (sentenceEnd >= floor) return room.slice(0, sentenceEnd + 1);
  const wordEnd = room.lastIndexOf(" ");
  const trimEnd = (s) => s.replace(/[\s,;:(\-–—]+$/, "");
  /* A dangling one- or two-letter word ("a", "of", "to") before the ellipsis
     reads as a stumble; the cut moves back one word. */
  const kept = trimEnd(trimEnd(wordEnd >= floor ? room.slice(0, wordEnd) : room).replace(/\s+[A-Za-z]{1,2}$/, ""));
  return `${kept}…`;
};
