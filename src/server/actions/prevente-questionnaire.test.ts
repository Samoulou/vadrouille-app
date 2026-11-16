// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHEMIN_QUESTIONNAIRE_PREVENTE, CHEMIN_QUESTIONNAIRE_PREVENTE_MERCI } from "@/config/prevente";
import { PREVENTE_ETAT_ENVOI_INITIAL, type PreventeEtatEnvoi } from "@/contracts/prevente-mesure";

import * as action from "./prevente-questionnaire";

/**
 * Action serveur de l'envoi du questionnaire de la prévente (spécification `specs/C2-prevente-mesure.md`, § 3.3 point 5 ;
 * tâche C2c, ticket 1137 ; décision 0177 § 3 et § 5 point 3 ; critère C9, et C8 côté action). Le cas d'usage est doublé
 * (il est éprouvé par `tests/unit/prevente/questionnaire.test.ts`) ; `redirect` lève, comme celui de Next.js.
 *
 * Non exécuté ici : le code 303 de la réponse et l'envoi sans JavaScript, relevés sur l'application construite par C2f.
 */

class Redirection extends Error {
  override name = "Redirection";

  constructor(readonly cible: string) {
    super("NEXT_REDIRECT");
  }
}

const banc = vi.hoisted(() => ({
  resultat: { statut: "envoyee" } as { statut: string; saisie?: unknown },
  appels: [] as { donnees: FormData; entetes: Headers; recus: number }[],
  redirections: [] as string[],
  entetes: { "x-vercel-forwarded-for": "203.0.113.9" } as Record<string, string>,
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers(banc.entetes) }));
vi.mock("next/navigation", () => ({
  redirect: (cible: string) => {
    banc.redirections.push(cible);
    throw new Redirection(cible);
  },
}));
vi.mock("@/server/prevente/questionnaire", () => ({
  envoyerQuestionnaire: async (...args: [FormData, Headers]) => {
    banc.appels.push({ donnees: args[0], entetes: args[1], recus: args.length });
    return banc.resultat;
  },
}));

const SAISIE = { destination: "Lisbonne", periode: null, preparation: [], motifs: ["prix"], decouverte: null };

beforeEach(() => {
  banc.resultat = { statut: "envoyee" };
  banc.appels = [];
  banc.redirections = [];
});

describe("C9 — envoi accepté : redirection vers l'état « Merci »", () => {
  it("redirect est appelé une fois avec CHEMIN_QUESTIONNAIRE_PREVENTE_MERCI, et sa levée remonte de l'action (hors de tout try)", async () => {
    const erreur = await action.envoyerQuestionnairePrevente(PREVENTE_ETAT_ENVOI_INITIAL, new FormData()).catch((e: unknown) => e);
    // Une redirection avalée par un `try` rendrait un état au lieu de lever.
    expect(erreur).toBeInstanceOf(Redirection);
    expect((erreur as Redirection).cible).toBe(CHEMIN_QUESTIONNAIRE_PREVENTE_MERCI);
    expect(banc.redirections).toEqual(["/precommande/questionnaire/merci"]);
  });

  it("l'adresse d'arrivée ne porte aucun paramètre, et prolonge celle du questionnaire", () => {
    expect(CHEMIN_QUESTIONNAIRE_PREVENTE).toBe("/precommande/questionnaire");
    expect(CHEMIN_QUESTIONNAIRE_PREVENTE_MERCI).toBe(`${CHEMIN_QUESTIONNAIRE_PREVENTE}/merci`);
    expect(CHEMIN_QUESTIONNAIRE_PREVENTE_MERCI).not.toMatch(/[?#&=]/);
  });

  it("forme : redirect n'est dans aucun try, l'action n'en contient pas", () => {
    const source = readFileSync(path.join(__dirname, "prevente-questionnaire.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/\btry\b|\bcatch\b/);
    expect(code.match(/\bredirect\(/g)).toHaveLength(1);
  });
});

describe("refus : l'état du cas d'usage est rendu tel quel, sans redirection", () => {
  it.each([
    { statut: "validation_failed", saisie: null },
    { statut: "reponse_vide", saisie: null },
    { statut: "indisponible", saisie: null },
    { statut: "rate_limited", saisie: SAISIE },
    { statut: "provider_error", saisie: SAISIE },
  ] as PreventeEtatEnvoi[])("$statut", async (etat) => {
    banc.resultat = etat;
    expect(await action.envoyerQuestionnairePrevente(PREVENTE_ETAT_ENVOI_INITIAL, new FormData())).toEqual(etat);
    expect(banc.redirections).toEqual([]);
  });
});

describe("l'action ne porte aucune logique", () => {
  it("transmet le formulaire reçu et les en-têtes de la requête au cas d'usage, sans dépendance injectée ; l'état précédent n'est pas lu", async () => {
    banc.resultat = { statut: "reponse_vide", saisie: null };
    const donnees = new FormData();
    donnees.append("src", "forum");
    const precedent: PreventeEtatEnvoi = {
      get statut(): never {
        throw new Error("état précédent lu");
      },
      get saisie(): never {
        throw new Error("état précédent lu");
      },
    };
    await action.envoyerQuestionnairePrevente(precedent, donnees);
    expect(banc.appels).toHaveLength(1);
    expect(banc.appels[0]?.donnees).toBe(donnees);
    expect(banc.appels[0]?.recus).toBe(2);
    expect(Object.fromEntries(banc.appels[0]?.entetes.entries() ?? [])).toEqual(banc.entetes);
  });

  it("une seule exportation : envoyerQuestionnairePrevente ; prologue \"use server\"", () => {
    expect(Object.keys(action)).toEqual(["envoyerQuestionnairePrevente"]);
    expect(readFileSync(path.join(__dirname, "prevente-questionnaire.ts"), "utf8").startsWith('"use server";\n')).toBe(true);
  });
});
