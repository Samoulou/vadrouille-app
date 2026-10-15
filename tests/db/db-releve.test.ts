import { afterAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../db/migrate";
import { urlBaseJetable } from "./env";
import { closeAll, connect, unique } from "./helpers";
import { creerBase, ETAPE_RELEVE, executer, requeteAdmin, supprimerBases } from "./workflows-harnais";

/**
 * Relevé `db-releve` sur le serveur de la CI (décision 0057, « Tests imposés », partie avec base) : le bloc `run:` du
 * workflow, joué tel quel sous `vadrouille_prototype_purge` dans une base jetable migrée (harnais de
 * `tests/db/workflows-harnais.ts`, Q412). Contrôle des caractères de contrôle et de `|` des blocs `DO` (§ 3) ; relevé
 * conforme : lignes R affichées, compteurs lues = affichées + 4.
 */

afterAll(async () => {
  await closeAll();
  await supprimerBases();
});

const WF = "db-releve.yml";

async function baseMigree(suffixe: string): Promise<string> {
  const base = await creerBase(suffixe);
  await runMigrations({ VADROUILLE_DATABASE_URL_MIGRATOR: urlBaseJetable("migrator", base) });
  return base;
}

function relever(base: string) {
  return executer(WF, ETAPE_RELEVE, { base, login: "p0_purge" });
}

const COMPTEURS = /^Lignes lues : (\d+) ; affichées : (\d+) ; masquées : (\d+) ; code de sortie de psql : (\d+)$/m;

describe("db-releve : relevé de la base migrée (0057 § 3 à § 5)", () => {
  it("relevé conforme : lignes R1 à R8 affichées, lues = affichées + 4, verrou S8 vu par surcharge", async () => {
    const base = await baseMigree("rl_conforme");
    const r = relever(base);
    expect(r.code, r.sortie).toBe(0);
    const [, lues, affichees, masquees, code] = COMPTEURS.exec(r.sortie)!;
    expect(Number(lues)).toBe(Number(affichees) + 4);
    expect(masquees).toBe("4");
    expect(code).toBe("0");
    const lignes = r.sortie.split("\n").filter((l) => /^R[1-8]\|/.test(l));
    expect(lignes).toHaveLength(Number(affichees));
    for (const etiquette of ["R1", "R3", "R4", "R5", "R6", "R8"]) expect(lignes.some((l) => l.startsWith(`${etiquette}|`)), etiquette).toBe(true);
    expect(lignes).toContain("R8|public.store_prototype_coordinates(uuid,text,double precision,double precision)|f");
    expect(lignes).toContain("R1|plpgsql|1.0|pg_catalog");
  });

  it("contrôle de chiffrement gardé : refusé sans connexion, aucune ligne R affichée (0067)", async () => {
    const base = await creerBase("rl_ssl");
    const r = executer(WF, ETAPE_RELEVE, { base, login: "p0_purge", garderSsl: true });
    expect(r.code).toBe(1);
    expect(r.sortie).toContain("Échec : chiffrement : variables PG* hors liste, ou PGSSLMODE autre que verify-full");
    expect(r.sortie).not.toContain("Échec : psql");
    expect(r.sortie).not.toMatch(/^R[1-8]\|/m);
  });

  it("un nom de rôle qui contient un saut de ligne fait échouer la session avant BEGIN, aucune ligne affichée", async () => {
    const base = await creerBase("rl_role");
    const role = `x_${unique()}\nR3|faux`;
    const admin = await connect("admin");
    await admin.query(`CREATE ROLE "${role}" NOLOGIN`);
    try {
      const r = relever(base);
      expect(r.code).toBe(1);
      expect(r.sortie).toContain("Échec : psql");
      expect(r.sortie).not.toMatch(/^R[1-8]\|/m);
      expect(r.sortie).not.toContain("faux");
      expect(COMPTEURS.exec(r.sortie)?.[2]).toBe("0");
    } finally {
      await admin.query(`DROP ROLE "${role}"`);
    }
  });

  it("un nom de colonne R5 qui contient quatre | (droit par colonne) fait échouer la session avant BEGIN", async () => {
    const base = await creerBase("rl_colonne");
    await requeteAdmin(base, `CREATE TABLE public.t_releve ("a|r|o|{x}|t" text); GRANT SELECT ("a|r|o|{x}|t") ON public.t_releve TO vadrouille_app`);
    const r = relever(base);
    expect(r.code).toBe(1);
    expect(r.sortie).toContain("Échec : psql");
    expect(r.sortie).not.toMatch(/^R[1-8]\|/m);
    expect(COMPTEURS.exec(r.sortie)?.[2]).toBe("0");
  });
});
