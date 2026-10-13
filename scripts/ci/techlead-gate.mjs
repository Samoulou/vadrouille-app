// Décision de la porte techlead-gate (décisions 0019 § 3.3, 0023 § 4 et 0035).
// Fonctions pures, testées dans tests/unit/ci/techlead-gate.test.ts ; `workflowsTreeId`
// et la ligne de commande sont testées dans tests/unit/ci/techlead-gate-workflow.test.ts.
// Le workflow .github/workflows/techlead-gate.yml l'appelle avec `node`, sans installation.

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const APPROVED = "techlead-approved";
export const CHANGES = "changes-requested";
export const OWNER = "owner-approved";
export const BOT = "github-actions[bot]";
export const WORKFLOWS = ".github/workflows";

export const OWNER_MISSING =
  "PR qui modifie .github/workflows/ : le libellé owner-approved, posé par Samuel, est nécessaire (décision 0035).";
export const OWNER_NO_RECORD =
  "owner-approved est présent mais aucun enregistrement de la porte ne correspond à sa dernière pose : Samuel le retire puis le repose.";
export const OWNER_REMOVED =
  "owner-approved est retiré : le contenu de .github/workflows/ a changé depuis qu'il a été posé. Samuel doit valider le contenu actuel.";
export const FILES_UNREADABLE =
  "Liste des fichiers illisible (chemin cité ou encodage invalide) : la porte échoue par précaution (décision 0035).";

/** Valeur par défaut de `ownerApproval` : libellé absent. */
export const NO_OWNER_APPROVAL = Object.freeze({
  approved: false,
  stale: false,
  record: null,
  reason: "absent",
});

// Exemption de 0023 § 4.5, reprise à l'identique de l'ancien `grep -vqE` du YAML.
const EXEMPT = /^(STATUS\.md|QUESTIONS\.md|docs\/releases\/)/;

// Marqueur d'enregistrement publié par l'étape « Enregistrer owner-approved » (0035, règle 4).
const MARKER =
  /^<!-- techlead-gate:owner-approved tree=(absent|[0-7]{6} [0-9a-f]{40}|[0-7]{6} [0-9a-f]{64}) sha=([0-9a-f]{40}) -->$/;

/** Vrai si un chemin est `.github/workflows` ou commence par `.github/workflows/` (casse comprise). */
export function touchesWorkflows(files) {
  return files.some((file) => file === WORKFLOWS || file.startsWith(`${WORKFLOWS}/`));
}

/** Classe la liste des fichiers d'une PR : code, workflow, chemins illisibles (forme citée). */
export function classifyFiles(files) {
  const unreadable = files.filter((file) => file.startsWith('"'));
  const workflows = touchesWorkflows(files) || unreadable.length > 0;
  const code = files.some((file) => !EXEMPT.test(file)) || workflows || unreadable.length > 0;
  return { code, workflows, unreadable };
}

/** Liste produite par `git diff -z` : UTF-8 strict, coupée sur NUL, dernier élément vide retiré. */
export function readFileList(bytes) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const files = text.split("\0");
  if (files[files.length - 1] === "") files.pop();
  return files;
}

const time = (value) => {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isNaN(parsed) ? null : parsed;
};

/** Enregistrement `{ tree, sha }` lu dans le corps d'un commentaire, ou null. */
function markerRecord(body) {
  for (const line of String(body ?? "").split(/\r?\n/)) {
    const match = MARKER.exec(line);
    if (match) return { tree: match[1], sha: match[2] };
  }
  return null;
}

/**
 * État d'owner-approved pour une PR de workflow (décision 0035, règle 4).
 * Ne lit ni l'heure, ni Git, ni le réseau.
 */
export function evaluateOwnerApproval({
  labels,
  action,
  labelName,
  headSha,
  headTree,
  events = [],
  comments = [],
}) {
  const present = labels.includes(OWNER);
  const record =
    action === "labeled" && labelName === OWNER && present
      ? { tree: headTree, sha: headSha }
      : null;
  if (!present) return { approved: false, stale: false, record, reason: "absent" };

  // Dernière pose : la plus récente, quel que soit l'ordre des événements.
  let lastPose = null;
  for (const event of events) {
    if (event?.event !== "labeled" || event?.label?.name !== OWNER) continue;
    const at = time(event.created_at);
    if (at !== null && (lastPose === null || at > lastPose)) lastPose = at;
  }

  let valid = record;
  if (!valid && lastPose !== null) {
    let latest = null;
    for (const comment of comments) {
      if (comment?.user?.login !== BOT) continue;
      const at = time(comment.created_at);
      if (at === null || at < lastPose) continue;
      const found = markerRecord(comment.body);
      if (found && (latest === null || at >= latest.at)) latest = { at, found };
    }
    valid = latest ? latest.found : null;
  }

  if (!valid) return { approved: false, stale: false, record, reason: "no-record" };
  if (valid.tree !== headTree) return { approved: false, stale: true, record, reason: "changed" };
  return { approved: true, stale: false, record, reason: "approved" };
}

/**
 * Identifiant `<mode> <objet>` du contenu `.github/workflows` du commit `sha`, ou `absent`.
 * Lève une erreur si le commit est absent du clone.
 */
export function workflowsTreeId({ sha, cwd }) {
  const env = { ...process.env, GIT_LITERAL_PATHSPECS: "1" };
  if (typeof sha !== "string" || !/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(sha)) {
    throw new Error(`sha invalide : ${String(sha)}`);
  }
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd, env, stdio: "ignore" });
  } catch {
    throw new Error(`commit ${sha} absent du clone`);
  }
  const out = execFileSync("git", ["ls-tree", "-z", sha, "--", WORKFLOWS], {
    cwd,
    env,
    encoding: "utf8",
  });
  if (out === "") return "absent";
  // Entrée : « <mode> <type> <objet>\t<chemin> ».
  const [meta] = out.split("\0")[0].split("\t");
  const [mode, , object] = meta.split(" ");
  return `${mode} ${object}`;
}

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
 * @param {boolean} [input.workflows]  la PR touche .github/workflows/ (décision 0035)
 * @param {object} [input.ownerApproval]  résultat d'evaluateOwnerApproval
 * @param {boolean} [input.filesUnreadable]  liste des fichiers citée ou mal encodée
 */
export function decideGate({
  action,
  labels,
  code,
  headSha,
  reviews = [],
  workflows = false,
  ownerApproval = NO_OWNER_APPROVAL,
  filesUnreadable = false,
}) {
  const base = techleadDecision({ action, labels, code: code || workflows, headSha, reviews });
  let pass = base.pass;
  const messages = [...base.messages];
  let removeOwnerApproval = false;
  let recordOwnerApproval = null;

  // Sur une PR qui n'est pas de workflow, owner-approved n'a aucun effet (0035, règle 5).
  if (workflows) {
    recordOwnerApproval = ownerApproval.record ?? null;
    removeOwnerApproval = ownerApproval.stale === true;
    if (!ownerApproval.approved) {
      pass = false;
      messages.push(OWNER_MISSING);
      if (ownerApproval.reason === "no-record") messages.push(OWNER_NO_RECORD);
    }
    if (removeOwnerApproval) messages.push(OWNER_REMOVED);
  }

  if (filesUnreadable) {
    pass = false;
    messages.push(FILES_UNREADABLE);
  }

  return {
    pass,
    removeApproval: base.removeApproval,
    messages,
    warnings: base.warnings,
    removeOwnerApproval,
    recordOwnerApproval,
  };
}

/** Règles de 0023 § 4, inchangées par 0035. */
function techleadDecision({ action, labels, code, headSha, reviews }) {
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
//   node scripts/ci/techlead-gate.mjs <entrée.json> <fichiers.nul>
// <fichiers.nul> est la sortie brute de `git diff -z --name-only`. Les champs `code` et
// `workflows` de l'entrée sont ignorés : ils sont calculés ici (décision 0035, T3).
// Écrit la décision en JSON sur la sortie standard.
async function main() {
  const [inputPath, filesPath] = process.argv.slice(2);
  if (!inputPath || !filesPath) {
    throw new Error("usage : node scripts/ci/techlead-gate.mjs <entrée.json> <fichiers.nul>");
  }
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const bytes = await readFile(filesPath);

  let files = [];
  let invalidEncoding = false;
  try {
    files = readFileList(bytes);
  } catch {
    invalidEncoding = true;
  }
  const classified = classifyFiles(files);
  const filesUnreadable = invalidEncoding || classified.unreadable.length > 0;
  const code = classified.code || invalidEncoding;
  const workflows = classified.workflows || invalidEncoding;

  let headTree = null;
  let ownerApproval = NO_OWNER_APPROVAL;
  if (workflows) {
    headTree = workflowsTreeId({ sha: input.headSha, cwd: process.cwd() });
    ownerApproval = evaluateOwnerApproval({
      labels: input.labels,
      action: input.action,
      labelName: input.labelName,
      headSha: input.headSha,
      headTree,
      events: input.events ?? [],
      comments: input.comments ?? [],
    });
  }

  const decision = decideGate({
    action: input.action,
    labels: input.labels,
    code,
    headSha: input.headSha,
    reviews: input.reviews ?? [],
    workflows,
    ownerApproval,
    filesUnreadable,
  });
  process.stdout.write(
    `${JSON.stringify({ ...decision, code, workflows, headTree, ownerApproval })}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
