// @vitest-environment node
// Décision 0035 : rejoue l'étape « Lister les fichiers de la PR » de .github/workflows/techlead-gate.yml
// et la ligne de commande scripts/ci/techlead-gate.mjs dans des dépôts Git jetables (git et bash
// requis, présents sur la CI), sur le modèle de tests/unit/ci/visual-update.test.ts.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { workflowsTreeId } from "../../../scripts/ci/techlead-gate.mjs";

const WORKFLOW = readFileSync(join(process.cwd(), ".github/workflows/techlead-gate.yml"), "utf8");
const SCRIPT = join(process.cwd(), "scripts/ci/techlead-gate.mjs");

/** Script `run: |` de l'étape nommée `name`, sans l'indentation YAML. */
function runScript(name: string): string {
  const lines = WORKFLOW.split("\n");
  const start = lines.findIndex(
    (l) => l.trim() === `name: ${name}` || l.trim() === `- name: ${name}`,
  );
  if (start < 0) throw new Error(`étape introuvable : ${name}`);
  const runLine = lines.findIndex((l, i) => i > start && /^\s*run: \|$/.test(l));
  const runText = lines[runLine];
  if (runText === undefined) throw new Error(`run: | introuvable : ${name}`);
  const runIndent = runText.search(/\S/);
  const body: string[] = [];
  for (const line of lines.slice(runLine + 1)) {
    if (line.trim() !== "" && line.search(/\S/) <= runIndent) break;
    body.push(line.slice(runIndent + 2));
  }
  return body.join("\n");
}

/** Lignes YAML de l'étape nommée `name` (de `- …` à l'étape suivante). */
function stepText(name: string): string {
  const lines = WORKFLOW.split("\n");
  const at = lines.findIndex((l) => l.trim() === `name: ${name}` || l.trim() === `- name: ${name}`);
  if (at < 0) throw new Error(`étape introuvable : ${name}`);
  let start = at;
  while (!/^\s*- /.test(lines[start]!)) start -= 1;
  let end = start + 1;
  while (end < lines.length && !/^\s{6}- /.test(lines[end]!)) end += 1;
  return lines.slice(start, end).join("\n");
}

const LIST_FILES = runScript("Lister les fichiers de la PR");

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

/** Dépôt jetable avec une branche de base `origin/main` et une branche de PR. */
function setup(initial: Record<string, string> = { "README.md": "x\n", ".github/workflows/a.yml": "on: push\n" }) {
  const ws = mkdtempSync(join(tmpdir(), "techlead-gate-wf-"));
  roots.push(ws);
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
      cwd: ws,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(ws, path)), { recursive: true });
    writeFileSync(join(ws, path), content);
  };
  git("init", "-q", "-b", "main");
  for (const [path, content] of Object.entries(initial)) write(path, content);
  git("add", "-A");
  git("commit", "-qm", "base");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("checkout", "-q", "-b", "claude/x");
  const commit = (message = "commit") => {
    git("add", "-A");
    git("commit", "-qm", message, "--allow-empty");
    return git("rev-parse", "HEAD");
  };
  const tree = (sha = git("rev-parse", "HEAD")) => workflowsTreeId({ sha, cwd: ws });
  /** Rejoue l'étape YAML puis la ligne de commande, comme le job `gate`. */
  const gate = (input: Record<string, unknown> = {}) => {
    const list = spawnSync("bash", ["-e", "-c", LIST_FILES], {
      cwd: ws,
      env: { ...process.env, BASE_REF: "main" },
      encoding: "utf8",
    });
    expect(list.status, list.stderr).toBe(0);
    const headSha = git("rev-parse", "HEAD");
    writeFileSync(
      join(ws, "gate-input.json"),
      JSON.stringify({
        action: "opened",
        labelName: "",
        headSha,
        labels: [],
        reviews: [],
        events: [],
        comments: [],
        ...input,
      }),
    );
    const result = spawnSync("node", [SCRIPT, "gate-input.json", "files.nul"], {
      cwd: ws,
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    rmSync(join(ws, "files.nul"));
    rmSync(join(ws, "gate-input.json"));
    return JSON.parse(result.stdout);
  };
  return { ws, git, write, commit, tree, gate };
}

describe("techlead-gate : rejeu de « Lister les fichiers de la PR »", () => {
  it("ajout de .github/workflows/é.yml : PR de workflow (échouait ouvert sans -z)", () => {
    const { write, commit, gate } = setup();
    write(".github/workflows/é.yml", "on: push\n");
    commit();
    expect(gate()).toMatchObject({ workflows: true, code: true, pass: false });
  });

  it('ajout de .github/workflows/a"b.yml (nom cité sans -z) : PR de workflow', () => {
    const { write, commit, gate } = setup();
    write('.github/workflows/a"b.yml', "on: push\n");
    commit();
    expect(gate()).toMatchObject({ workflows: true });
  });

  it("renommage d'un workflow vers docs/ : PR de workflow", () => {
    const { git, commit, gate } = setup();
    mkdirSync(join(roots.at(-1)!, "docs"));
    git("mv", ".github/workflows/a.yml", "docs/a.yml");
    commit();
    expect(gate()).toMatchObject({ workflows: true });
  });

  it("suppression d'un workflow : PR de workflow", () => {
    const { git, commit, gate } = setup();
    git("rm", "-q", ".github/workflows/a.yml");
    commit();
    expect(gate()).toMatchObject({ workflows: true });
  });

  it("dossier .github/workflows remplacé par un fichier : PR de workflow", () => {
    const { ws, git, write, commit, gate } = setup();
    git("rm", "-q", "-r", ".github/workflows");
    rmSync(join(ws, ".github/workflows"), { recursive: true, force: true });
    write(".github/workflows", "x\n");
    commit();
    expect(gate()).toMatchObject({ workflows: true });
  });

  it("STATUS.md seul : exempté, pas de workflow", () => {
    const { write, commit, gate } = setup();
    write("STATUS.md", "état\n");
    commit();
    expect(gate()).toMatchObject({ workflows: false, code: false, pass: true });
  });
});

describe("workflowsTreeId", () => {
  it("inchangé par un commit qui ne touche que docs/ et par une fusion de main sans workflow", () => {
    const { git, write, commit, tree } = setup();
    const before = tree();
    write("docs/a.md", "a\n");
    commit();
    expect(tree()).toBe(before);
    git("checkout", "-q", "main");
    write("docs/b.md", "b\n");
    commit();
    git("checkout", "-q", "claude/x");
    git("merge", "-q", "--no-edit", "main");
    expect(tree()).toBe(before);
  });

  it("changé par la modification, la suppression ou le renommage hors du dossier d'un workflow", () => {
    for (const change of ["modify", "delete", "rename"] as const) {
      const { ws, git, write, commit, tree } = setup({
        "README.md": "x\n",
        ".github/workflows/a.yml": "on: push\n",
        ".github/workflows/b.yml": "on: pull_request\n",
      });
      const before = tree();
      if (change === "modify") write(".github/workflows/a.yml", "on: workflow_dispatch\n");
      if (change === "delete") git("rm", "-q", ".github/workflows/a.yml");
      if (change === "rename") {
        mkdirSync(join(ws, "docs"));
        git("mv", ".github/workflows/a.yml", "docs/a.yml");
      }
      commit(change);
      expect(tree(), change).not.toBe(before);
    }
  });

  it("changé par une fusion de main qui apporte un workflow", () => {
    const { git, write, commit, tree } = setup();
    const before = tree();
    git("checkout", "-q", "main");
    write(".github/workflows/nouveau.yml", "on: push\n");
    commit();
    git("checkout", "-q", "claude/x");
    git("merge", "-q", "--no-edit", "main");
    expect(tree()).not.toBe(before);
  });

  it("absent pour un commit sans le dossier", () => {
    const { tree } = setup({ "README.md": "x\n" });
    expect(tree()).toBe("absent");
  });

  it("dossier, fichier puis lien symbolique de même contenu : modes différents", () => {
    const { ws, git, write, commit, tree } = setup({ "README.md": "x\n", ".github/workflows/a.yml": "x" });
    const dir = tree();
    git("rm", "-q", "-r", ".github/workflows");
    rmSync(join(ws, ".github/workflows"), { recursive: true, force: true });
    write(".github/workflows", "cible");
    commit("fichier");
    const file = tree();
    rmSync(join(ws, ".github/workflows"));
    symlinkSync("cible", join(ws, ".github/workflows"));
    commit("lien");
    const link = tree();
    expect(dir).toMatch(/^040000 /);
    expect(file).toMatch(/^100644 /);
    expect(link).toMatch(/^120000 /);
    expect(file.split(" ")[1]).toBe(link.split(" ")[1]);
    expect(file).not.toBe(link);
  });

  it("erreur pour un sha absent du dépôt (et non « absent »)", () => {
    const { ws } = setup();
    expect(() => workflowsTreeId({ sha: "9".repeat(40), cwd: ws })).toThrow();
  });

  it("ignore les variables Git de l'environnement du processus (0040 A8)", () => {
    const { ws, git, write, commit } = setup();
    write(".github/workflows/b.yml", "on: pull_request\n");
    commit("b");
    const sha = git("rev-parse", "HEAD");
    const reference = workflowsTreeId({ sha, cwd: ws });
    const vide = mkdtempSync(join(tmpdir(), "techlead-gate-git-dir-"));
    roots.push(vide);
    // Sous GIT_DIR posé, ni l'assistant `git` ni `tree()` sans argument : ils lèveraient aussi.
    vi.stubEnv("GIT_DIR", vide);
    let resultat: string | undefined;
    expect(() => {
      resultat = workflowsTreeId({ sha, cwd: ws });
    }).not.toThrow();
    expect(resultat).toBe(reference);
  });
});

describe("techlead-gate : scénarios d'ordonnancement de bout en bout", () => {
  const POSE = "2026-10-12T10:00:00Z";
  const recorded = (tree: string, sha: string) => ({
    labels: ["techlead-approved", "owner-approved"],
    events: [{ event: "labeled", label: { name: "owner-approved" }, created_at: POSE }],
    comments: [
      {
        user: { login: "github-actions[bot]" },
        body: `techlead-gate : owner-approved enregistré pour le contenu de .github/workflows/ du commit ${sha}.\n\n<!-- techlead-gate:owner-approved tree=${tree} sha=${sha} -->`,
        created_at: "2026-10-12T10:00:05Z",
      },
    ],
  });

  /** PR de workflow posée sur l'arbre A, enregistrement fourni dans les commentaires. */
  function approvedOnA() {
    const repo = setup();
    repo.write(".github/workflows/a.yml", "on: [push]\n");
    const shaA = repo.commit("A");
    const treeA = repo.tree();
    return { ...repo, treeA, shaA, state: recorded(treeA, shaA) };
  }

  it("tête à l'arbre B, seule l'exécution labeled (techlead-approved) reste : retrait", () => {
    const { write, commit, gate, state } = approvedOnA();
    write(".github/workflows/a.yml", "on: [push, pull_request]\n");
    commit("B");
    const result = gate({ ...state, action: "labeled", labelName: "techlead-approved" });
    expect(result).toMatchObject({ removeOwnerApproval: true, pass: false });
  });

  it("pushes B puis C (docs/ seulement), seule l'exécution synchronize de C reste : retrait", () => {
    const { write, commit, gate, state, tree } = approvedOnA();
    write(".github/workflows/a.yml", "on: [push, pull_request]\n");
    commit("B");
    const treeB = tree();
    write("docs/c.md", "c\n");
    commit("C");
    expect(tree()).toBe(treeB);
    const result = gate({ ...state, action: "synchronize" });
    expect(result).toMatchObject({ removeOwnerApproval: true, pass: false });
  });

  it("tête revenue à l'arbre A : approuvé, pas de retrait", () => {
    const { write, commit, gate, state, treeA } = approvedOnA();
    write(".github/workflows/a.yml", "on: [push, pull_request]\n");
    commit("B");
    write(".github/workflows/a.yml", "on: [push]\n");
    commit("retour à A");
    const result = gate({ ...state, action: "labeled", labelName: "techlead-approved" });
    expect(result).toMatchObject({ headTree: treeA, removeOwnerApproval: false, pass: true });
    expect(result.ownerApproval.approved).toBe(true);
  });
});

describe("techlead-gate.yml : lecture par chaîne", () => {
  it("garde pull_request, labeled et unlabeled, et le job gate", () => {
    expect(WORKFLOW).toMatch(/^on:\n {2}pull_request:\n {4}types: \[[^\]]*\blabeled\b[^\]]*\]/m);
    expect(WORKFLOW).toMatch(/types: \[[^\]]*\bunlabeled\b[^\]]*\]/);
    expect(WORKFLOW).not.toContain("pull_request_target");
    expect(WORKFLOW).toMatch(/^jobs:\n {2}gate:$/m);
  });

  it("ne filtre aucun chemin et ne calcule plus code", () => {
    expect(LIST_FILES.trim()).toBe(
      'git diff -z --name-only --no-renames "origin/${BASE_REF}...HEAD" > files.nul',
    );
    expect(WORKFLOW).not.toMatch(/\bgrep\b/);
    expect(WORKFLOW).not.toContain("--argjson code");
    expect(WORKFLOW).toContain("node scripts/ci/techlead-gate.mjs gate-input.json files.nul");
  });

  it("ne lit ni github.event.before ni github.event.after", () => {
    expect(WORKFLOW).not.toContain("github.event.before");
    expect(WORKFLOW).not.toContain("github.event.after");
  });

  it("garde un seul groupe de concurrence par PR, sans annulation", () => {
    expect(WORKFLOW).toContain(
      "concurrency:\n  group: techlead-gate-${{ github.event.pull_request.number }}\n  cancel-in-progress: false\n",
    );
  });

  it("enregistre owner-approved avant le verdict et sait le retirer", () => {
    const record = stepText("Enregistrer owner-approved");
    expect(record).toContain("if: steps.decide.outputs.recordOwner == 'true'");
    expect(record).toContain("<!-- techlead-gate:owner-approved");
    expect(WORKFLOW.indexOf("name: Enregistrer owner-approved")).toBeLessThan(
      WORKFLOW.indexOf("name: Verdict"),
    );
    const remove = stepText("Retirer owner-approved");
    expect(remove).toContain("if: steps.decide.outputs.removeOwner == 'true'");
    expect(remove).toContain('-X DELETE "repos/$REPO/issues/$PR/labels/owner-approved"');
  });

  it("l'en-tête cite 0035", () => {
    const header = WORKFLOW.split("\n").filter((l) => l.startsWith("#")).join("\n");
    expect(header).toContain("0035");
  });
});

describe("décision 0035 et consignes : lecture par chaîne", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("0035 cite Samuel mot pour mot, nomme les décideurs des modalités et contient les points 1 à 7", () => {
    const decision = read("docs/decisions/0035-owner-approved-workflows.md");
    expect(decision).toContain(
      "« Q245 : oui ; toute PR qui modifie .github/workflows/ est signalée dans #studio et attend le libellé owner-approved, que je pose moi-même. Ajoute ce contrôle à techlead-gate. »",
    );
    expect(decision).toContain("Décideurs des modalités : Tech Lead (outillage : T1 à T5 ci-dessous), Product Owner (D1 à D4)");
    for (const point of ["1. ", "2. ", "3. ", "4. ", "5. ", "6. ", "7. "]) {
      expect(decision).toMatch(new RegExp(`^${point.replace(".", "\\.")}`, "m"));
    }
    expect(decision).toContain("## Risques résiduels");
  });

  it("0023 § 4.2 renvoie à 0035", () => {
    const text = read("docs/decisions/0023-decisions-tech-lead-outillage-release-porte-revue.md");
    const section = text.slice(text.indexOf("2. **Règles**"), text.indexOf("3. **Garde de course**"));
    expect(section).toContain("décision 0035");
  });

  it("mise-en-place : étape 4 et étape 6 bis du prompt R1", () => {
    const text = read("docs/studio/mise-en-place.md");
    const step4 = text.split("\n").find((l) => l.startsWith("4. La porte GitHub (`techlead-gate`)"));
    expect(step4).toContain("owner-approved");
    expect(step4).toContain("0035");
    expect(text).toContain(
      "6 bis. Pour chaque PR ouverte d'une branche claude/… dont le diff touche .github/workflows/ et qui n'a pas le libellé owner-approved : cherche dans l'historique de #studio le dernier message « owner-approved attendu — PR #<n> ». S'il n'y en a pas, ou s'il est antérieur à la date du dernier commit de la PR, poste « owner-approved attendu — PR #<n> : <titre> ; fichiers : <liste sous .github/workflows/> ; revue Tech Lead : <techlead-approved, changes-requested ou en attente>. <lien> », signé « Studio ». Liste ces PR dans STATUS.md, rubrique « Décisions attendues ». Ne pose jamais owner-approved.",
    );
  });

  it("lecture des libellés et commentaires : pipefail, un échec de gh api fait échouer l'étape", () => {
    const script = runScript("Lire les libellés, les revues consolidées, les événements et les commentaires");
    expect(script.split("\n").find((l) => l.trim() !== "" && !l.trim().startsWith("#"))).toBe("set -o pipefail");
    const dir = mkdtempSync(join(tmpdir(), "techlead-gate-pipefail-"));
    try {
      const bin = join(dir, "bin");
      mkdirSync(bin);
      writeFileSync(join(bin, "gh"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
      const result = spawnSync("bash", ["-e", "-c", script], {
        cwd: dir,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
      });
      expect(result.status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("mise-en-place, annexe D : la copie de techlead-gate.yml est identique au workflow", () => {
    const text = read("docs/studio/mise-en-place.md");
    const head = "```yaml\n# .github/workflows/techlead-gate.yml\n";
    const start = text.indexOf(head);
    expect(start).toBeGreaterThanOrEqual(0);
    const body = text.slice(start + head.length, text.indexOf("```\n", start + head.length));
    expect(body).toBe(WORKFLOW);
  });

  it("consignes du CEO et du Tech Lead", () => {
    expect(read(".claude/agents/ceo.md")).toContain(
      "Toute PR ouverte d'une branche claude/… qui modifie .github/workflows/ et n'a pas owner-approved est signalée dans #studio. Tu ne poses ni ne retires owner-approved.",
    );
    expect(read(".claude/agents/tech-lead.md")).toContain(
      "Tu ne poses ni ne retires owner-approved (décision 0035) ; une PR de workflow n'est fusionnable qu'avec ce libellé, posé par Samuel.",
    );
  });
});
