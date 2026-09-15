import { getCollection, type CollectionEntry } from "astro:content";

/**
 * The case-study catalogue, derived entirely from the portfolio content.
 *
 * The content folder is the identity of a study: it is the URL slug, the
 * `data-open-study` key the homepage reader uses, and what the arc timeline
 * links to. Order comes from the optional `order` frontmatter field; studies
 * without one follow the ordered ones alphabetically, so a new folder appears
 * on the site the moment it exists and moves into place once it is numbered.
 * The displayed case number is the study's position in that order.
 *
 * `aliases` are old slugs (`12-the-fleet-that-patches-itself`, or an id the
 * reader once used) that still redirect here and still open the reader.
 */
export interface CaseStudy {
  readonly entry: CollectionEntry<"caseStudies">;
  /** Content folder under content/case-studies/, and the canonical slug. */
  readonly folder: string;
  /** 1-based position in the published order. */
  readonly number: number;
  readonly href: string;
  readonly aliases: readonly string[];
}

export const caseStudyFolder = (entry: CollectionEntry<"caseStudies">) => entry.id.replace(/\/index$/, "");

export const caseStudyHref = (folder: string) => `/case-studies/${folder}/`;

export const formatCaseNumber = (number: number) => String(number).padStart(2, "0");

const compareStudies = (a: CollectionEntry<"caseStudies">, b: CollectionEntry<"caseStudies">) => {
  const orderA = a.data.order ?? Number.POSITIVE_INFINITY;
  const orderB = b.data.order ?? Number.POSITIVE_INFINITY;
  if (orderA !== orderB) return orderA - orderB;
  return a.data.title.localeCompare(b.data.title, "en");
};

let cached: Promise<CaseStudy[]> | undefined;

export function loadCaseStudies(): Promise<CaseStudy[]> {
  cached ??= (async () => {
    const entries = (await getCollection("caseStudies")).sort(compareStudies);
    const studies = entries.map((entry, index) => ({
      entry,
      folder: caseStudyFolder(entry),
      number: index + 1,
      href: caseStudyHref(caseStudyFolder(entry)),
      aliases: entry.data.aliases,
    }));
    /* Every alias must be unique across the catalogue and must not shadow a
       real folder: a redirect that points two ways is a build error, not a
       page that resolves to whichever study won. */
    const claims = new Map<string, string>();
    for (const study of studies) {
      claims.set(study.folder, study.folder);
    }
    for (const study of studies) {
      for (const alias of study.aliases) {
        const owner = claims.get(alias);
        if (owner && owner !== study.folder) {
          throw new Error(`Case study "${study.folder}" declares alias "${alias}", which is already the folder or alias of "${owner}".`);
        }
        claims.set(alias, study.folder);
      }
    }
    return studies;
  })();
  return cached;
}

/** A study by folder, or a clear build error naming the reference that missed. */
export const requireCaseStudy = (studies: readonly CaseStudy[], folder: string, context: string): CaseStudy => {
  const study = studies.find((candidate) => candidate.folder === folder);
  if (!study) {
    const known = studies.map((candidate) => candidate.folder).join(", ");
    throw new Error(`${context} references case study "${folder}", which has no folder under content/case-studies/. Known folders: ${known}`);
  }
  return study;
};

/** Neighbours in the published order, wrapping at both ends. */
export const adjacentCaseStudies = (studies: readonly CaseStudy[], study: CaseStudy) => {
  const index = studies.indexOf(study);
  const previous = studies[(index - 1 + studies.length) % studies.length];
  const next = studies[(index + 1) % studies.length];
  return { previous, next };
};

/** Every topic used by any study, in the site's preferred order first and any new topic after, alphabetically. */
export const collectTopics = (studies: readonly CaseStudy[], preferredOrder: readonly string[]) => {
  const used = new Set(studies.flatMap((study) => study.entry.data.topics));
  const preferred = preferredOrder.filter((topic) => used.has(topic));
  const rest = [...used].filter((topic) => !preferredOrder.includes(topic)).sort((a, b) => a.localeCompare(b, "en"));
  return [...preferred, ...rest];
};
