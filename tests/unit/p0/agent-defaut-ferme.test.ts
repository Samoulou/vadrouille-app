// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Brief } from "@/prototype/brief";
import { ConfigRechercheSchema } from "@/prototype/config";
import { chercherCandidats, ensemblesProteges } from "@/research/agent";
import { bornesDepuisConfig, complementDepuisBrief, entreeModelesDepuisBrief } from "@/server/p0/vers-couche-ia";

/**
 * Revue du head `5a955f8`, bloquant 1 : défaut **fermé** du filtre des requêtes web (PR 326). L'agent appelé avec
 * `complement` (récit et logements de P0) mais **sans** `protegees` refuse toute requête web qui reprend un logement
 * ou le récit : elle n'atteint jamais le moteur de recherche (Exa, hors `data_collection: "deny"`). Mode simulé
 * seulement, aucun appel réel.
 */

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const base = JSON.parse(readFileSync(path.join(RACINE, "prototype/briefs/edimbourg-1.json"), "utf8")) as Brief;
const config = ConfigRechercheSchema.parse(JSON.parse(readFileSync(path.join(RACINE, "prototype/config/recherche-essai.json"), "utf8")));

const LOGEMENT = "Maison Sentinelle Glenbervie";
const RECIT = "Nous voulons absolument revoir le vieux carrousel bleu de notre enfance près du port.";
const brief: Brief = { ...base, logements: [{ ...base.logements[0], texte: LOGEMENT } as Brief["logements"][number]], recit: RECIT };

const PLAN = JSON.stringify({ requetes: [{ requete: "musées Édimbourg", creneau: "activity" }] });
const tour = (requetes: string[], termine = false) =>
  JSON.stringify({ actions: requetes.map((requete) => ({ type: "rechercher", requete })), candidats: [], termine });

async function rejouer(requetesProposees: string[], avecProtegees = false) {
  const reponses = [PLAN, tour(requetesProposees), tour([], true)];
  const requetesWeb: string[] = [];
  const resultat = await chercherCandidats(entreeModelesDepuisBrief(brief), {
    modeles: { envoyer: async () => ({ texte: reponses.shift() ?? tour([], true), coutUsd: 0 }) },
    modele: "fournisseur/recherche-test",
    routage: { data_collection: "deny" },
    recherche: {
      rechercher: async (requete) => {
        requetesWeb.push(requete);
        return { resultats: [], coutUsd: 0 };
      },
    },
    lecteur: { lire: async () => ({ ok: false, raison: "not_in_search_results" }) },
    bornes: bornesDepuisConfig(config),
    complement: complementDepuisBrief(brief),
    ...(avecProtegees ? { protegees: { destination: brief.destination, pays: brief.pays } } : {}),
  });
  return { requetesWeb, ...resultat };
}

describe("recherche: défaut fermé du filtre des requêtes web (complement sans protegees)", () => {
  it("une requête qui reprend un logement ou le récit est refusée sans partir ; une requête neutre part", async () => {
    const fuites = [`hôtel ${LOGEMENT} Édimbourg`, "revoir le vieux carrousel bleu Édimbourg"];
    const { requetesWeb, compteurs } = await rejouer([...fuites, "musées Édimbourg"]);
    expect(requetesWeb).toEqual(["musées Édimbourg"]);
    expect(compteurs.sortiesRefusees.recherche).toBe(2);
    expect(JSON.stringify(requetesWeb)).not.toContain("Glenbervie");
    expect(JSON.stringify(requetesWeb)).not.toContain("carrousel");
  });

  it("même refus quand protegees est passé sans logement ni récit : le complément reste protégé", async () => {
    const { requetesWeb, compteurs } = await rejouer([`${LOGEMENT}`, "vieux carrousel bleu de notre enfance"], true);
    expect(requetesWeb).toEqual([]);
    expect(compteurs.sortiesRefusees.recherche).toBe(2);
  });

  it("ensemblesProteges : le complément est toujours un ensemble jugé ; sans complément, le lieu seul", () => {
    const entree = { destination: "Édimbourg", pays: "Royaume-Uni" };
    expect(ensemblesProteges(entree, undefined, undefined)).toEqual([entree]);
    expect(ensemblesProteges(entree, { logements: [LOGEMENT], recit: RECIT }, undefined)).toEqual([
      entree,
      { ...entree, logements: [{ texte: LOGEMENT }], recit: RECIT },
    ]);
  });
});
