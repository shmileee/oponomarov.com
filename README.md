# oponomarov.com — site engine

Single Astro engine that renders **oponomarov.com** from three separate
content repositories. The engine owns all templates, styles, routing, search
(Pagefind), RSS, sitemap, and build/verification logic; the content repos own
nothing but Markdown (plus static assets).

## Architecture

One engine, three content repos pulled in at build time:

| Repo                 | Contributes                                            | Content root inside repo |
| -------------------- | ------------------------------------------------------ | ------------------------ |
| `shmileee/portfolio` | `caseStudies`, `home`, `arc`, `principles` collections | `content/`               |
| `shmileee/blog`      | `posts` collection + static assets                     | `content/`               |
| `shmileee/dotfiles`  | `docs` collection                                      | `docs/content/`          |

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

Environment is managed with [mise](https://mise.jdx.dev/) (node) and
[direnv](https://direnv.net/) (content roots). Machine-specific paths live in
`.envrc.local`, which is git-ignored:

```sh
cp .envrc.local.example .envrc.local  # edit paths to your checkouts
direnv allow
npm install
mise run dev
```

Without `.envrc.local`, the defaults apply — place checkouts of the three
content repos inside the engine at `content/{portfolio,blog,dotfiles}`
(git-ignored).

`npm run dev` and `npm run build` automatically run `scripts/sync-content.mjs`
first (`predev`/`prebuild`): it validates the content roots (fails loudly if a
root is missing) and idempotently materializes binary assets into
`public/case-studies/` and `public/blog-static/` (both git-ignored,
regenerated on every build).

| Command            | Port | Purpose                                     |
| ------------------ | ---- | ------------------------------------------- |
| `mise run dev`     | 4321 | sync content + dev server with live reload  |
| `mise run preview` | 4325 | sync + build + verify + serve `dist/`       |
| `mise run sync`    | —    | validate roots + materialize assets only    |

Verification: `npm run check` (astro check — only meaningful with valid
content roots), `npm run build`, `npm run verify` (`scripts/verify-build.mjs`,
content-derived counts + snapshot checks).
