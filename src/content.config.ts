import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const PF_ROOT = process.env.PORTFOLIO_DIR ?? "./content/portfolio";
const BL_ROOT = process.env.BLOG_DIR ?? "./content/blog";
const DF_ROOT = process.env.DOTFILES_DIR ?? "./content/dotfiles";

/* A slug segment: what a content folder is called and what an alias may be. */
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase slug (letters, digits, single hyphens)");

const caseStudies = defineCollection({
  loader: glob({ pattern: "**/index.md", base: `${PF_ROOT}/content/case-studies` }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    /* The meta and Open Graph description when the one-line summary is too
       short to stand as a snippet (under 50 characters says nothing a search
       result can use). Falls back to the summary. */
    description: z.string().optional(),
    role: z.string().optional(),
    evidence: z.string().optional(),
    /* When the work happened: a year, or a range with an en dash
       (`2022–2024`, `2023–present`). Shown in the study's metadata line and
       in the reader; the studies carry no dates otherwise. */
    period: z.string().regex(/^\d{4}(–(\d{4}|present))?$/, "a year, or a range with an en dash: 2022–2024").optional(),
    /* Series links by folder name. Declaring one side is enough — the other
       study gets the reverse link at build time (src/lib/case-study-series.mjs). */
    prequel: slug.optional(),
    sequel: slug.optional(),
    topics: z.array(z.string()).min(1),
    /* Position in the published order (src/lib/case-studies.ts). Optional so
       a new folder builds before it is numbered; unnumbered studies follow
       the numbered ones alphabetically. */
    order: z.number().int().positive().optional(),
    /* Old slugs that redirect to this study and still open it in the
       homepage reader: `12-the-fleet-that-patches-itself`, `fleet-patching`. */
    aliases: z.array(slug).default([]),
    featured: z.boolean().default(false),
    spotlight: z.boolean().default(false),
    spotlightProof: z.string().optional(),
    cardLabel: z.string().optional(),
  }),
});

const home = defineCollection({
  loader: glob({ pattern: "*.md", base: `${PF_ROOT}/content/home` }),
  schema: z.object({
    key: z.string(),
    eyebrow: z.string().optional(),
    title: z.string().optional(),
    primaryCta: z.string().optional(),
    primaryHref: z.string().optional(),
    secondaryCta: z.string().optional(),
    secondaryHref: z.string().optional(),
  }),
});

const arc = defineCollection({
  loader: glob({ pattern: "*.md", base: `${PF_ROOT}/content/arc` }),
  schema: z.object({
    number: z.number(),
    /* `study` is the case-study folder (its slug); src/pages/index.astro
       fails the build with the offending reference if no such folder exists. */
    links: z.array(z.object({ study: slug, label: z.string() })),
  }),
});

const principles = defineCollection({
  loader: glob({ pattern: "*.md", base: `${PF_ROOT}/content/principles` }),
  schema: z.object({ number: z.number(), title: z.string() }),
});

const posts = defineCollection({
  loader: glob({ pattern: "*.md", base: `${BL_ROOT}/content/posts` }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    categories: z.union([z.string(), z.array(z.string())]).transform((value) => Array.isArray(value) ? value : [value]),
    /* Old slugs that redirect to this post. A post's slug is its file name
       without the date, so renaming the file changes the URL; the old name
       goes here and keeps resolving (src/lib/posts.ts, postRoutes). */
    aliases: z.array(slug).default([]),
  }),
});

const docs = defineCollection({
  loader: glob({ pattern: "*.md", base: `${DF_ROOT}/docs/content` }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /* Position in the manual sequence (src/lib/docs.ts): the overview is
       always first; the rest follow their `order`, then any unnumbered
       manual alphabetically by title. */
    order: z.number().int().positive().optional(),
    template: z.string().optional(),
    editUrl: z.url().optional(),
  }),
});

export const collections = { caseStudies, home, arc, principles, posts, docs };
