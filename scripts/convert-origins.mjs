#!/usr/bin/env node
// convert-origins.mjs — content ADOPTION script (POC snapshot → origin worktree layout).
//
// The verified POC content was produced from the pinned origin HEADs and then
// editorially normalized and verified; re-transforming from origin sources
// cannot reproduce those passes. This script therefore ADOPTS the POC content
// into a content-repo worktree. It only WRITES content — deletions are the
// conversion todos' job. It never transforms markdown (except the pinned
// setup.md normalization below), never writes outside --target, and never
// regenerates src/styles/docs-content.css.
//
// Usage:
//   node scripts/convert-origins.mjs --repo <portfolio|blog|dotfiles> \
//     --target <abs-worktree> --poc <abs-poc-root>

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const SETUP_MD_SHA256 = "5634cc3d5d2e1dd981838108b3cb733b5968a61a1e831d95cdf76b18b2cc6821";
const ENGINE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOS = new Set(["portfolio", "blog", "dotfiles"]);

const USAGE = `Usage: node scripts/convert-origins.mjs --repo <portfolio|blog|dotfiles> --target <abs-worktree> --poc <abs-poc-root>

Adopts the verified POC content snapshot into a content-repo worktree.
All three flags are REQUIRED.

  --repo    which content repository the worktree belongs to:
            portfolio | blog | dotfiles
  --target  absolute path to the content-repo worktree to write into
  --poc     absolute path to the verified POC snapshot root (read only)

The script validates before writing (any validation failure exits 1 having
written nothing for the pre-write checks) and only ever writes inside --target.
`;

function usageError(message) {
  process.stderr.write(`error: ${message}\n\n${USAGE}`);
  process.exit(2);
}

function fail(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const flags = { repo: undefined, target: undefined, poc: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repo" || arg === "--target" || arg === "--poc") {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        usageError(`missing value for ${arg}`);
      }
      flags[key] = value;
      i += 1;
    } else {
      usageError(`unknown argument: ${arg}`);
    }
  }
  if (!flags.repo) usageError("missing required flag --repo");
  if (!REPOS.has(flags.repo)) {
    usageError(`invalid --repo "${flags.repo}" (expected portfolio, blog, or dotfiles)`);
  }
  if (!flags.target) usageError("missing required flag --target");
  if (!flags.poc) usageError("missing required flag --poc");
  if (!path.isAbsolute(flags.target)) usageError(`--target must be an absolute path (got "${flags.target}")`);
  if (!path.isAbsolute(flags.poc)) usageError(`--poc must be an absolute path (got "${flags.poc}")`);
  if (!isDirectory(flags.target)) usageError(`--target is not an existing directory: ${flags.target}`);
  if (!isDirectory(flags.poc)) usageError(`--poc is not an existing directory: ${flags.poc}`);
  return flags;
}

function isDirectory(p) {
  return fs.existsSync(p) && fs.statSync(p).isDirectory();
}

// ---------------------------------------------------------------------------
// File-set helpers
// ---------------------------------------------------------------------------

const isElevenTyData = (name) => name.endsWith(".11tydata.js");

/** Sorted relative POSIX paths of every regular file under root. */
function walkFiles(root, { exclude = () => false } = {}) {
  if (!isDirectory(root)) fail(`required directory is missing: ${root}`);
  const out = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(abs);
      } else if (!exclude(entry.name)) {
        out.push(path.relative(root, abs).split(path.sep).join("/"));
      }
    }
  };
  visit(root);
  return out.sort();
}

/** Top-level filenames in dir matching a suffix. */
function listFilenames(dir, suffix) {
  if (!isDirectory(dir)) fail(`required directory is missing: ${dir}`);
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => entry.name)
    .sort();
}

/** Exact set equality; on mismatch print every differing element and exit 1. */
function assertSetEquality(kind, labelA, itemsA, labelB, itemsB) {
  const setA = new Set(itemsA);
  const setB = new Set(itemsB);
  const onlyA = [...setA].filter((item) => !setB.has(item)).sort();
  const onlyB = [...setB].filter((item) => !setA.has(item)).sort();
  if (onlyA.length === 0 && onlyB.length === 0) return;
  const report = [
    `${kind} mismatch:`,
    `  only in ${labelA} (${onlyA.length}):`,
    ...onlyA.map((item) => `    ${item}`),
    `  only in ${labelB} (${onlyB.length}):`,
    ...onlyB.map((item) => `    ${item}`),
  ];
  fail(report.join("\n"));
}

function copyTree(src, dest, { exclude = () => false } = {}) {
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (source) => !exclude(path.basename(source)),
  });
}

// ---------------------------------------------------------------------------
// Case-study catalog parsing (portfolio)
// ---------------------------------------------------------------------------

/** Extract the bracket-balanced `const definitions = [ ... ]` span of a file. */
function extractDefinitionsSpan(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const marker = "const definitions = [";
  const start = text.indexOf(marker);
  if (start === -1) fail(`could not find "const definitions = [" in ${filePath}`);
  let depth = 0;
  for (let i = start + marker.length - 1; i < text.length; i += 1) {
    if (text[i] === "[") depth += 1;
    else if (text[i] === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(start + marker.length, i);
    }
  }
  fail(`unbalanced definitions array in ${filePath}`);
}

/**
 * Parse `<target>/src/_data/caseStudyCatalog.js` — object-literal entries of
 * the known shape `{ id: "...", folder: "...", legacyFolder: "..." }`.
 */
export function parseCatalogJs(filePath) {
  const span = extractDefinitionsSpan(filePath);
  const tuples = [];
  for (const match of span.matchAll(/\{[^{}]*\}/g)) {
    const block = match[0];
    const pick = (key) => {
      const found = block.match(new RegExp(`${key}\\s*:\\s*"([^"]*)"`));
      if (!found) fail(`catalog entry in ${filePath} is missing key "${key}": ${block.replace(/\s+/g, " ")}`);
      return found[1];
    };
    tuples.push({ id: pick("id"), folder: pick("folder"), legacyFolder: pick("legacyFolder") });
  }
  if (tuples.length === 0) fail(`no catalog entries parsed from ${filePath}`);
  return tuples;
}

/**
 * Parse the engine's `src/lib/catalog.ts` — tuple entries of the known shape
 * `["id", "folder", "legacyFolder"]`.
 */
export function parseCatalogTs(filePath) {
  const span = extractDefinitionsSpan(filePath);
  const tuples = [];
  for (const match of span.matchAll(/\[\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,?\s*\]/g)) {
    tuples.push({ id: match[1], folder: match[2], legacyFolder: match[3] });
  }
  if (tuples.length === 0) fail(`no catalog entries parsed from ${filePath}`);
  return tuples;
}

const tupleKey = (tuple) => JSON.stringify([tuple.id, tuple.folder, tuple.legacyFolder]);

// ---------------------------------------------------------------------------
// Pinned setup.md normalization (dotfiles)
// ---------------------------------------------------------------------------

/**
 * Apply the pinned setup.md normalization. The docs machinery is deleted on
 * the dotfiles conversion branch, so its mentions must go. Every edit is
 * anchor-checked; a missing anchor throws naming the anchor.
 */
export function normalizeSetupMd(text) {
  const lines = text.split("\n");
  const locate = (predicate, anchor, fromIndex = 0) => {
    for (let i = fromIndex; i < lines.length; i += 1) {
      if (predicate(lines[i])) return i;
    }
    throw new Error(`setup.md normalization anchor not found: ${anchor}`);
  };

  // (n1) Replace the mkdocs fork-note span with the engine-repo note.
  const anchorStart = "*   the documentation domain in `docs/mkdocs.yml`";
  const anchorEnd = "`edit_uri` in `docs/mkdocs.yml`;";
  const start = locate((line) => line.includes(anchorStart), anchorStart);
  const end = locate((line) => line.endsWith(anchorEnd), anchorEnd, start);
  lines.splice(start, end - start + 1,
    "*   the repository file links throughout `docs/content/`, now rendered by the",
    "    oponomarov.com engine repository;");

  // (n2) Drop the mise docs task rows.
  for (const anchor of ["| `mise run docs` |", "| `mise run docs:build` |"]) {
    const index = locate((line) => line.includes(anchor), anchor);
    lines.splice(index, 1);
  }

  // (n3) Drop the "Preview the documentation" section entirely.
  const previewAnchor = "### Preview the documentation";
  const reapplyAnchor = "## Reapply after an update";
  const previewIndex = locate((line) => line.trim() === previewAnchor, previewAnchor);
  const reapplyIndex = locate((line) => line.trim() === reapplyAnchor, reapplyAnchor, previewIndex);
  lines.splice(previewIndex, reapplyIndex - previewIndex);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Per-repo adoption
// ---------------------------------------------------------------------------

function runPortfolio(target, poc) {
  // PRE-WRITE VALIDATION — every check runs before any write.
  // (i) authoritative catalog (target) vs engine catalog: exact tuple-set equality.
  const targetCatalogPath = path.join(target, "src/_data/caseStudyCatalog.js");
  const engineCatalogPath = path.join(ENGINE_ROOT, "src/lib/catalog.ts");
  const targetTuples = parseCatalogJs(targetCatalogPath);
  const engineTuples = parseCatalogTs(engineCatalogPath);
  assertSetEquality(
    "case-study catalog tuple {id, folder, legacyFolder}",
    targetCatalogPath,
    targetTuples.map(tupleKey),
    engineCatalogPath,
    engineTuples.map(tupleKey),
  );

  // (ii) case-studies relative-path set equality (md files AND colocated assets).
  // (iii) same for home, arc, principles.
  for (const collection of ["case-studies", "home", "arc", "principles"]) {
    const targetDir = path.join(target, "src/content", collection);
    const pocDir = path.join(poc, "src/content", collection);
    assertSetEquality(
      `relative file paths under src/content/${collection} (excluding *.11tydata.js)`,
      targetDir,
      walkFiles(targetDir, { exclude: isElevenTyData }),
      pocDir,
      walkFiles(pocDir, { exclude: isElevenTyData }),
    );
  }

  // Adopt.
  fs.mkdirSync(path.join(target, "content"), { recursive: true });
  for (const collection of ["case-studies", "home", "arc", "principles"]) {
    copyTree(
      path.join(poc, "src/content", collection),
      path.join(target, "content", collection),
      { exclude: isElevenTyData },
    );
  }
  process.stdout.write(`portfolio: adopted case-studies, home, arc, principles into ${path.join(target, "content")}\n`);
}

function runBlog(target, poc) {
  // PRE-WRITE VALIDATION.
  // (i) post filename set equality.
  assertSetEquality(
    "post filenames",
    path.join(target, "jekyll/_posts"),
    listFilenames(path.join(target, "jekyll/_posts"), ".md"),
    path.join(poc, "src/content/posts"),
    listFilenames(path.join(poc, "src/content/posts"), ".md"),
  );
  // (ii) static asset relative-path set equality.
  assertSetEquality(
    "relative file paths under blog static assets",
    path.join(target, "jekyll/static"),
    walkFiles(path.join(target, "jekyll/static")),
    path.join(poc, "public/blog-static"),
    walkFiles(path.join(poc, "public/blog-static")),
  );

  // Adopt.
  fs.mkdirSync(path.join(target, "content"), { recursive: true });
  copyTree(path.join(poc, "src/content/posts"), path.join(target, "content/posts"));
  copyTree(path.join(poc, "public/blog-static"), path.join(target, "content/static"));
  process.stdout.write(`blog: adopted posts and static assets into ${path.join(target, "content")}\n`);
}

function runDotfiles(target, poc) {
  const targetDocs = path.join(target, "docs/content");
  const pocDocs = path.join(poc, "src/content/docs");

  // PRE-WRITE VALIDATION — doc filename set equality (the 4 manuals).
  const names = listFilenames(pocDocs, ".md");
  assertSetEquality(
    "doc filenames",
    targetDocs,
    listFilenames(targetDocs, ".md"),
    pocDocs,
    names,
  );

  // Adopt: overwrite each doc with the verified POC version.
  for (const name of names) {
    fs.copyFileSync(path.join(pocDocs, name), path.join(targetDocs, name));
  }

  // Pinned setup.md normalization + determinism check.
  const setupPath = path.join(targetDocs, "setup.md");
  let normalized;
  try {
    normalized = normalizeSetupMd(fs.readFileSync(setupPath, "utf8"));
  } catch (error) {
    fail(error.message);
  }
  fs.writeFileSync(setupPath, normalized);
  const digest = crypto.createHash("sha256").update(fs.readFileSync(setupPath)).digest("hex");
  if (digest !== SETUP_MD_SHA256) {
    fail(`setup.md determinism check failed: computed sha256 ${digest}, expected ${SETUP_MD_SHA256}`);
  }
  process.stdout.write(`dotfiles: adopted ${names.length} docs into ${targetDocs}; setup.md sha256 ${digest}\n`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
  const { repo, target, poc } = parseArgs(process.argv.slice(2));
  if (repo === "portfolio") runPortfolio(target, poc);
  else if (repo === "blog") runBlog(target, poc);
  else runDotfiles(target, poc);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) main();
