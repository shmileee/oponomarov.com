/* One command for a checkout that has nothing set up yet: find the three
   content repos, record them for direnv, install dependencies, then build,
   verify and serve dist/.

   The engine never hard-codes where content lives, so this resolves each root
   in the same precedence the rest of the tooling assumes:

     1. the environment (direnv's .envrc.local, or an explicit override),
     2. a checkout inside content/, which is what CI creates,
     3. a sibling checkout beside the engine, walking up the tree so that a
        git worktree one level deeper than the main clone still finds it.

   A root is only accepted when it holds the marker path that belongs to that
   repo, so discovery cannot latch onto an unrelated directory of the same
   name, and an override pointing somewhere wrong fails here by name rather
   than as a confusing error later in the build. */
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");

const ROOTS = [
  { variable: "PORTFOLIO_DIR", repo: "portfolio", marker: "content/case-studies" },
  { variable: "BLOG_DIR", repo: "blog", marker: "content/posts" },
  { variable: "DOTFILES_DIR", repo: "dotfiles", marker: "docs/content" },
];

const holdsMarker = (candidate, marker) => existsSync(join(candidate, marker));

/* Every directory from the engine's parent up to the filesystem root. */
const ancestorsOf = (start) => {
  const chain = [];
  for (let current = dirname(start); ; current = dirname(current)) {
    chain.push(current);
    if (dirname(current) === current) return chain;
  }
};

const locate = ({ variable, repo, marker }) => {
  const declared = process.env[variable];
  if (declared) {
    const path = resolve(projectRoot, declared);
    if (!holdsMarker(path, marker)) {
      throw new Error(`${variable} is set to ${declared}, which has no ${marker}/ inside it. Point it at the root of a ${repo} checkout, or unset it to search for one.`);
    }
    return { path, origin: "from the environment" };
  }
  const vendored = join(projectRoot, "content", repo);
  if (holdsMarker(vendored, marker)) return { path: vendored, origin: "checked out inside content/" };
  for (const ancestor of ancestorsOf(projectRoot)) {
    const sibling = join(ancestor, repo);
    if (holdsMarker(sibling, marker)) return { path: sibling, origin: "sibling checkout" };
  }
  throw new Error(`No ${repo} checkout found. Clone it beside this repository, or set ${variable} to the directory that holds ${marker}/.`);
};

let located;
try {
  located = ROOTS.map((root) => ({ ...root, ...locate(root) }));
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exit(1);
}

for (const { variable, path, origin } of located) {
  console.log(`${variable.padEnd(13)} ${path}  (${origin})`);
}

/* Recording the roots is what makes the next command work without this one:
   direnv exports them for `mise run dev`, and this file is git-ignored. An
   existing file is the developer's own and is never rewritten. */
const envrcLocal = join(projectRoot, ".envrc.local");
if (!existsSync(envrcLocal)) {
  const body = located.map(({ variable, path }) => `export ${variable}="${path}"`).join("\n");
  writeFileSync(envrcLocal, `# Written by \`mise run up\`. Machine-local and git-ignored; edit freely.\n${body}\n`);
  console.log(`\nWrote .envrc.local. Run \`direnv allow\` so \`mise run dev\` reads the same roots.`);
}

const environment = { ...process.env };
for (const { variable, path } of located) environment[variable] = path;

const step = (label, args) => {
  console.log(`\n\u2500\u2500 ${label}`);
  const { status } = spawnSync("npm", args, { cwd: projectRoot, env: environment, stdio: "inherit" });
  if (status !== 0) process.exit(status ?? 1);
};

if (!existsSync(join(projectRoot, "node_modules"))) step("installing dependencies", ["install"]);
/* build runs sync-content.mjs through its prebuild hook. */
step("building", ["run", "build"]);
step("verifying", ["run", "verify"]);
step("serving dist/", ["run", "preview"]);
