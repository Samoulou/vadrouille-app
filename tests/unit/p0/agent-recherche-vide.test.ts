// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { ReponseModele } from "@/ai/client";
import { PROMPT_RECHERCHE } from "@/ai/prompts/recherche";
import { BLOCS_ESSAYES_MAX, LONGUEUR_REPONSE_MAX, lirePlan, lireTour } from "@/ai/sorties";
import type { Brief } from "@/prototype/brief";
import { ConfigRechercheSchema } from "@/prototype/config";

import { chercherCandidatsP0 } from "./agent-p0";

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
  const prompts: { etape: string; id: string; version: number }[] = [];
  const resultat = await chercherCandidatsP0(brief, {
    modeles: {
      envoyer: async (requete) => {
        appels += 1;
        prompts.push({ etape: requete.etape, ...requete.prompt });
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
  return { appels, requetesWeb, prompts, ...resultat };
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

describe("ia: habillage des sorties, cas limites (mineurs 8 et bloquant 1 du head cd614d4)", () => {
  const plan = (requete: string) => JSON.stringify({ requetes: [{ requete, creneau: "activity" }] });

  it("plusieurs blocs de code : le dernier bloc lisible gagne", () => {
    const texte = `Brouillon :\n\`\`\`json\n${plan("premier")}\n\`\`\`\nVersion finale :\n\`\`\`json\n${plan("dernier")}\n\`\`\`\n`;
    expect(lirePlan(texte).valeur.map((r) => r.requete)).toEqual(["dernier"]);
    // Dernier bloc illisible : l'avant-dernier est essayé.
    expect(lirePlan(`${texte}\`\`\`\npas du json\n\`\`\``).valeur.map((r) => r.requete)).toEqual(["dernier"]);
    // Seuls les BLOCS_ESSAYES_MAX derniers blocs sont essayés (accolades dans les blocs vides : l'empan du premier
    // « { » au dernier « } » n'est pas non plus un objet JSON).
    const vides = Array.from({ length: BLOCS_ESSAYES_MAX }, () => "```\n{rien}\n```").join("\n");
    expect(lirePlan(`\`\`\`json\n${plan("trop tôt")}\n\`\`\`\n${vides}`).illisible).toBe(true);
  });

  it("accolades dans la prose : lu si l'objet est dans un bloc ; prose nue autour d'accolades : illisible (limite)", () => {
    expect(lirePlan(`Je cherche {des musées} puis :\n\`\`\`json\n${plan("musées")}\n\`\`\`\nEt {voilà}.`).valeur).toHaveLength(1);
    // Sans bloc, l'empan du premier « { » au dernier « } » englobe la prose : refusé en entier.
    expect(lirePlan(`Je cherche {des musées} : ${plan("musées")} et {voilà}.`)).toEqual({ valeur: [], refuses: 1, illisible: true });
    expect(lirePlan(`Plan {${plan("musées")}}`).illisible).toBe(true);
  });

  it("bloc ouvert jamais fermé suivi de 100 k espaces : lu en temps linéaire, illisible", () => {
    const pathologique = "```json\n" + " ".repeat(100_000);
    const debut = performance.now();
    for (let fois = 0; fois < 5; fois += 1) {
      expect(lireTour(pathologique).illisible).toBe(true);
      expect(lirePlan(`\`\`\`${pathologique}`).illisible).toBe(true);
    }
    // Borne généreuse : l'ancienne expression régulière prenait environ 1,2 s par lecture à cette taille.
    expect(performance.now() - debut).toBeLessThan(1000);
  });

  it("réponse plus longue que LONGUEUR_REPONSE_MAX : refusée en entier sans examen", () => {
    const long = JSON.stringify({ requetes: [], marge: " ".repeat(LONGUEUR_REPONSE_MAX) });
    expect(lirePlan(long)).toEqual({ valeur: [], refuses: 1, illisible: true });
    const justeSousLePlafond = PLAN + " ".repeat(LONGUEUR_REPONSE_MAX - PLAN.length);
    expect(lirePlan(justeSousLePlafond).valeur).toHaveLength(1);
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

  it("mineur 11 du head cd614d4 : les tours partent avec le prompt recherche v2 (forme JSON nue, termine après recherche)", async () => {
    const { prompts } = await rejouer([PLAN, tour({ actions: [RECHERCHER] }), tour({ termine: true })]);
    expect(PROMPT_RECHERCHE).toMatchObject({ id: "recherche", version: 2 });
    expect(prompts.filter((p) => p.etape === "recherche")).toEqual([
      { etape: "recherche", id: "recherche", version: 2 },
      { etape: "recherche", id: "recherche", version: 2 },
    ]);
    expect(PROMPT_RECHERCHE.texte).toContain("sans bloc de code ni texte autour");
    expect(PROMPT_RECHERCHE.texte).toContain("Au premier tour, aucun résultat n'existe encore");
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

  it("N sorties illisibles consécutives, plus que toursMax : la boucle s'arrête à toursMax, les réponses en trop ne sont pas demandées", async () => {
    const reponses = [PLAN, ...Array.from({ length: config.toursMax + 5 }, () => "```json\n{ tronqué")];
    const { appels, requetesWeb, candidats, compteurs } = await rejouer(reponses);
    // Un appel de plan, puis un appel par tour : le nombre d'appels payants est borné par toursMax quel que soit le modèle.
    expect(appels).toBe(1 + config.toursMax);
    expect(reponses).toHaveLength(5);
    expect(requetesWeb).toEqual([]);
    expect(candidats).toEqual([]);
    expect(compteurs.sortiesIllisibles.recherche).toBe(config.toursMax);
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
