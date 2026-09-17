export const ownerName = "Oleksandr Ponomarov";

export const siteHost = "oponomarov.com";

/**
 * The page background of each theme as sRGB hex, for the theme-color meta
 * (browser chrome cannot read a custom property). They mirror
 * --p-neutral-75 and --p-ink-950 in tokens.css.
 */
export const themeColors = { light: "#f4f5f7", dark: "#0b1220" } as const;

export const sectionNames = {
  portfolio: "Portfolio",
  blog: "Engineering Notes",
  dotfiles: "Dotfiles",
  contact: "Contact",
} as const;

export type SiteSection = keyof typeof sectionNames;

/** The brand path the header, the footer and the Open Graph cards print. */
export const sectionPath = (section: SiteSection) => `~/oleksandr-ponomarov/${section === "blog" ? "notes" : section}`;

/** The footer's one-line note per section. */
export const sectionNotes = {
  portfolio: "Case studies from building infrastructure platforms and reliable delivery systems.",
  blog: "Field notes on infrastructure, reliability, delivery, and the tools around them.",
  dotfiles: "A reproducible workstation and the reasoning behind it.",
  contact: "One shared contact point for the portfolio, engineering notes, and Dotfiles.",
} as const;

/**
 * Meta descriptions of the engine's own pages (the ones with no content
 * entry behind them). The pages and their Open Graph cards read the same
 * string, so the two can never drift apart.
 */
export const pageDescriptions = {
  home: "Platform & Site Reliability Engineer — case studies from building the infrastructure backbone of an industrial IoT company.",
  blog: "A home for poorly researched ideas that I find myself repeating a lot anyway.",
  contact: "For roles, collaborations, technical conversations, or questions about something I’ve published, choose the channel that fits.",
} as const;

/** A topic page's description: what is filed there and the newest notes,
    so the snippet says something ("Notes filed under argocd." was 25
    characters and said nothing a search result could use). */
export function categoryDescription(label: string, titles: readonly string[]): string {
  const count = titles.length;
  const lead = `${count} engineering ${count === 1 ? "note" : "notes"} on ${label} by ${ownerName}`;
  /* Two newest titles when they fit a 160-character snippet, else one. */
  for (const take of [2, 1]) {
    const newest = titles.slice(0, take).map((title) => `“${title}”`).join(" and ");
    const text = `${lead}, newest: ${newest}.`;
    if (newest && text.length <= 160) return text;
  }
  return `${lead}.`;
}

/** The document title: the page first, then its section, then the site.
    Ten open tabs, a history list and a search result all show the start of
    the title, and with the site name first they all read "Oleksandr
    Ponomarov - Engineering Notes - ..." to the same cut. A hub page (a
    section's own root) has no page title and keeps the name first. */
export function documentTitle(section: SiteSection, pageTitle?: string) {
  return pageTitle ? [pageTitle, sectionNames[section], ownerName].join(" - ") : `${ownerName} - ${sectionNames[section]}`;
}
