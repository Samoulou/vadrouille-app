// @vitest-environment node
// Décision 0004, section « Évolution » : rejoue les scripts du job `publish` et du job `label` de
// .github/workflows/visual-update.yml dans des dépôts Git jetables (git, bash et curl requis, présents sur la CI).
// Régressions de la correction 1 de la PR #148 :
// - l'étape de contrôle listait son propre fichier `changes.txt` et échouait toujours ;
// - le retrait des libellés ignorait toute erreur HTTP, pas seulement le 404 ;
// - les fichiers de l'artefact (non fiable) n'étaient pas validés.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const WORKFLOW = readFileSync(
  join(process.cwd(), ".github/workflows/visual-update.yml"),
  "utf8",
);
const REFS = "tests/visual/__screenshots__";
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** Script `run: |` de l'étape nommée `name`, sans l'indentation YAML. */
function runScript(name: string): string {
  const lines = WORKFLOW.split("\n");
  const start = lines.findIndex(
    (l) => l.trim() === `name: ${name}` || l.trim() === `- name: ${name}`,
  );
  if (start < 0) throw new Error(`étape introuvable : ${name}`);
  const runLine = lines.findIndex(
    (l, i) => i > start && /^\s*run: \|$/.test(l),
  );
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

const SCRIPTS = {
  validate: runScript("Valider et copier les références"),
  changes: runScript("Vérifier que seules des références ont changé"),
  removeApproval: runScript("Retirer techlead-approved"),
  commit: runScript("Committer et pousser sur la branche de la PR"),
  removeTrigger: runScript("Retirer le libellé update-snapshots"),
};

const png = (content: string) =>
  Buffer.concat([PNG_HEADER, Buffer.from(content)]);
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

/** Dépôt de PR jetable, avec un dépôt distant nu et deux références. */
function setup() {
  const root = mkdtempSync(join(tmpdir(), "visual-update-"));
  roots.push(root);
  const ws = join(root, "ws");
  const remote = join(root, "remote.git");
  const temp = join(root, "tmp");
  const artifact = join(temp, "references");
  mkdirSync(join(ws, REFS), { recursive: true });
  mkdirSync(artifact, { recursive: true });
  execFileSync("git", ["init", "-q", "--bare", remote], { stdio: "ignore" });
  git(ws, "init", "-q", "-b", "claude/x");
  writeFileSync(join(ws, REFS, "accueil.png"), png("a"));
  writeFileSync(join(ws, REFS, "carte.png"), png("b"));
  writeFileSync(join(ws, "README.md"), "x\n");
  git(ws, "add", "-A");
  git(ws, "commit", "-qm", "init");
  git(ws, "remote", "add", "origin", remote);
  git(ws, "push", "-q", "origin", "HEAD:refs/heads/claude/x");
  const output = join(root, "github_output");
  writeFileSync(output, "");
  const env = {
    ...process.env,
    RUNNER_TEMP: temp,
    GITHUB_WORKSPACE: ws,
    GITHUB_OUTPUT: output,
    HEAD_REF: "claude/x",
    GH_TOKEN: "jeton-factice",
  };
  const run = (script: string) =>
    spawnSync("bash", ["-e", "-c", script], { cwd: ws, env, encoding: "utf8" });
  return { ws, remote, artifact, output, run };
}

describe("visual-update : job publish", () => {
  it("régression : l'étape de contrôle ne se liste pas elle-même et ne laisse aucun fichier", () => {
    const { ws, artifact, output, run } = setup();
    writeFileSync(join(artifact, "carte.png"), png("b2"));
    expect(run(SCRIPTS.validate).status).toBe(0);
    const changes = run(SCRIPTS.changes);
    expect(changes.status, changes.stdout + changes.stderr).toBe(0);
    expect(readFileSync(output, "utf8")).toContain("changed=true");
    expect(git(ws, "status", "--porcelain")).toBe(` M ${REFS}/carte.png\n`);
  });

  it("committe et pousse les PNG modifiés et nouveaux, sans autre fichier", () => {
    const { ws, remote, artifact, run } = setup();
    copyFileSync(join(ws, REFS, "accueil.png"), join(artifact, "accueil.png"));
    writeFileSync(join(artifact, "carte.png"), png("b2"));
    writeFileSync(join(artifact, "nouvelle-capture_1.png"), png("n"));
    expect(run(SCRIPTS.validate).status).toBe(0);
    expect(run(SCRIPTS.changes).status).toBe(0);
    const commit = run(SCRIPTS.commit);
    expect(commit.status, commit.stdout + commit.stderr).toBe(0);
    expect(git(remote, "show", "--name-status", "--format=", "claude/x")).toBe(
      `M\t${REFS}/carte.png\nA\t${REFS}/nouvelle-capture_1.png\n`,
    );
    expect(git(remote, "log", "-1", "--format=%s", "claude/x").trim()).toBe(
      "[qa] chore: références visuelles régénérées (0004)",
    );
    expect(git(ws, "status", "--porcelain")).toBe("");
  });

  it("aucun changement : changed=false, sans erreur", () => {
    const { ws, artifact, output, run } = setup();
    for (const f of ["accueil.png", "carte.png"])
      copyFileSync(join(ws, REFS, f), join(artifact, f));
    expect(run(SCRIPTS.validate).status).toBe(0);
    expect(run(SCRIPTS.changes).status).toBe(0);
    expect(readFileSync(output, "utf8")).toContain("changed=false");
  });

  const rejected: [string, (ctx: ReturnType<typeof setup>) => void][] = [
    ["artefact vide", () => {}],
    [
      "lien symbolique dans l'artefact",
      ({ artifact }) => {
        writeFileSync(join(artifact, "ok.png"), png("o"));
        symlinkSync("/etc/passwd", join(artifact, "lien.png"));
      },
    ],
    [
      "sous-répertoire dans l'artefact",
      ({ artifact }) => {
        mkdirSync(join(artifact, "d"));
        writeFileSync(join(artifact, "d", "x.png"), png("x"));
      },
    ],
    [
      "nom avec espace",
      ({ artifact }) =>
        writeFileSync(join(artifact, "mal nommé.png"), png("x")),
    ],
    [
      "fichier caché",
      ({ artifact }) => {
        writeFileSync(join(artifact, "ok.png"), png("o"));
        writeFileSync(join(artifact, ".cache.png"), png("x"));
      },
    ],
    [
      "extension autre que .png",
      ({ artifact }) => writeFileSync(join(artifact, "ok.txt"), png("x")),
    ],
    [
      "en-tête qui n'est pas PNG",
      ({ artifact }) => writeFileSync(join(artifact, "faux.png"), "pas un png"),
    ],
    [
      "taille au-delà de 5 Mio",
      ({ artifact }) =>
        writeFileSync(
          join(artifact, "gros.png"),
          Buffer.concat([PNG_HEADER, Buffer.alloc(5 * 1024 * 1024)]),
        ),
    ],
    [
      "référence existante en lien symbolique",
      ({ ws, artifact }) => {
        rmSync(join(ws, REFS, "carte.png"));
        symlinkSync("../../../README.md", join(ws, REFS, "carte.png"));
        git(ws, "add", "-A");
        git(ws, "commit", "-qm", "lien");
        writeFileSync(join(artifact, "carte.png"), png("z"));
      },
    ],
    [
      "répertoire des références en lien symbolique",
      ({ ws, artifact }) => {
        mkdirSync(join(ws, "ailleurs"));
        git(ws, "mv", REFS, "ailleurs/s");
        symlinkSync("../../ailleurs/s", join(ws, REFS));
        git(ws, "add", "-A");
        git(ws, "commit", "-qm", "lien");
        writeFileSync(join(artifact, "carte.png"), png("z"));
      },
    ],
  ];
  for (const [label, arrange] of rejected) {
    it(`refuse : ${label}, sans rien copier`, () => {
      const ctx = setup();
      arrange(ctx);
      const result = ctx.run(SCRIPTS.validate);
      expect(result.status).not.toBe(0);
      expect(result.stdout).toContain("::error::");
      expect(git(ctx.ws, "status", "--porcelain")).toBe("");
    });
  }

  it("refuse un changement hors des PNG de références", () => {
    const { ws, run } = setup();
    writeFileSync(join(ws, "README.md"), "modifié\n");
    expect(run(SCRIPTS.changes).status).not.toBe(0);
  });

  it("refuse une suppression de référence", () => {
    const { ws, run } = setup();
    rmSync(join(ws, REFS, "carte.png"));
    expect(run(SCRIPTS.changes).status).not.toBe(0);
  });

  it("push refusé si la branche a avancé pendant l'exécution", () => {
    const { remote, artifact, run } = setup();
    const other = mkdtempSync(join(tmpdir(), "visual-update-autre-"));
    roots.push(other);
    git(other, "clone", "-q", "-b", "claude/x", remote, ".");
    writeFileSync(join(other, "z"), "z\n");
    git(other, "add", "z");
    git(other, "commit", "-qm", "z");
    git(other, "push", "-q", "origin", "claude/x");
    writeFileSync(join(artifact, "carte.png"), png("b2"));
    expect(run(SCRIPTS.validate).status).toBe(0);
    expect(run(SCRIPTS.changes).status).toBe(0);
    expect(run(SCRIPTS.commit).status).not.toBe(0);
  });
});

describe("visual-update : retrait des libellés", () => {
  let server: Server;
  let status = 200;
  const requests: string[] = [];
  let apiUrl = "";
  beforeAll(async () => {
    server = createServer((req, res) => {
      requests.push(
        `${req.method} ${req.url} ${req.headers.authorization ?? ""}`,
      );
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end('{"message":"factice"}');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const cases: [string, string, string][] = [
    ["Retirer techlead-approved", SCRIPTS.removeApproval, "techlead-approved"],
    [
      "Retirer le libellé update-snapshots",
      SCRIPTS.removeTrigger,
      "update-snapshots",
    ],
  ];
  for (const [step, script, label] of cases) {
    for (const code of [200, 404, 403, 422, 500]) {
      it(`${step} : HTTP ${code} ${code === 200 || code === 404 ? "accepté" : "fait échouer le job"}`, async () => {
        status = code;
        requests.length = 0;
        const temp = mkdtempSync(join(tmpdir(), "visual-update-label-"));
        roots.push(temp);
        // Asynchrone : le faux serveur tourne dans ce processus.
        const exitCode = await new Promise<number | null>((resolve) => {
          spawn("bash", ["-e", "-c", script], {
            stdio: "ignore",
            env: {
              ...process.env,
              RUNNER_TEMP: temp,
              GITHUB_API_URL: apiUrl,
              GH_TOKEN: "jeton-factice",
              REPO: "o/r",
              PR: "148",
              LABEL: label,
            },
          }).on("exit", resolve);
        });
        expect(requests).toEqual([
          `DELETE /repos/o/r/issues/148/labels/${label} Bearer jeton-factice`,
        ]);
        expect(exitCode === 0).toBe(code === 200 || code === 404);
      });
    }
  }
});
