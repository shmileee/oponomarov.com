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

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);

/** HTML for an inline-only Markdown string. */
export const renderInline = (value: string) =>
  escapeHtml(value)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");

/** The same string with the marks removed, for <title>, meta and aria text. */
export const plainText = (value: string) =>
  value.replace(/`([^`\n]+)`/g, "$1").replace(/\*\*([^*\n]+)\*\*/g, "$1");
