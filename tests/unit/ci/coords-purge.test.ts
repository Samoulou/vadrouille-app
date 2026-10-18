// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * `purge: coordonnées supprimées au plus tard à 30 jours` (décision 0060 § 3.1 et § 4, B8c), partie statique : test de
 * `.github/workflows/coords-purge.yml` sur le modèle de `tests/unit/ci/p0-purge.test.ts` (clés, déclencheurs et `cron`
 * exacts, `permissions: {}`, concurrence, un job et une étape, `ubuntu-24.04`, aucune action `uses:`, secrets
 * `COORDS_PURGE_PG*` dans l'étape seule, `verify-full` et `system`, `psql` sans argument de connexion, `session_user`
 * vérifié avant l'unique `SELECT`, sortie redirigée). Lecture du texte, sans analyseur YAML. La partie base (rôle de
 * purge) est dans `tests/db/coordonnees.test.ts`.
 */

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const DOSSIER = path.join(RACINE, ".github/workflows");
const WORKFLOW = readFileSync(path.join(DOSSIER, "coords-purge.yml"), "utf8");
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

describe("purge: coordonnées supprimées au plus tard à 30 jours (coords-purge.yml, 0060 § 3.1)", () => {
  it("clés de premier niveau, déclencheurs schedule (03:17, 09:17, 15:17, 21:17 UTC) et workflow_dispatch seulement", () => {
    expect(CLES_RACINE).toEqual(["name", "on", "permissions", "concurrency", "jobs"]);
    expect(bloc("name")).toEqual(["name: coords-purge"]);
    expect(bloc("on").map((l) => l.trim())).toEqual(["on:", "schedule:", '- cron: "17 3-21/6 * * *"', "workflow_dispatch:"]);
  });

  it("permissions: {} ; concurrency coords-purge sans annulation", () => {
    expect(bloc("permissions")).toEqual(["permissions: {}"]);
    expect(bloc("concurrency").map((l) => l.trim())).toEqual(["concurrency:", "group: coords-purge", "cancel-in-progress: false"]);
    expect(WORKFLOW).not.toMatch(/^\s+permissions:/m);
  });

  it("un seul job : main seulement, ubuntu-24.04 épinglé, environnement coords-purge, 5 minutes, une seule étape", () => {
    const jobs = bloc("jobs");
    expect(jobs.filter((l) => /^ {2}\S/.test(l)).map((l) => l.trim())).toEqual(["purge:"]);
    const job = jobs.filter((l) => /^ {4}\S/.test(l)).map((l) => l.trim());
    expect(job).toEqual(["if: github.ref == 'refs/heads/main'", "runs-on: ubuntu-24.04", "environment: coords-purge", "timeout-minutes: 5", "steps:"]);
    expect(WORKFLOW).not.toContain("ubuntu-latest");
    expect(jobs.filter((l) => /^ {6}- /.test(l))).toHaveLength(1);
  });

  it("aucune action uses:, ni checkout, ni installation de paquets", () => {
    expect(CODE).not.toMatch(/\buses:/);
    expect(CODE).not.toMatch(/checkout|apt-get|apt install|npm |pnpm |pip |curl |wget /);
  });

  it("secrets de l'environnement dans la seule étape, en variables libpq ; TLS vérifié", () => {
    const secrets = [...WORKFLOW.matchAll(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
    expect(secrets).toEqual(["COORDS_PURGE_PGHOST", "COORDS_PURGE_PGDATABASE", "COORDS_PURGE_PGUSER", "COORDS_PURGE_PGPASSWORD"]);
    const env = LIGNES.slice(LIGNES.findIndex((l) => l.trim() === "env:") + 1, LIGNES.findIndex((l) => l.trim().startsWith("run:"))).map((l) => l.trim());
    expect(env).toEqual([
      "PGHOST: ${{ secrets.COORDS_PURGE_PGHOST }}",
      "PGDATABASE: ${{ secrets.COORDS_PURGE_PGDATABASE }}",
      "PGUSER: ${{ secrets.COORDS_PURGE_PGUSER }}",
      "PGPASSWORD: ${{ secrets.COORDS_PURGE_PGPASSWORD }}",
      "PGSSLMODE: verify-full",
      "PGSSLROOTCERT: system",
    ]);
    // L'étape est la seule à porter un env:, et rien n'est posé au niveau du workflow ou du job.
    expect(LIGNES.filter((l) => l.trim() === "env:")).toEqual(["        env:"]);
    expect(CODE).not.toMatch(/sslmode=require|PGSSLMODE: require/);
    expect(CODE).not.toMatch(/\bvars\./);
  });

  it("psql -X -v ON_ERROR_STOP=1 sans argument de connexion, sortie redirigée, session_user vérifié avant l'unique SELECT", () => {
    const appels = LIGNES.filter((l) => /\bpsql\b/.test(l) && !l.includes("echo"));
    expect(appels.map((l) => l.trim())).toEqual(["psql -X -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL' || status=$?"]);
    expect(appels[0]).not.toMatch(/\s(-h|-p|-U|-d|--host|--port|--username|--dbname)\b|postgres(ql)?:\/\//);
    const requete = WORKFLOW.slice(WORKFLOW.indexOf("<<'SQL'"), WORKFLOW.lastIndexOf("SQL"));
    expect(requete).toContain("IF session_user <> 'vadrouille_coords_purge' THEN");
    expect(requete).toContain("RAISE EXCEPTION");
    expect(requete.indexOf("session_user")).toBeLessThan(requete.indexOf("SELECT public.purge_expired_coordinates();"));
    expect(requete.match(/\bSELECT\b|\bDELETE\b|\bUPDATE\b|\bINSERT\b|\bPERFORM\b|\bEXECUTE\b/g)).toEqual(["SELECT"]);
    expect(WORKFLOW).toContain('echo "psql : code de sortie ${status}"');
    expect(WORKFLOW).toContain('exit "${status}"');
  });

  it("le texte, commentaires compris, ne nomme ni l'environnement ni les secrets de la purge du prototype", () => {
    expect(WORKFLOW).not.toMatch(/p0-purge|P0_PURGE_/);
  });
});

describe("ci: l'environnement coords-purge n'est nommé que par coords-purge.yml", () => {
  it("aucun autre workflow ne nomme l'environnement ni ses secrets", () => {
    const autres = readdirSync(DOSSIER).filter((f) => /\.ya?ml$/.test(f) && f !== "coords-purge.yml");
    expect(autres).toContain("p0-purge.yml");
    for (const fichier of autres) {
      const texte = readFileSync(path.join(DOSSIER, fichier), "utf8");
      expect(texte, fichier).not.toMatch(/coords-purge|COORDS_PURGE_/);
    }
  });
});
