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
  contact: "Contact Oleksandr Ponomarov by email, LinkedIn, or GitHub.",
} as const;

export function documentTitle(section: SiteSection, pageTitle?: string) {
  return [ownerName, sectionNames[section], pageTitle].filter(Boolean).join(" - ");
}
