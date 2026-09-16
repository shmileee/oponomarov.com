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

Nothing about the set of pages is written down in the engine. Every route,
count, order and redirect is derived from the content at build time, so adding
or removing a case study, note or manual is a content commit and nothing else:

| Content | Ordering | Also read by the engine |
| --- | --- | --- |
| `content/case-studies/<folder>/index.md` | `order` (integer, optional; unnumbered studies follow alphabetically) — the displayed case number is the position in that order | `aliases` (old slugs and reader ids that redirect here and open the reader), `featured`, `spotlight`, `spotlightProof`, `cardLabel`, `role`, `evidence` |
| `content/arc/*.md` | `number` | `links[].study` names a case-study **folder**; an unknown folder fails the build with the offending reference |
| `content/posts/*.md` | `date`, newest first | `categories` → `/blog/categories/<category>/` |
| `docs/content/*.md` | `index.md` first, then `order`, then title | The adjacent Previous/Next cards follow this sequence |

`summary`, `role`, `evidence`, `spotlightProof` and every `description` are
inline Markdown: backticks and `**strong**` render, everything else is text.

Inline code is one token: a capsule never wraps, so `pre-commit` cannot split
at its hyphen. The build marks a span that would not fit a phone in its
context (about 30 characters in a paragraph, 26 in a list item, fewer in a
heading or a card) and lets only those wrap, at their spaces and slashes. So
a command or path longer than that reads best as a fenced block; in running
text it will wrap like a long URL.
The homepage topic filters are the union of every study's `topics`; the
spotlight section appears only when a study is marked `spotlight`.

Every canonical page also gets its own Open Graph card (`/og/<path>.png`,
1200×630) drawn at build time from the same frontmatter — section, kicker,
title and dek in the site's own faces — so a shared study, note, topic or
manual previews as itself. `src/lib/og.ts` lists the cards; `verify` fails
when a page's `og:image` points nowhere or a card has no page.

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
