#!/usr/bin/env node
/**
 * Code-column report: every code block whose longest line is wider than the
 * rendered desktop column, with the reason it is wide.
 *
 *   node scripts/qa/code-width.mjs [--max=71] [--strict] [dist]
 *
 * The column holds about 71 monospace characters at the desktop measure
 * (1440px, the current type scale); wider lines scroll inside their frame.
 * That is the right outcome for real program output and for a literal that
 * cannot be shortened, and the wrong one for the two causes the report
 * separates out:
 *
 *   url-in-comment  a comment carrying a URL — belongs in the prose as a link
 *   comment         a comment or transcript annotation that can be trimmed
 *   code            everything else: a literal, an output line, a long name
 *
 * `--strict` exits 1 when any url-in-comment line exists (the authoring
 * check, `npm run qa:code`); `npm run verify` runs the plain report, so a
 * comment in a content repository never blocks an engine deploy. The measurement is static, so a
 * change to the type scale or the column width means re-measuring the column
 * (scripts/qa/measure.mjs reports the rendered width) and updating the
 * default here.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.find((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
const max = Number(flag("max")?.split("=")[1] ?? 71);
const strict = Boolean(flag("strict"));
const dist = resolve(args.find((arg) => !arg.startsWith("--")) ?? "dist");

const htmlFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return htmlFiles(path);
  return entry.name === "index.html" ? [path] : [];
});

const decode = (text) => text
  .replace(/<[^>]+>/g, "")
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/* A block is one <pre> inside .expressive-code; its lines are the .ec-line
   divs, each holding a .code div (and, with line numbers, a gutter). */
const blocksOf = (html) => [...html.matchAll(/<figure class="frame[^"]*">([\s\S]*?)<\/figure>/g)].map((match) => {
  const frame = match[1];
  const title = decode(frame.match(/<span class="title"[^>]*>([\s\S]*?)<\/span><\/span>/)?.[1] ?? "");
  const lines = [...frame.matchAll(/<div class="ec-line">([\s\S]*?)<\/div><\/div>/g)]
    .map((line) => decode(line[1].replace(/^[\s\S]*?<div class="code">/, "")).replace(/\s+$/, ""));
  return { title, lines };
});

/* A comment opener at the start of the line: `#` (not a tmux `#{` format or
   a `#[` style), `//`, `/*`, a SQL/Lua `-- ` (a `--flag` is not a comment),
   `<!--`, `;;`. */
const COMMENT = /^\s*(#(?!\{|\[)|\/\/|\/\*|-- |<!--|;;)/;
const kindOf = (line) => {
  if (!COMMENT.test(line)) return "code";
  return /https?:\/\//.test(line) ? "url-in-comment" : "comment";
};

const findings = [];
for (const file of htmlFiles(dist)) {
  if (!statSync(file).isFile()) continue;
  const route = `/${relative(dist, file).replace(/index\.html$/, "")}`;
  blocksOf(readFileSync(file, "utf8")).forEach(({ title, lines }, index) => {
    const longest = lines.reduce((best, line) => (line.length > best.length ? line : best), "");
    if (longest.length <= max) return;
    findings.push({ route, index, title, over: longest.length - max, length: longest.length, kind: kindOf(longest), excerpt: longest.trim().slice(0, 60) });
  });
}

const counts = { "url-in-comment": 0, comment: 0, code: 0 };
let lastRoute = "";
for (const finding of findings) {
  counts[finding.kind] += 1;
  if (finding.route !== lastRoute) {
    console.log(finding.route);
    lastRoute = finding.route;
  }
  const where = finding.title ? `${finding.title}` : `pre#${finding.index}`;
  console.log(`  ${finding.kind.padEnd(14)} ${String(finding.length).padStart(3)} chars (+${finding.over})  ${where}  | ${finding.excerpt}`);
}
console.log(`${findings.length} block(s) wider than ${max} columns: ${counts["url-in-comment"]} url-in-comment, ${counts.comment} comment, ${counts.code} code.`);
if (strict && counts["url-in-comment"] > 0) {
  console.error("A URL inside a code comment belongs in the prose as a link (docs/design-system.md §10).");
  process.exit(1);
}
