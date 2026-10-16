// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Brief } from "@/prototype/brief";
import { ConfigRechercheSchema } from "@/prototype/config";
import type { AppelAgent, EtatAgent } from "@/research/agent";

import { chercherCandidatsP0 } from "./agent-p0";

/**
 * Ticket 407 (diagnostic de l'essai 4) : la fenêtre des appels de modèle de l'étape de recherche s'est fermée pendant
 * la boucle de l'agent ; la réservation suivante a été refusée (`cap_reached`) et le refus a arrêté toute l'exécution
 * (`pipeline_failed`). L'agent demande désormais, avant chaque appel de modèle, chaque recherche web et chaque lecture
 * de page, s'il a encore le temps (`peutAppeler`) ; sinon, il se termine proprement avec les candidats déjà admis.
 * Mode simulé seulement (réponses fabriquées, aucun appel réel).
 */

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const brief = JSON.parse(readFileSync(path.join(RACINE, "prototype/briefs/edimbourg-1.json"), "utf8")) as Brief;
const config = ConfigRechercheSchema.parse(JSON.parse(readFileSync(path.join(RACINE, "prototype/config/recherche-essai.json"), "utf8")));

const URL_SOURCE = "https://guide.example/musees";
const PLAN = JSON.stringify({ requetes: [{ requete: "musées Édimbourg", creneau: "activity" }] });
const RECHERCHER = { type: "rechercher", requete: "musées Édimbourg" };
const LIRE = { type: "lire", url: URL_SOURCE };
const candidat = (nom: string) => ({
  nom,
  resume: "Un musée écrit par nous.",
  categorie: "museum",
  typeEtape: "activity",
  sourceUrl: URL_SOURCE,
  sourceDate: "2026-09-01",
  aReserver: false,
});
const tour = (valeur: Record<string, unknown>) => JSON.stringify({ actions: [], candidats: [], termine: false, ...valeur });

/**
 * Rejoue l'agent ; `admis(appel, rang)` répond à `peutAppeler` (rang : 1 pour la première demande de ce type d'appel).
 * Journal : ordre des demandes et des appels partis.
 */
async function rejouer(reponses: string[], admis: (appel: AppelAgent, rang: number) => boolean) {
  const journal: string[] = [];
  const rangs = new Map<AppelAgent, number>();
  let etat: EtatAgent | undefined;
  const resultat = await chercherCandidatsP0(brief, {
    modeles: {
      envoyer: async () => {
        journal.push("modele");
        return { texte: reponses.shift() ?? tour({ termine: true }), coutUsd: 0 };
      },
    },
    modele: "fournisseur/recherche-test",
    routage: { data_collection: "deny" },
    recherche: {
      rechercher: async () => {
        journal.push("recherche_web");
        return { resultats: [{ url: URL_SOURCE, titre: "Musées", extrait: "Extrait." }], coutUsd: 0 };
      },
    },
    lecteur: {
      lire: async () => {
        journal.push("page");
        return { ok: true, texte: "Page de musée." };
      },
    },
    config,
    peutAppeler: (appel) => {
      const rang = (rangs.get(appel) ?? 0) + 1;
      rangs.set(appel, rang);
      const oui = admis(appel, rang);
      journal.push(`${oui ? "oui" : "non"}:${appel}`);
      return oui;
    },
    observer: (vivant) => {
      etat = vivant;
    },
  });
  return { journal, etat, ...resultat };
}

describe("ia: agent de recherche, fin propre à l'échéance de l'étape (ticket 407)", () => {
  it("échéance avant le plan : aucun appel, aucun candidat, fin comptée", async () => {
    const { journal, candidats, compteurs } = await rejouer([PLAN], () => false);
    expect(journal).toEqual(["non:modele"]);
    expect(candidats).toEqual([]);
    expect(compteurs).toMatchObject({ tours: 0, recherches: 0, finsEcheance: 1 });
  });

  it("échéance avant un tour : la boucle s'arrête, les candidats déjà admis sont gardés, aucun appel après le refus", async () => {
    const { journal, candidats, compteurs } = await rejouer(
      [PLAN, tour({ actions: [RECHERCHER] }), tour({ candidats: [candidat("Musée maison")], actions: [RECHERCHER] })],
      // Plan, tours 1 et 2 admis ; le tour 3 est refusé.
      (appel, rang) => appel !== "modele" || rang <= 3,
    );
    expect(candidats.map((c) => c.nom)).toEqual(["Musée maison"]);
    expect(compteurs).toMatchObject({ tours: 2, recherches: 2, finsEcheance: 1 });
    expect(journal.at(-1)).toBe("non:modele");
    expect(journal.filter((entree) => entree === "modele")).toHaveLength(3);
  });

  it("échéance avant une recherche web : aucune recherche ni tour de plus, candidats gardés", async () => {
    const { journal, candidats, compteurs } = await rejouer(
      [PLAN, tour({ actions: [RECHERCHER] }), tour({ candidats: [candidat("Musée maison")], actions: [RECHERCHER, RECHERCHER] })],
      (appel, rang) => appel !== "recherche_web" || rang <= 1,
    );
    expect(candidats.map((c) => c.nom)).toEqual(["Musée maison"]);
    expect(compteurs).toMatchObject({ tours: 2, recherches: 1, finsEcheance: 1 });
    expect(journal.slice(-2)).toEqual(["modele", "non:recherche_web"]);
  });

  it("échéance avant une lecture de page : aucune lecture ni tour de plus", async () => {
    const { journal, candidats, compteurs } = await rejouer(
      [PLAN, tour({ actions: [RECHERCHER] }), tour({ candidats: [candidat("Musée maison")], actions: [LIRE] })],
      (appel) => appel !== "page",
    );
    expect(candidats).toHaveLength(1);
    expect(compteurs).toMatchObject({ tours: 2, pagesLues: 0, finsEcheance: 1 });
    expect(journal).not.toContain("page");
    expect(journal.at(-1)).toBe("non:page");
  });

  it("toujours le temps : comportement inchangé, aucune fin sur échéance", async () => {
    const { candidats, compteurs } = await rejouer([PLAN, tour({ actions: [RECHERCHER] }), tour({ candidats: [candidat("Musée maison")], termine: true })], () => true);
    expect(candidats).toHaveLength(1);
    expect(compteurs.finsEcheance).toBe(0);
  });

  it("observateur : reçoit au départ l'état vivant (compteurs et candidats tels qu'à la fin)", async () => {
    const { etat, candidats, compteurs } = await rejouer([PLAN, tour({ actions: [RECHERCHER] }), tour({ candidats: [candidat("Musée maison")], termine: true })], () => true);
    expect(etat?.compteurs).toBe(compteurs);
    expect(etat?.candidats).toBe(candidats);
  });

  it("sans vérification (mode simulé, scripts/p0) : aucune fin sur échéance", async () => {
    const reponses = [PLAN, tour({ actions: [RECHERCHER] }), tour({ candidats: [candidat("Musée maison")], termine: true })];
    const { compteurs, candidats } = await chercherCandidatsP0(brief, {
      modeles: { envoyer: async () => ({ texte: reponses.shift() ?? tour({ termine: true }), coutUsd: 0 }) },
      modele: "fournisseur/recherche-test",
      routage: { data_collection: "deny" },
      recherche: { rechercher: async () => ({ resultats: [{ url: URL_SOURCE, titre: "Musées", extrait: "Extrait." }], coutUsd: 0 }) },
      lecteur: { lire: async () => ({ ok: false, raison: "not_in_search_results" }) },
      config,
    });
    expect(candidats).toHaveLength(1);
    expect(compteurs.finsEcheance).toBe(0);
  });
});
