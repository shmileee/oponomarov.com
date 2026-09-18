/**
 * Topics and categories are written as slugs in the content repositories
 * (`kubernetes`, `devex`, `argocd`, `ai`), which is what a URL and
 * a filter key want. Shown as they are written they became labels: a page
 * headed "kubernetes", a chip reading "devex", an Open Graph card
 * saying "argocd". This is the one place a slug becomes its display name.
 *
 * Proper names that the generic rule would get wrong are listed; anything
 * else is the slug with hyphens as spaces and the first letter raised
 * ("cost" → "Cost", "gitops" → "Gitops" until listed). A new
 * category in a content repository therefore has a readable name on the day
 * it is written, and a wrong one is fixed here, once.
 */
const NAMED: Readonly<Record<string, string>> = {
  ai: "AI",
  argocd: "Argo CD",
  aws: "AWS",
  cicd: "CI/CD",
  "ci-cd": "CI/CD",
  devex: "DevEx",
  ecr: "ECR",
  eks: "EKS",
  gcp: "GCP",
  gitops: "GitOps",
  github: "GitHub",
  "github-actions": "GitHub Actions",
  iam: "IAM",
  kubernetes: "Kubernetes",
  kyverno: "Kyverno",
  linux: "Linux",
  macos: "macOS",
  mise: "mise",
  neovim: "Neovim",
  oidc: "OIDC",
  opencode: "OpenCode",
  "pre-commit": "pre-commit",
  terraform: "Terraform",
  tmux: "tmux",
  vpc: "VPC",
};

/** The display name of a topic or category slug, for titles and prose. */
export function topicLabel(slug: string): string {
  const key = slug.trim().toLowerCase();
  if (key in NAMED) return NAMED[key];
  const words = key.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The slug as a tag, the way it is shown wherever topics are listed in a
 * row or as an index: `terraform`, `devex`. A tag is the slug
 * itself, lower case with its hyphens, the identifier the content wrote and
 * the URL segment it links to, set in the site's metadata voice (small
 * muted mono, middle dots between tags) rather than as a hashtag, which is
 * a social network's idiom. The proper-name form above is for headings and
 * sentences. A portfolio topic may be written with spaces ("developer
 * experience"); a tag is one token, so they become hyphens.
 */
export function topicTag(slug: string): string {
  return slug.trim().toLowerCase().replace(/\s+/g, "-");
}
