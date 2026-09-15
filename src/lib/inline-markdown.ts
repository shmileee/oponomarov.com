/**
 * Frontmatter strings (a study's summary, role and evidence; a post's
 * description) are prose, and authors write them as they write the body:
 * `terraform apply` in backticks, **emphasis** in asterisks. Rendered as plain
 * text those marks came out literally ("`terraform apply`" on a card and in a
 * dek). This is the whole inline grammar such a string may carry: code spans
 * and strong emphasis. Anything else stays as written, and every character
 * is HTML-escaped before the two marks become elements, so a summary can
 * never inject markup.
 */

import { CHAR_WIDTH, CONTEXT_INSET, isLongInlineCode } from "./inline-code.mjs";

/** Where a rendered string lands, for the long-span mark (inline-code.mjs). */
export interface InlineContext {
  readonly insets?: readonly (keyof typeof CONTEXT_INSET)[];
  readonly size?: keyof typeof CHAR_WIDTH;
}

/** The two homes frontmatter strings have besides a body paragraph. */
export const inlineContexts = {
  /** An article or reader dek: `.prose--lede`. */
  lede: { size: "lede" },
  /** Case-card summaries and proof lists: small copy inside a padded card. */
  card: { insets: ["card"], size: "small" },
} as const satisfies Record<string, InlineContext>;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);

/** HTML for an inline-only Markdown string. A span too long to hold
    unbroken on a phone where the string lands carries `data-long`, as
    rehype-inline-code marks the same span in a body (inline-code.mjs has
    the model). */
export const renderInline = (value: string, context: InlineContext = {}) =>
  escapeHtml(value)
    .replace(/`([^`\n]+)`/g, (_match, code: string) => `<code${isLongInlineCode(code, context) ? " data-long" : ""}>${code}</code>`)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");

/** The same string with the marks removed, for <title>, meta and aria text. */
export const plainText = (value: string) =>
  value.replace(/`([^`\n]+)`/g, "$1").replace(/\*\*([^*\n]+)\*\*/g, "$1");
