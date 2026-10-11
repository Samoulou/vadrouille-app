// Décision de la porte techlead-gate (décisions 0019 § 3.3 et 0023 § 4).
// Fonction pure, testée dans tests/unit/ci/techlead-gate.test.ts ; le workflow
// .github/workflows/techlead-gate.yml l'appelle avec `node`, sans installation.

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const APPROVED = "techlead-approved";
export const CHANGES = "changes-requested";

// Titre d'une revue consolidée (0019 § 3.2, point 1) : « Revue consolidée — head `<sha court>` ».
const CONSOLIDATED = /Revue consolidée\s*[—–-]\s*head\s*`([0-9a-f]{7,40})`/i;

/** Sha court de la revue consolidée contenue dans un texte, ou null. */
export function consolidatedHead(body) {
  const match = CONSOLIDATED.exec(body ?? "");
  return match ? match[1].toLowerCase() : null;
}

/** Sha court de la dernière revue consolidée (commentaires et revues confondus), ou null. */
export function latestConsolidatedHead(entries) {
  let latest = null;
  for (const entry of entries ?? []) {
    const head = consolidatedHead(entry.body);
    if (!head) continue;
    if (!latest || String(entry.createdAt) >= String(latest.createdAt)) {
      latest = { head, createdAt: entry.createdAt };
    }
  }
  return latest ? latest.head : null;
}

/**
 * @param {object} input
 * @param {string} input.action  action de l'événement pull_request
 * @param {string[]} input.labels  libellés lus au moment de l'exécution
 * @param {boolean} input.code  la PR touche autre chose que STATUS.md, QUESTIONS.md, docs/releases/
 * @param {string} input.headSha  sha complet du head courant
 * @param {{ body: string, createdAt: string }[]} [input.reviews]  commentaires et revues de la PR
 * @returns {{ pass: boolean, removeApproval: boolean, messages: string[], warnings: string[] }}
 */
export function decideGate({ action, labels, code, headSha, reviews = [] }) {
  const approved = labels.includes(APPROVED);
  const changes = labels.includes(CHANGES);
  const messages = [];
  const warnings = [];
  let removeApproval = false;

  // Nouveau push : l'approbation valait pour l'ancien head, quel que soit le type de PR.
  if (action === "synchronize" && approved) {
    removeApproval = true;
    messages.push(
      "Nouveau push : techlead-approved est retiré, la validation porte sur le head relu.",
    );
  }

  if (!code) {
    return { pass: true, removeApproval, messages, warnings };
  }

  if (action === "synchronize") {
    messages.push("Nouveau head non relu : une revue du head courant est nécessaire.");
    return { pass: false, removeApproval, messages, warnings };
  }

  if (approved && changes) {
    removeApproval = true;
    messages.push(
      "Libellés contradictoires : techlead-approved et changes-requested. Une revue consolidée est nécessaire.",
    );
    return { pass: false, removeApproval, messages, warnings };
  }

  if (changes) {
    messages.push("Changements demandés (libellé changes-requested).");
    return { pass: false, removeApproval, messages, warnings };
  }

  if (!approved) {
    messages.push("Validation du Tech Lead manquante (libellé techlead-approved).");
    return { pass: false, removeApproval, messages, warnings };
  }

  // Garde de course (0019 § 3.3, point 4) : l'approbation doit porter sur le head courant.
  const reviewed = latestConsolidatedHead(reviews);
  if (reviewed === null) {
    warnings.push(
      "Aucune « Revue consolidée — head `<sha>` » trouvée : le head relu n'est pas vérifiable.",
    );
  } else if (!headSha.toLowerCase().startsWith(reviewed)) {
    removeApproval = true;
    messages.push(
      `Approbation périmée : la dernière revue consolidée porte sur le head ${reviewed}, le head courant est ${headSha.slice(0, 7)}.`,
    );
    return { pass: false, removeApproval, messages, warnings };
  }

  return { pass: true, removeApproval, messages, warnings };
}

// Interface en ligne de commande pour le workflow :
//   node scripts/ci/techlead-gate.mjs <entrée.json>
// Écrit la décision en JSON sur la sortie standard.
async function main() {
  const input = JSON.parse(await readFile(process.argv[2], "utf8"));
  process.stdout.write(`${JSON.stringify(decideGate(input))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
