/**
 * Topics and categories are written as slugs in the content repositories
 * (`kubernetes`, `developer-tools`, `argocd`, `ai`), which is what a URL and
 * a filter key want. Shown as they are written they became labels: a page
 * headed "kubernetes", a chip reading "developer-tools", an Open Graph card
 * saying "argocd". This is the one place a slug becomes its display name.
 *
 * Proper names that the generic rule would get wrong are listed; anything
 * else is the slug with hyphens as spaces and the first letter raised
 * ("developer experience" → "Developer experience", "cost" → "Cost"). A new
 * category in a content repository therefore has a readable name on the day
 * it is written, and a wrong one is fixed here, once.
 */
const NAMED: Readonly<Record<string, string>> = {
  ai: "AI",
  argocd: "Argo CD",
  aws: "AWS",
  cicd: "CI/CD",
  "ci-cd": "CI/CD",
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

/** The display name of a topic or category slug. */
export function topicLabel(slug: string): string {
  const key = slug.trim().toLowerCase();
  if (key in NAMED) return NAMED[key];
  const words = key.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
