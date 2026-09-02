export interface CaseStudyDefinition {
  id: string;
  folder: string;
  legacyFolder: string;
  number: number;
}

const definitions = [
  ["infrastructure-changes", "making-infrastructure-changes-boring", "01-making-infrastructure-changes-boring"],
  ["audited-approve", "approve-the-audited-escape-hatch", "02-approve-the-audited-escape-hatch"],
  ["self-service-buttons", "buttons-instead-of-incantations", "03-buttons-instead-of-incantations"],
  ["fast-feedback", "a-feedback-loop-measured-in-milliseconds", "04-a-feedback-loop-measured-in-milliseconds"],
  ["tool-versions", "one-tool-version-everywhere", "05-one-tool-version-everywhere"],
  ["self-service-teams", "teams-that-create-themselves", "06-teams-that-create-themselves"],
  ["terraform-product", "turning-a-terraform-repository-into-a-product", "07-turning-a-terraform-repository-into-a-product"],
  ["dependency-updates", "dependency-updates-from-quarterly-panic-to-background-noise", "08-dependency-updates-from-quarterly-panic-to-background-noise"],
  ["kubernetes-upgrades", "kubernetes-upgrades", "09-kubernetes-upgrades"],
  ["policy-engine", "kyverno-at-the-cluster-door", "10-kyverno-at-the-cluster-door"],
  ["kafka-topics", "kafka-topics-as-code", "11-kafka-topics-as-code"],
  ["fleet-patching", "the-fleet-that-patches-itself", "12-the-fleet-that-patches-itself"],
  ["network-rebuild", "the-network-nobody-dared-touch", "13-the-network-nobody-dared-touch"],
  ["ephemeral-environments", "environments-you-can-create-and-destroy-with-one-command", "14-environments-you-can-create-and-destroy-with-one-command"],
  ["nat-cost", "the-nat-bill-and-the-open-source-fix-i-helped-ship", "15-the-nat-bill-and-the-open-source-fix-i-helped-ship"],
  ["acquisition-migration", "absorbing-an-acquisition-one-engineer-one-summer-an-entire-product-moved", "16-absorbing-an-acquisition-one-engineer-one-summer-an-entire-product-moved"],
  ["registry-migration", "leaving-docker-hub-without-anyone-noticing", "17-leaving-docker-hub-without-anyone-noticing"],
  ["provider-fork", "the-fork-that-needed-a-home", "18-the-fork-that-needed-a-home"],
  ["container-supply-chain", "turning-container-images-from-a-liability-into-a-supply-chain", "19-turning-container-images-from-a-liability-into-a-supply-chain"],
  ["cloud-functions", "customer-code-running-safely-self-service-cloud-functions", "21-customer-code-running-safely-self-service-cloud-functions"],
  ["ai-tooling", "safe-ai-tooling-for-every-developer", "22-safe-ai-tooling-for-every-developer"],
  ["agent-ready-codebase", "a-codebase-whose-newest-users-are-ai-agents", "23-a-codebase-whose-newest-users-are-ai-agents"],
] as const;

export const caseStudyCatalog: CaseStudyDefinition[] = definitions.map(([id, folder, legacyFolder], index) => ({
  id,
  folder,
  legacyFolder,
  number: index + 1,
}));

export const byFolder = new Map(caseStudyCatalog.map((entry) => [entry.folder, entry]));
export const byId = new Map(caseStudyCatalog.map((entry) => [entry.id, entry]));
