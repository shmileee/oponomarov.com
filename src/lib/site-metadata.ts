export const ownerName = "Oleksandr Ponomarov";

export const sectionNames = {
  portfolio: "Portfolio",
  blog: "Engineering Notes",
  dotfiles: "Dotfiles",
  contact: "Contact",
} as const;

export type SiteSection = keyof typeof sectionNames;

export function documentTitle(section: SiteSection, pageTitle?: string) {
  return [ownerName, sectionNames[section], pageTitle].filter(Boolean).join(" - ");
}
