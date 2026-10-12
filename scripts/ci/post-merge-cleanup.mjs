// Nettoyage après fusion (décision 0033). La fusion automatique est faite avec
// GITHUB_TOKEN : GitHub ne ferme alors pas les tickets « Closes #n » et ne supprime
// pas la branche. Le workflow .github/workflows/post-merge-cleanup.yml rattrape les
// deux, sur un créneau, avec GITHUB_TOKEN. Fonctions pures, testées dans
// tests/unit/ci/post-merge-cleanup.test.ts ; appelées avec `node`, sans installation.

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Requête GraphQL : PR fusionnées récentes avec les tickets que GitHub leur relie
// (dépôt et réouverture compris), PR ouvertes (tête et base), branches claude/….
export const QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    defaultBranchRef { name }
    merged: pullRequests(states: MERGED, first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number mergedAt baseRefName headRefName headRefOid isCrossRepository
        closingIssuesReferences(first: 20) {
          nodes {
            number state
            repository { nameWithOwner }
            timelineItems(itemTypes: [REOPENED_EVENT], last: 1) {
              nodes { ... on ReopenedEvent { createdAt } }
            }
          }
        }
      }
    }
    open: pullRequests(states: OPEN, first: 100) {
      pageInfo { hasNextPage }
      nodes { headRefName baseRefName isCrossRepository }
    }
    branches: refs(refPrefix: "refs/heads/claude/", first: 100) {
      nodes { name target { oid } }
    }
  }
}`;

export const MAX_AGE_DAYS = 7;

// Seules les branches de travail des agents sont supprimées ; le motif exclut aussi
// tout caractère qu'un shell pourrait interpréter, et les segments « . » et « .. ».
const BRANCH = /^claude(?:\/(?!\.{1,2}(?:\/|$))[A-Za-z0-9._-]+)+$/;

/**
 * Plan du nettoyage, à partir de la réponse GraphQL (`data`).
 * - Ticket : de ce dépôt, relié par GitHub à une PR fusionnée dans la branche par défaut,
 *   encore ouvert, et pas rouvert depuis la fusion (une réouverture par Samuel l'emporte).
 * - Branche : `claude/…`, tête d'une PR fusionnée du dépôt, toujours sur le commit fusionné
 *   (aucun push après la fusion), ni tête ni base d'une PR ouverte.
 * Fenêtre : PR fusionnées depuis MAX_AGE_DAYS jours au plus. Une liste de PR fusionnées
 * tronquée ne fait qu'oublier un nettoyage ; une liste de PR ouvertes tronquée ferait
 * supprimer une branche encore utile : échec fermé.
 */
export function planCleanup(data, now = new Date()) {
  const repo = data?.repository;
  if (!repo?.defaultBranchRef?.name || !repo.nameWithOwner) {
    throw new Error("Réponse GraphQL incomplète.");
  }
  if (repo.open.pageInfo?.hasNextPage !== false) {
    throw new Error(
      "Liste des PR ouvertes tronquée ou incomplète : aucun nettoyage.",
    );
  }
  const base = repo.defaultBranchRef.name;
  const since = now.getTime() - MAX_AGE_DAYS * 24 * 3600 * 1000;
  const inUse = new Set();
  for (const pr of repo.open.nodes) {
    inUse.add(pr.baseRefName);
    if (!pr.isCrossRepository) inUse.add(pr.headRefName);
  }
  const branchOid = new Map(
    repo.branches.nodes.map((ref) => [`claude/${ref.name}`, ref.target?.oid]),
  );

  const issues = new Map();
  const branches = new Map();
  for (const pr of repo.merged.nodes) {
    if (pr.baseRefName !== base || !pr.mergedAt) continue;
    const mergedAt = Date.parse(pr.mergedAt);
    if (mergedAt < since) continue;
    for (const issue of pr.closingIssuesReferences?.nodes ?? []) {
      const reopenedAt = issue.timelineItems?.nodes?.[0]?.createdAt;
      if (
        issue.state === "OPEN" &&
        issue.repository?.nameWithOwner === repo.nameWithOwner &&
        Number.isInteger(issue.number) &&
        !(reopenedAt && Date.parse(reopenedAt) > mergedAt) &&
        !issues.has(issue.number)
      ) {
        issues.set(issue.number, pr.number);
      }
    }
    const branch = pr.headRefName;
    if (
      !pr.isCrossRepository &&
      BRANCH.test(branch) &&
      /^[0-9a-f]{40}$/.test(pr.headRefOid ?? "") &&
      branchOid.get(branch) === pr.headRefOid &&
      !inUse.has(branch)
    ) {
      branches.set(branch, { pr: pr.number, oid: pr.headRefOid });
    }
  }
  return {
    closeIssues: [...issues]
      .map(([issue, pr]) => ({ issue, pr }))
      .sort((a, b) => a.issue - b.issue),
    deleteBranches: [...branches]
      .map(([branch, { pr, oid }]) => ({ branch, pr, oid }))
      .sort((a, b) => a.branch.localeCompare(b.branch)),
  };
}

/** Lignes lues par le workflow : `issue <n> <pr>` et `branch <nom> <pr> <commit>`. */
export function planLines(plan) {
  return [
    ...plan.closeIssues.map(({ issue, pr }) => `issue ${issue} ${pr}`),
    ...plan.deleteBranches.map(
      ({ branch, pr, oid }) => `branch ${branch} ${pr} ${oid}`,
    ),
  ];
}

// Interface en ligne de commande pour le workflow :
//   node scripts/ci/post-merge-cleanup.mjs query          → requête GraphQL
//   node scripts/ci/post-merge-cleanup.mjs plan <json>    → lignes du plan
async function main() {
  const [command, file] = process.argv.slice(2);
  if (command === "query") {
    process.stdout.write(`${QUERY}\n`);
    return;
  }
  if (command === "plan" && file) {
    const response = JSON.parse(await readFile(file, "utf8"));
    if (response.errors?.length)
      throw new Error(`GraphQL : ${JSON.stringify(response.errors)}`);
    for (const line of planLines(planCleanup(response.data)))
      process.stdout.write(`${line}\n`);
    return;
  }
  process.stderr.write(
    "Usage : post-merge-cleanup.mjs query | plan <réponse.json>\n",
  );
  process.exitCode = 2;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
