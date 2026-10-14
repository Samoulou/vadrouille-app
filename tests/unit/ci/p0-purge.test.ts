// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Test statique de `.github/workflows/p0-purge.yml` (décision 0046, D16 point 7 et « Tests imposés ») : déclencheurs,
 * `cron` toutes les 6 heures, `runs-on: ubuntu-24.04`, environnement, `permissions: {}`, `timeout-minutes`,
 * `concurrency`, aucune action `uses:`, secrets dans une seule étape, `psql` sans argument de connexion,
 * `PGSSLMODE: verify-full` et `PGSSLROOTCERT: system`, sortie redirigée. Lecture du texte, sans analyseur YAML.
 */

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const DOSSIER = path.join(RACINE, ".github/workflows");
const WORKFLOW = readFileSync(path.join(DOSSIER, "p0-purge.yml"), "utf8");
/** Lignes utiles : sans commentaire ni ligne vide. */
const LIGNES = WORKFLOW.split("\n").filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
/** Texte sans commentaires (les commentaires du fichier citent ce qui est exclu). */
const CODE = LIGNES.join("\n");
const CLES_RACINE = LIGNES.filter((l) => /^[a-z_-]+:/.test(l)).map((l) => l.split(":")[0]);

/** Bloc d'une clé de premier niveau (lignes indentées qui la suivent). */
function bloc(cle: string): string[] {
  const debut = LIGNES.findIndex((l) => l.startsWith(`${cle}:`));
  if (debut < 0) return [];
  const fin = LIGNES.findIndex((l, i) => i > debut && /^\S/.test(l));
  return LIGNES.slice(debut, fin < 0 ? undefined : fin);
}

describe("ci: p0-purge.yml selon 0046 D16 point 7", () => {
  it("clés de premier niveau, déclencheurs schedule (toutes les 6 heures) et workflow_dispatch seulement", () => {
    expect(CLES_RACINE).toEqual(["name", "on", "permissions", "concurrency", "jobs"]);
    expect(bloc("on").map((l) => l.trim())).toEqual(["on:", "schedule:", '- cron: "17 */6 * * *"', "workflow_dispatch:"]);
  });

  it("permissions: {} ; concurrency p0-purge sans annulation", () => {
    expect(bloc("permissions")).toEqual(["permissions: {}"]);
    expect(bloc("concurrency").map((l) => l.trim())).toEqual(["concurrency:", "group: p0-purge", "cancel-in-progress: false"]);
    expect(WORKFLOW).not.toMatch(/^\s+permissions:/m);
  });

  it("un seul job : ubuntu-24.04 épinglé, environnement p0-purge, 5 minutes, une seule étape", () => {
    const jobs = bloc("jobs");
    expect(jobs.filter((l) => /^ {2}\S/.test(l)).map((l) => l.trim())).toEqual(["purge:"]);
    const job = jobs.filter((l) => /^ {4}\S/.test(l)).map((l) => l.trim());
    expect(job).toEqual(["if: github.ref == 'refs/heads/main'", "runs-on: ubuntu-24.04", "environment: p0-purge", "timeout-minutes: 5", "steps:"]);
    expect(WORKFLOW).not.toContain("ubuntu-latest");
    expect(jobs.filter((l) => /^ {6}- /.test(l))).toHaveLength(1);
  });

  it("aucune action uses:, ni checkout, ni installation de paquets", () => {
    expect(CODE).not.toMatch(/\buses:/);
    expect(CODE).not.toMatch(/checkout|apt-get|apt install|npm |pnpm |pip |curl |wget /);
  });

  it("secrets de l'environnement dans la seule étape, en variables libpq ; TLS vérifié", () => {
    const secrets = [...WORKFLOW.matchAll(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
    expect(secrets).toEqual(["P0_PURGE_PGHOST", "P0_PURGE_PGDATABASE", "P0_PURGE_PGUSER", "P0_PURGE_PGPASSWORD"]);
    const env = LIGNES.slice(LIGNES.findIndex((l) => l.trim() === "env:") + 1, LIGNES.findIndex((l) => l.trim().startsWith("run:"))).map((l) => l.trim());
    expect(env).toEqual([
      "PGHOST: ${{ secrets.P0_PURGE_PGHOST }}",
      "PGDATABASE: ${{ secrets.P0_PURGE_PGDATABASE }}",
      "PGUSER: ${{ secrets.P0_PURGE_PGUSER }}",
      "PGPASSWORD: ${{ secrets.P0_PURGE_PGPASSWORD }}",
      "PGSSLMODE: verify-full",
      "PGSSLROOTCERT: system",
    ]);
    // L'étape est la seule à porter un env:, et rien n'est posé au niveau du workflow ou du job.
    expect(LIGNES.filter((l) => l.trim() === "env:")).toEqual(["        env:"]);
    expect(CODE).not.toMatch(/sslmode=require|PGSSLMODE: require/);
  });

  it("psql -X -v ON_ERROR_STOP=1 sans argument de connexion, sortie redirigée, rôle de session vérifié avant la purge", () => {
    const appels = LIGNES.filter((l) => /\bpsql\b/.test(l) && !l.includes("echo"));
    expect(appels.map((l) => l.trim())).toEqual(["psql -X -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL' || status=$?"]);
    expect(appels[0]).not.toMatch(/\s(-h|-p|-U|-d|--host|--port|--username|--dbname)\b|postgres(ql)?:\/\//);
    const requete = WORKFLOW.slice(WORKFLOW.indexOf("<<'SQL'"), WORKFLOW.lastIndexOf("SQL"));
    expect(requete).toContain("IF session_user <> 'vadrouille_prototype_purge' THEN");
    expect(requete).toContain("RAISE EXCEPTION");
    expect(requete.indexOf("session_user")).toBeLessThan(requete.indexOf("SELECT prototype.purge_expired();"));
    expect(requete.match(/\bSELECT\b|\bDELETE\b|\bUPDATE\b|\bINSERT\b/g)).toEqual(["SELECT"]);
    expect(WORKFLOW).toContain('echo "psql : code de sortie ${status}"');
  });
});

describe("ci: l'environnement p0-purge n'est nommé que par p0-purge.yml", () => {
  it("aucun autre workflow ne nomme l'environnement ni ses secrets", () => {
    for (const fichier of readdirSync(DOSSIER).filter((f) => /\.ya?ml$/.test(f) && f !== "p0-purge.yml")) {
      const texte = readFileSync(path.join(DOSSIER, fichier), "utf8");
      expect(texte, fichier).not.toMatch(/p0-purge|P0_PURGE_/);
    }
  });
});
