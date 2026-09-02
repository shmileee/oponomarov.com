import type { CollectionEntry } from "astro:content";

export const docsNavigation = [
  { slug: "", label: "Overview", description: "What the workstation includes" },
  { slug: "setup", label: "Setup", description: "Review, install, and reconcile" },
  { slug: "shortcuts", label: "Shortcuts", description: "Keyboard reference by layer" },
  { slug: "opencode", label: "OpenCode", description: "Agents, routing, and notifications" },
] as const;

export const docsHref = (slug: string) => slug ? `/dotfiles/${slug}/` : "/dotfiles/";

export const docsSlug = (entry: CollectionEntry<"docs">) => entry.id.replace(/\.md$/, "").replace(/^index$/, "");
