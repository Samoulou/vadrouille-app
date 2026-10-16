// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { ReponseModele } from "@/ai/client";
import { lirePlan, lireTour } from "@/ai/sorties";
import type { Brief } from "@/prototype/brief";
import { ConfigRechercheSchema } from "@/prototype/config";
import { chercherCandidats } from "@/research/agent";

/**
 * Ticket 400 : la recherche réelle de l'essai 2 s'est arrêtée après deux appels de modèle (plan, puis un tour sans
 * recherche web) et a rendu 0 candidat sans erreur. Rejoué ici en mode simulé seulement (réponses de modèle
 * fabriquées, recherche web et lecture de pages simulées ; aucun appel réel). Deux sorties de modèle reproduisent
 * exactement ce compte : un objet JSON dans un bloc de code Markdown (refusé en entier, lu comme `termine`) et
 * `termine: true` dès le premier tour, avant toute recherche.
 */

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const brief = JSON.parse(readFileSync(path.join(RACINE, "prototype/briefs/edimbourg-1.json"), "utf8")) as Brief;
const config = ConfigRechercheSchema.parse(JSON.parse(readFileSync(path.join(RACINE, "prototype/config/recherche-essai.json"), "utf8")));

const URL_SOURCE = "https://guide.example/musees";
const PLAN = JSON.stringify({ requetes: [{ requete: "musées Édimbourg", creneau: "activity" }] });
const RECHERCHER = { type: "rechercher", requete: "musées Édimbourg" };
const CANDIDAT = {
  nom: "Musée maison",
  resume: "Un musée écrit par nous.",
  categorie: "museum",
  typeEtape: "activity",
  sourceUrl: URL_SOURCE,
  sourceDate: "2026-09-01",
  aReserver: false,
};
const tour = (valeur: Record<string, unknown>) => JSON.stringify({ actions: [], candidats: [], termine: false, ...valeur });
const enBloc = (texte: string) => "Voici ma réponse :\n```json\n" + texte + "\n```\n";

async function rejouer(reponses: (string | ReponseModele)[]) {
  let appels = 0;
  const requetesWeb: string[] = [];
  const resultat = await chercherCandidats(brief, {
    modeles: {
      envoyer: async () => {
        appels += 1;
        const reponse = reponses.shift() ?? tour({ termine: true });
        return typeof reponse === "string" ? { texte: reponse, coutUsd: 0 } : reponse;
      },
    },
    modele: "fournisseur/recherche-test",
    routage: { data_collection: "deny" },
    recherche: {
      rechercher: async (requete) => {
        requetesWeb.push(requete);
        return { resultats: [{ url: URL_SOURCE, titre: "Musées", extrait: "Extrait." }], coutUsd: 0 };
      },
    },
    lecteur: { lire: async () => ({ ok: false, raison: "not_in_search_results" }) },
    config,
  });
  return { appels, requetesWeb, ...resultat };
}

describe("ia: sorties de modèle habillées (ticket 400)", () => {
  it("objet JSON dans un bloc de code, après une phrase ou un raisonnement : lu, schéma toujours strict", () => {
    expect(lirePlan(enBloc(PLAN)).valeur).toEqual([{ requete: "musées Édimbourg", creneau: "activity" }]);
    expect(lirePlan(`<think>{"brouillon": 1}</think>\n${PLAN}`).valeur).toHaveLength(1);
    expect(lirePlan(`Plan : ${PLAN} Bonne recherche.`).valeur).toHaveLength(1);
    expect(lireTour(enBloc(tour({ actions: [RECHERCHER] }))).valeur.actions).toEqual([RECHERCHER]);
    // Clé inconnue à la racine : toujours refusée en entier.
    expect(lirePlan(enBloc(JSON.stringify({ requetes: [], autre: 1 })))).toEqual({ valeur: [], refuses: 1, illisible: true });
  });

  it("réponse sans objet JSON (texte vide, prose) : illisible, et le tour ne termine pas la boucle", () => {
    for (const texte of ["", "Je vais chercher des musées.", "```json\n{ pas du json\n```"]) {
      expect(lireTour(texte)).toEqual({ valeur: { actions: [], candidats: [], termine: false }, refuses: 1, illisible: true });
      expect(lirePlan(texte).illisible).toBe(true);
    }
  });
});

describe("ia: agent de recherche, arrêt prématuré sans candidat (ticket 400)", () => {
  it("bloc de code au plan et aux tours : lus, la recherche web part et le candidat est retenu", async () => {
    const { appels, requetesWeb, candidats, compteurs } = await rejouer([
      enBloc(PLAN),
      enBloc(tour({ actions: [RECHERCHER] })),
      enBloc(tour({ candidats: [CANDIDAT], termine: true })),
    ]);
    expect(requetesWeb).toEqual(["musées Édimbourg"]);
    expect(candidats.map((c) => c.nom)).toEqual(["Musée maison"]);
    expect(appels).toBe(3);
    expect(compteurs.sortiesIllisibles).toEqual({ plan: 0, recherche: 0 });
  });

  it("« termine » au premier tour, avant toute recherche : ignoré et compté ; la boucle continue jusqu'à une recherche", async () => {
    const { requetesWeb, candidats, compteurs } = await rejouer([
      PLAN,
      // Candidat donné de mémoire, sans source vue : écarté ; `termine` ignoré.
      tour({ actions: [RECHERCHER], candidats: [CANDIDAT], termine: true }),
      tour({ candidats: [CANDIDAT], termine: true }),
    ]);
    expect(compteurs.terminesIgnores).toBe(1);
    expect(compteurs.candidatsRefuses.source_not_in_results).toBe(1);
    expect(requetesWeb).toHaveLength(1);
    expect(candidats).toHaveLength(1);
  });

  it("sorties illisibles à chaque tour : la boucle va jusqu'à toursMax (bornée), 0 candidat, compteurs à jour", async () => {
    const { appels, requetesWeb, candidats, compteurs } = await rejouer(["", ...Array.from({ length: config.toursMax }, () => "pas de JSON")]);
    expect(appels).toBe(1 + config.toursMax);
    expect(requetesWeb).toEqual([]);
    expect(candidats).toEqual([]);
    expect(compteurs).toMatchObject({ tours: config.toursMax, sortiesIllisibles: { plan: 1, recherche: config.toursMax }, sortiesRefusees: { plan: 1, recherche: config.toursMax } });
  });

  it("« termine » toujours avant recherche : ignoré à chaque tour, au plus toursMax tours", async () => {
    const { appels, compteurs } = await rejouer([PLAN, ...Array.from({ length: 10 }, () => tour({ termine: true }))]);
    expect(appels).toBe(1 + config.toursMax);
    expect(compteurs.terminesIgnores).toBe(config.toursMax);
  });

  it("raison de fin autre que « stop » (réponse tronquée) : comptée, jamais le texte", async () => {
    const { compteurs } = await rejouer([
      { texte: PLAN, coutUsd: 0, fin: "length" },
      { texte: tour({ actions: [RECHERCHER] }), coutUsd: 0, fin: "stop" },
      { texte: tour({ termine: true }), coutUsd: 0 },
    ]);
    expect(compteurs.finsAnormales).toBe(1);
  });
});
