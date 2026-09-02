import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const caseStudies = defineCollection({
  loader: glob({ pattern: "**/index.md", base: "./src/content/case-studies" }),
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
  loader: glob({ pattern: "*.md", base: "./src/content/home" }),
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
  loader: glob({ pattern: "*.md", base: "./src/content/arc" }),
  schema: z.object({
    number: z.number(),
    links: z.array(z.object({ study: z.string(), label: z.string() })),
  }),
});

const principles = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/principles" }),
  schema: z.object({ number: z.number(), title: z.string() }),
});

const posts = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    categories: z.union([z.string(), z.array(z.string())]).transform((value) => Array.isArray(value) ? value : [value]),
  }),
});

const docs = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/docs" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    template: z.string().optional(),
    editUrl: z.url().optional(),
  }),
});

export const collections = { caseStudies, home, arc, principles, posts, docs };
