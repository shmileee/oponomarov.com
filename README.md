# oponomarov.com — unified site engine

Single Astro engine that renders **oponomarov.com** from three separate
content repositories. The engine owns all templates, styles, routing, search
(Pagefind), RSS, sitemap, and build/verification logic; the content repos own
nothing but Markdown (plus static assets).

## Architecture

One engine, three content repos pulled at build time:

| Repo                 | Contributes                                             | Content root inside repo |
| -------------------- | ------------------------------------------------------- | ------------------------ |
| `shmileee/portfolio` | `caseStudies`, `home`, `arc`, `principles` collections  | `content/`               |
| `shmileee/blog`      | `posts` collection + static assets                      | `content/`               |
| `shmileee/dotfiles`  | `docs` collection                                       | `docs/content/`          |

`src/content.config.ts` resolves every collection from three env-overridable
repo-root variables (each pointing at a **content-repo checkout root**):

| Env var         | Default               |
| --------------- | --------------------- |
| `PORTFOLIO_DIR` | `./content/portfolio` |
| `BLOG_DIR`      | `./content/blog`      |
| `DOTFILES_DIR`  | `./content/dotfiles`  |

In CI, the deploy workflow (`.github/workflows/deploy.yaml`) checks the three
public repos out tokenlessly into `content/{portfolio,blog,dotfiles}` — the
defaults — builds, and publishes `dist/` to GitHub Pages. Content repos ping
the engine via `repository_dispatch` using the `ci-templates/notify-engine.yaml`
template (per-repo: `portfolio-updated` + `main`, `blog-updated` + `main`,
`dotfiles-updated` + `master`).

## Local development

Place checkouts of the three content repos at the default roots (clone or sync
them into `content/`), or point the env vars at existing checkouts/worktrees:

```sh
# Option A: defaults — clones/checkouts living inside the engine repo
#   content/portfolio, content/blog, content/dotfiles  (git-ignored)

# Option B: env-var worktree overrides
export PORTFOLIO_DIR=/abs/path/to/portfolio-worktrees/astro-content
export BLOG_DIR=/abs/path/to/blog-worktrees/astro-content
export DOTFILES_DIR=/abs/path/to/dotfiles-worktrees/astro-content
```

`npm run dev` and `npm run build` automatically run `scripts/sync-content.mjs`
first (`predev`/`prebuild`): it validates the content roots (fails loudly if a
root is missing) and idempotently materializes public assets.

| Command                     | Port | Purpose                              |
| --------------------------- | ---- | ------------------------------------ |
| `npm run dev`               | 4321 | dev server                           |
| `npm run preview`           | 4325 | preview of `dist/`                   |
| integration gate (`preview --port 4326`) | 4326 | migration verification gate + curl probes |

Verification: `npm run check` (astro check — only meaningful with valid
content roots), `npm run build`, `npm run verify` (`scripts/verify-build.mjs`,
content-derived counts + snapshot checks).

## Adoption script (`scripts/convert-origins.mjs`)

Adopts the verified POC-converted content into a content-repo worktree at the
new layout (with catalog validation and fail-loud set-mismatch checks):

```sh
npm run convert-origins -- --repo <portfolio|blog|dotfiles> --target <abs-worktree> --poc <abs-poc-root>
```

All three flags are required. Example:

```sh
npm run convert-origins -- --repo blog --target /abs/blog-worktrees/astro-content --poc /abs/astro-three-sites-poc
```

## Cutover checklist — MANUAL — not performed by this migration

The migration that produced this repo is strictly local: **pushing is blocked
for its entire duration** (a push-interlock replaces every origin push URL with
an invalid sentinel and installs blocking `pre-push` hooks), and **this engine
repo intentionally has zero remotes configured**. The CI workflows above are
authored but inert — no remote exists, nothing triggers them. Going live is
the ordered manual checklist below (order chosen so no step ever triggers a
knowingly-failing workflow):

1. Review the three conversion branches (`feat/astro-content` in the
   portfolio/blog/dotfiles worktrees).
2. Create the EMPTY engine remote repo `shmileee/oponomarov.com` on GitHub
   (no push yet).
3. Create a fine-grained PAT (Contents: write on `shmileee/oponomarov.com`)
   and store it as the `ENGINE_DISPATCH_TOKEN` secret in each content repo.
4. Merge/push the conversion branches to the origin default branches — their
   notify workflows now dispatch successfully; the engine repo simply has no
   deploy workflow yet, so the dispatches are inert.
5. Verify fresh default-branch clones contain the new layout.
6. Connect the engine to its new remote —
   `git remote add origin git@github.com:shmileee/oponomarov.com.git`
   (this is the ONE place a remote is ever added, and it is a MANUAL cutover
   step; the migration itself never runs it).
7. STAGED engine push so the first deploy run cannot fail on unconfigured
   Pages: push engine history UP TO the commit BEFORE the workflows commit —
   `git push origin <sha-of-commit-before-'feat(engine): author inert deploy and notify workflows plus README'>:refs/heads/main`
   (identify the SHA via `git log --oneline`; the refspec push does not set
   upstream tracking).
8. Enable GitHub Pages (source: GitHub Actions) + custom domain
   `oponomarov.com` in the engine repo settings.
9. Push the remaining commits explicitly with `git push -u origin main` — the
   deploy workflow goes live against configured Pages and builds from the
   converted default branches.
10. Configure the subdomain redirects.

Never commit real tokens anywhere; `ENGINE_DISPATCH_TOKEN` exists only as a
repo secret created in step 3.
