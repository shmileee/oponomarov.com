import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getCollection } from "astro:content";
import satori from "satori";
import sharp from "sharp";
import { formatCaseNumber, loadCaseStudies } from "./case-studies";
import { uniqueCategories } from "./categories.mjs";
import { loadDocs } from "./docs";
import { plainText } from "./inline-markdown";
import { ogSlug } from "./og-path";
import { formatDate, slugForPost, sortPosts } from "./posts";
import { categoryDescription, ownerName, pageDescriptions, sectionPath, siteHost, type SiteSection } from "./site-metadata";
import { topicLabel, topicTag } from "./topic-labels";

/**
 * Open Graph cards, one per canonical page, rendered at build time by
 * src/pages/og/[...slug].png.ts. A shared note or manual used to post to
 * Slack or LinkedIn with no preview at all, and every portfolio page shared
 * one static image; now each page carries its own card: the section's brand
 * path, the kicker the page itself shows, the title in the display face,
 * and the dek.
 *
 * The card is drawn in the site's light palette (previews render on white
 * timelines) from static instances of the site fonts under src/assets/og/:
 * satori needs TTF data, and the page fonts are variable WOFF2 files, so the
 * three weights the card uses were instanced once and committed (Bricolage
 * Grotesque 700, Public Sans 400, IBM Plex Mono 500).
 */
export interface OgCard {
  readonly section: SiteSection;
  readonly title: string;
  readonly description: string;
  readonly kicker?: string;
}

export { ogImagePath, ogSlug } from "./og-path";

let cached: Promise<Map<string, OgCard>> | undefined;

/** Every card the build emits, keyed by the slug in its image path. */
export function ogCards(): Promise<Map<string, OgCard>> {
  cached ??= (async () => {
    const cards = new Map<string, OgCard>();
    const add = (pathname: string, card: OgCard) => {
      const slug = ogSlug(pathname);
      const claimed = cards.get(slug);
      if (claimed) throw new Error(`Open Graph card slug "${slug}" is claimed by both "${claimed.title}" and "${card.title}".`);
      cards.set(slug, card);
    };

    add("/", { section: "portfolio", title: ownerName, description: pageDescriptions.home });
    add("/contact/", { section: "contact", title: "Let’s talk.", description: pageDescriptions.contact });
    add("/blog/", { section: "blog", title: "Engineering notes", description: pageDescriptions.blog });

    for (const study of await loadCaseStudies()) {
      add(study.href, {
        section: "portfolio",
        title: study.entry.data.title,
        description: plainText(study.entry.data.description ?? study.entry.data.summary),
        kicker: `Case study ${formatCaseNumber(study.number)}`,
      });
    }

    const posts = sortPosts(await getCollection("posts"));
    for (const post of posts) {
      add(`/blog/posts/${slugForPost(post)}/`, {
        section: "blog",
        title: post.data.title,
        description: plainText(post.data.description),
        kicker: formatDate(post.data.date, "display"),
      });
    }
    for (const category of uniqueCategories(posts.map((post) => post.data.categories))) {
      const filed = posts.filter((post) => post.data.categories.includes(category));
      const label = topicLabel(category);
      add(`/blog/categories/${category}/`, {
        section: "blog",
        title: topicTag(category),
        description: categoryDescription(label, filed.map((post) => post.data.title)),
        kicker: `Topic · ${filed.length} ${filed.length === 1 ? "note" : "notes"}`,
      });
    }

    for (const page of await loadDocs()) {
      add(page.href, {
        section: "dotfiles",
        title: page.title,
        description: plainText(page.entry.data.description),
        kicker: page.slug ? "Manual" : undefined,
      });
    }
    return cards;
  })();
  return cached;
}

/* OG_FONTS_DIR is defined in astro.config.mjs: the absolute path of src/assets/og/. */
const font = (file: string) => readFileSync(join(import.meta.env.OG_FONTS_DIR, file));
let fonts: { name: string; data: Buffer; weight: 400 | 500 | 700; style: "normal" }[] | undefined;

/* tokens.css's light palette, flattened to sRGB for the raster. */
const palette = {
  bg: "#f4f5f7",
  text: "#111827",
  muted: "#4b5563",
  accent: "#1d4ed8",
  border: "#d1d5db",
  cursor: "#f9423a",
};

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, ...children: (Node | string)[]): Node => ({
  type,
  props: { style: { display: "flex", ...style }, children: children.length === 1 ? children[0] : children },
});

/** Render one card to a 1200×630 PNG. */
export async function renderOgCard(card: OgCard): Promise<Uint8Array<ArrayBuffer>> {
  fonts ??= [
    { name: "Bricolage Grotesque", data: font("bricolage-700.ttf"), weight: 700, style: "normal" },
    { name: "Public Sans", data: font("public-sans-400.ttf"), weight: 400, style: "normal" },
    { name: "IBM Plex Mono", data: font("plex-mono-500.ttf"), weight: 500, style: "normal" },
  ];
  const title = clip(card.title, 110);
  /* The display size steps down with the title's length so a long note title
     keeps to three lines and a short one fills the card. */
  const titleSize = title.length > 70 ? 54 : title.length > 44 ? 62 : title.length > 26 ? 70 : 82;
  const eyebrow = [sectionPath(card.section), card.kicker].filter(Boolean).join("   ·   ");

  const tree = h("div", {
    flexDirection: "column", justifyContent: "space-between",
    width: "1200px", height: "630px", padding: "64px 72px",
    background: palette.bg, color: palette.text, fontFamily: "Public Sans",
  },
    h("div", { flexDirection: "column", gap: "32px" },
      h("div", { fontFamily: "IBM Plex Mono", fontSize: "22px", letterSpacing: "0.08em", color: palette.accent }, eyebrow),
      /* One flex item per word, wrapping like text, so the hero's cursor
         (frozen here) can follow the last word rather than the text box. */
      h("div", {
        flexWrap: "wrap", alignItems: "center", columnGap: `${Math.round(titleSize * 0.22)}px`,
        fontFamily: "Bricolage Grotesque", fontWeight: 700, fontSize: `${titleSize}px`, lineHeight: 1.04,
        letterSpacing: "-0.03em", maxWidth: "1040px",
      },
        ...title.split(/\s+/).map((word) => h("div", {}, word)),
        h("div", {
          width: `${Math.round(titleSize * 0.1)}px`, height: `${Math.round(titleSize * 0.78)}px`,
          marginTop: `${Math.round(titleSize * 0.06)}px`, marginLeft: `${Math.round(titleSize * 0.12) - Math.round(titleSize * 0.22)}px`,
          background: palette.cursor,
        }),
      ),
    ),
    h("div", { flexDirection: "column", gap: "36px" },
      h("div", { fontSize: "30px", lineHeight: 1.4, color: palette.muted, maxWidth: "1000px" }, clip(card.description, 150)),
      h("div", {
        justifyContent: "space-between", alignItems: "center", paddingTop: "28px",
        borderTop: `2px solid ${palette.border}`, fontFamily: "IBM Plex Mono", fontSize: "22px", color: palette.muted,
      },
        h("div", {}, siteHost),
        /* The author, unless the title already is. */
        h("div", { letterSpacing: "0.12em", textTransform: "uppercase" }, card.title === ownerName ? "" : ownerName),
      ),
    ),
  );

  const svg = await satori(tree as never, { width: 1200, height: 630, fonts });
  return new Uint8Array(await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer());
}
