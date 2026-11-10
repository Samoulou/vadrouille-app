// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PREVENTE_PLAFOND_REPONSES_JOUR, type PreventeReponse } from "@/contracts/prevente-mesure";
import type { PoolPrevente } from "@/server/prevente/pool";
import { creerReponsesPrevente, REQUETE_ENREGISTRER_REPONSE, VerdictPreventeIllisibleError } from "@/server/prevente/reponses";

/**
 * Écriture d'une réponse au questionnaire et lecture du verdict, sans base (spécification
 * `specs/C2-prevente-mesure.md`, § 3.4 point 3 et § 4 ; tâche C2c, ticket 1137 ; décision 0177 § 7 ; critères C1, C7 et
 * C8 côté module). Le même module est éprouvé sur une vraie base par `tests/db/prevente-reponses.test.ts`.
 */

const RACINE = path.resolve(__dirname, "../../..");
const REQUETE = "SELECT public.prevente_enregistrer_reponse($1::text, $2::text, $3::text, $4::text, $5::text[], $6::text[], $7::text) AS verdict";

const REPONSE: PreventeReponse = {
  src: "forum",
  parcours: "precommande",
  destination: "Lisbonne",
  periode: "paques",
  preparation: ["assistant", "agence"],
  motifs: ["prix", "demonstration"],
  decouverte: "ami",
};

function poolEspion(rendu: unknown = { rows: [{ verdict: "admise" }] }): { pool: PoolPrevente; requetes: [string, unknown[] | undefined][] } {
  const requetes: [string, unknown[] | undefined][] = [];
  return {
    requetes,
    pool: {
      query: async (text, values) => {
        requetes.push([text, values]);
        return rendu;
      },
    },
  };
}

describe("réponses Postgres : une seule requête, la fonction d'écriture", () => {
  it("C1 — une requête au texte constant, sept arguments dans l'ordre de la fonction ; le verdict « admise » est rendu", async () => {
    const { pool, requetes } = poolEspion();
    expect(await creerReponsesPrevente({ creerPool: () => pool }).enregistrer(REPONSE)).toBe("admise");
    expect(REQUETE_ENREGISTRER_REPONSE).toBe(REQUETE);
    expect(requetes).toEqual([[REQUETE, ["forum", "precommande", "Lisbonne", "paques", ["assistant", "agence"], ["prix", "demonstration"], "ami"]]]);
    expect(requetes[0]?.[1]).toHaveLength(7);
  });

  it("questions sans réponse : null et listes vides, toujours sept arguments", async () => {
    const { pool, requetes } = poolEspion();
    await creerReponsesPrevente({ creerPool: () => pool }).enregistrer({ src: "direct", parcours: "visite", destination: null, periode: null, preparation: [], motifs: ["autre"], decouverte: null });
    expect(requetes).toEqual([[REQUETE, ["direct", "visite", null, null, [], ["autre"], null]]]);
  });

  it("C7 — verdict « plafond_atteint » rendu tel quel", async () => {
    const { pool } = poolEspion({ rows: [{ verdict: "plafond_atteint" }] });
    expect(await creerReponsesPrevente({ creerPool: () => pool }).enregistrer(REPONSE)).toBe("plafond_atteint");
  });

  it.each([
    ["aucune ligne", { rows: [] }],
    ["résultat sans lignes", {}],
    ["résultat absent", null],
    ["colonne absente", { rows: [{ prevente_enregistrer_reponse: "admise" }] }],
    ["valeur nulle", { rows: [{ verdict: null }] }],
    ["autre valeur", { rows: [{ verdict: "refusee" }] }],
    ["casse différente", { rows: [{ verdict: "Admise" }] }],
    ["nombre", { rows: [{ verdict: 1 }] }],
  ])("C8 — verdict illisible (%s) : VerdictPreventeIllisibleError, sans valeur", async (_nom, rendu) => {
    const { pool } = poolEspion(rendu);
    const erreur = await creerReponsesPrevente({ creerPool: () => pool })
      .enregistrer(REPONSE)
      .catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(VerdictPreventeIllisibleError);
    expect((erreur as Error).name).toBe("VerdictPreventeIllisibleError");
    expect(JSON.stringify({ ...(erreur as Error), message: (erreur as Error).message })).not.toMatch(/refusee|Admise|Lisbonne|forum/);
  });

  it.each([
    ["provenance interne", { ...REPONSE, src: "interne" }],
    ["provenance hors liste", { ...REPONSE, src: "inconnu-123" }],
    ["parcours inconnu", { ...REPONSE, parcours: "paiement" }],
    ["motifs de l'autre parcours", { ...REPONSE, motifs: ["pas-de-voyage"] }],
    ["réponse entièrement vide", { src: "forum", parcours: "visite", destination: null, periode: null, preparation: [], motifs: [], decouverte: null }],
    ["destination de 81 caractères", { ...REPONSE, destination: "x".repeat(81) }],
    ["clé de plus (plafond)", { ...REPONSE, plafond: 1 }],
  ])("revalidée avant toute requête : %s refusée, rien ne part", async (_nom, reponse) => {
    const { pool, requetes } = poolEspion();
    await expect(creerReponsesPrevente({ creerPool: () => pool }).enregistrer(reponse as never)).rejects.toBeDefined();
    expect(requetes).toEqual([]);
  });

  it("une erreur de la requête, ou de la garde de connexion, remonte à l'appelant", async () => {
    const erreur = Object.assign(new Error("function public.prevente_enregistrer_reponse does not exist"), { code: "42883" });
    await expect(creerReponsesPrevente({ creerPool: () => ({ query: () => Promise.reject(erreur) }) }).enregistrer(REPONSE)).rejects.toBe(erreur);
    const garde = new Error("garde");
    const refusee = creerReponsesPrevente({
      creerPool: () => {
        throw garde;
      },
    });
    await expect(refusee.enregistrer(REPONSE)).rejects.toBe(garde);
  });
});

describe("C7 — forme : le code de l'application ne compte jamais les réponses du jour", () => {
  const FICHIERS = ["src/server/prevente/reponses.ts", "src/server/prevente/questionnaire.ts", "src/server/prevente/pool.ts", "src/server/actions/prevente-questionnaire.ts", "src/config/prevente.ts"];

  it("le module d'écriture ne contient que la requête de la décision 0177 § 7 : aucune table, aucune autre fonction, aucun mot de lecture ou d'écriture directe", () => {
    const source = readFileSync(path.join(RACINE, "src/server/prevente/reponses.ts"), "utf8");
    expect(source.match(/public\.[a-z_]+/g)).toEqual(["public.prevente_enregistrer_reponse"]);
    expect(source.match(/\bSELECT\b/g)).toHaveLength(1);
    expect(source).not.toMatch(/\b(INSERT|UPDATE|DELETE|FROM|COUNT)\b|count\(|\$8/);
    expect(source).not.toMatch(/p_plafond/);
    // Le plafond n'est ni importé ni passé : la base applique le sien.
    expect(source).not.toContain("PREVENTE_PLAFOND_REPONSES_JOUR");
    expect(PREVENTE_PLAFOND_REPONSES_JOUR).toBe(200);
  });

  it("aucun fichier de l'envoi ne nomme une table de la mesure ni le plafond", () => {
    for (const fichier of FICHIERS) {
      const texte = readFileSync(path.join(RACINE, fichier), "utf8");
      expect(texte, fichier).not.toMatch(/prevente_reponses|prevente_visites|PREVENTE_PLAFOND_REPONSES_JOUR|p_plafond/);
    }
  });

  it("le cas d'usage ne lit ni l'adresse IP, ni Referer, ni l'adresse de la page (C10, C11)", () => {
    const source = readFileSync(path.join(RACINE, "src/server/prevente/questionnaire.ts"), "utf8");
    expect(source).not.toMatch(/from "@\/server\/ip"|trustedIpKey|\.get\("referer"\)|searchParams|new URL\(/i);
    expect(source).not.toMatch(/entetes\.get\(/);
  });
});
