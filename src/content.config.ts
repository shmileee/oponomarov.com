import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const PF_ROOT = process.env.PORTFOLIO_DIR ?? "./content/portfolio";
const BL_ROOT = process.env.BLOG_DIR ?? "./content/blog";
const DF_ROOT = process.env.DOTFILES_DIR ?? "./content/dotfiles";

const caseStudies = defineCollection({
  loader: glob({ pattern: "**/index.md", base: `${PF_ROOT}/content/case-studies` }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    role: z.string().optional(),
    evidence: z.string().optional(),
    topics: z.array(z.string()),
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
    links: z.array(z.object({ study: z.string(), label: z.string() })),
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
  }),
});

const docs = defineCollection({
  loader: glob({ pattern: "*.md", base: `${DF_ROOT}/docs/content` }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    template: z.string().optional(),
    editUrl: z.url().optional(),
  }),
});

export const collections = { caseStudies, home, arc, principles, posts, docs };
