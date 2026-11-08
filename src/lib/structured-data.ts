import { ownerEmail, ownerName, ownerProfiles, ownerRole, sectionNames, siteOrigin, type SiteSection } from "./site-metadata";

/**
 * The JSON-LD graph every indexable page carries. The meta tags already say
 * what a page is called and what it shows when shared; this says who wrote
 * it, when, and where it sits in the site, in the vocabulary search engines
 * and AI assistants read when they decide whose page an answer came from.
 *
 * One Person and one WebSite, under fixed @ids, appear on every page, so a
 * crawler that reads any single page learns the same author and the same
 * site, and every article points at that author rather than repeating a name.
 */
export interface StructuredDataInput {
  readonly section: SiteSection;
  readonly canonical: URL;
  readonly title: string;
  readonly description: string;
  readonly image: URL;
  readonly isSectionRoot: boolean;
  readonly article: boolean;
  readonly publishedTime?: Date;
  readonly tags?: readonly string[];
}

const personId = `${siteOrigin}/#person`;
const websiteId = `${siteOrigin}/#website`;

const sectionRoots: Record<SiteSection, string> = { portfolio: "/", blog: "/blog/", dotfiles: "/dotfiles/", contact: "/contact/" };

/* What kind of document each section's articles are: a note is a blog post,
   a manual is technical documentation, a case study is an article. */
const articleTypes: Record<SiteSection, string> = { portfolio: "Article", blog: "BlogPosting", dotfiles: "TechArticle", contact: "Article" };

export function structuredData(input: StructuredDataInput): Record<string, unknown> {
  const { section, canonical, title, description, image, isSectionRoot } = input;
  const url = canonical.href;
  const isHome = canonical.pathname === "/";
  /* A Dotfiles manual is an article in all but the prop: the layout keeps
     `article` for the pages that carry a date and an author line. */
  const isArticle = input.article || (section === "dotfiles" && !isSectionRoot);

  const person = {
    "@type": "Person",
    "@id": personId,
    name: ownerName,
    url: `${siteOrigin}/`,
    jobTitle: ownerRole,
    email: `mailto:${ownerEmail}`,
    /* The Polish spelling: this is never rendered, so the mono face's Latin
       subset (which the contact page's meta line works around) is moot. */
    address: { "@type": "PostalAddress", addressLocality: "Wrocław", addressCountry: "PL" },
    sameAs: [...ownerProfiles],
  };
  const website = {
    "@type": "WebSite",
    "@id": websiteId,
    url: `${siteOrigin}/`,
    name: ownerName,
    inLanguage: "en",
    author: { "@id": personId },
    publisher: { "@id": personId },
  };

  const page: Record<string, unknown> = isArticle
    ? {
        "@type": articleTypes[section],
        "@id": `${url}#article`,
        url,
        mainEntityOfPage: url,
        headline: title,
        description,
        image: image.href,
        inLanguage: "en",
        author: { "@id": personId },
        publisher: { "@id": personId },
        isPartOf: { "@id": websiteId },
        ...(input.publishedTime && { datePublished: input.publishedTime.toISOString() }),
        ...(input.tags?.length && { keywords: input.tags.join(", ") }),
      }
    : {
        /* The homepage is the owner's profile; Google reads ProfilePage
           with a Person as its main entity as "this page is about them". */
        "@type": isHome ? "ProfilePage" : section === "contact" ? "ContactPage" : "CollectionPage",
        "@id": `${url}#webpage`,
        url,
        name: title,
        description,
        image: image.href,
        inLanguage: "en",
        isPartOf: { "@id": websiteId },
        ...((isHome || section === "contact") && { mainEntity: { "@id": personId } }),
      };

  /* Home, then the section, then the page; the homepage and a section root
     a step from home need no trail. */
  const crumbs: { name: string; path: string }[] = [{ name: ownerName, path: "/" }];
  if (sectionRoots[section] !== "/" && canonical.pathname !== "/") crumbs.push({ name: sectionNames[section], path: sectionRoots[section] });
  if (!isSectionRoot && canonical.pathname !== "/") crumbs.push({ name: title, path: canonical.pathname });
  const breadcrumbs = crumbs.length > 1
    ? [{
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumbs`,
        itemListElement: crumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.name, item: new URL(crumb.path, siteOrigin).href })),
      }]
    : [];

  return { "@context": "https://schema.org", "@graph": [person, website, page, ...breadcrumbs] };
}

/** JSON for a <script type="application/ld+json">: `<` is escaped so no
    title or description can close the script element early. */
export const serializeStructuredData = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
