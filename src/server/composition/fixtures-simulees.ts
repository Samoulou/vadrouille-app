import "server-only";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { ClientModeles } from "@/ai/client";
import type { ClientRechercheWeb } from "@/ai/recherche-web";
import type { ClientPlacesMvp, ClientRoutes } from "@/grounding/interfaces";
import type { LecteurPages } from "@/research/fetch-page";
import { creerModelesSimules, FixturesModelesSchema } from "@/ai/modeles.simule";
import { creerPlacesSimule, FixturesPlacesSchema } from "@/grounding/places.simule";
import { creerRoutesSimule, FixturesRoutesSchema } from "@/grounding/routes.simule";
import { creerLecteurPages } from "@/research/fetch-page";
import { creerHttpSimule, creerResolveurSimule, FixturesPagesSchema } from "@/research/pages.simule";
import { creerRechercheSimulee, FixturesRechercheSchema } from "@/research/recherche-web.simule";
import { deploiementTraiteCommeProduction } from "@/server/config/generation";


/** Doubles des fournisseurs ; structurellement `DoublesGeneration` de la composition (qui ne peut pas être importée d'ici). */
export type DoublesFixtures = {
  readonly modeles: ClientModeles;
  readonly rechercheWeb: ClientRechercheWeb;
  readonly lecteur: LecteurPages;
  readonly places: ClientPlacesMvp;
  readonly routes: ClientRoutes;
};

/** Erreur fermée : ni chemin ni message de fichier ne sortent. */
export class ErreurFixtures extends Error {
  constructor(readonly code: "fixtures_refusees" | "fixtures_illisibles") {
    super(code);
    this.name = "ErreurFixtures";
  }
}

/**
 * Fixtures d'Édimbourg de la variante simulée (`prototype/fixtures/`, valeurs sentinelles, aucune réponse réelle
 * enregistrée). **Hors du graphe de production** (décision 0105 § 2 ; revue de la PR 563, bloquant 1) :
 * - lues **à l'exécution** (`node:fs`, chemin construit à l'appel) : aucun import de `prototype/`, donc rien à résoudre à la
 *   construction de l'image (`prototype/` est exclu du contexte, `.dockerignore`, 0032 § A4.4) ;
 * - module atteint par `import()` dynamique d'un fichier de `src/`, depuis `composerSimulee` seulement, donc après la barrière ;
 *   `composer("production")` lève `production_refused` avant tout chargement ;
 * - défense en profondeur : le module refuse de lire quand le déploiement déclaré est `production` ou inconnu (règle de la
 *   barrière : la plus restrictive des deux déclarations) ; les déclarations lui sont passées par l'appelant (aucune lecture d'environnement ici) ;
 * - aucune fixture en cache de module : chaque appel relit les fichiers.
 */
/** Faux si l'une des déclarations de déploiement vaut `production` ou est inconnue, ou si aucune n'est posée (prédicat de la barrière). */
export function lectureAdmise(env: Readonly<Record<string, string | undefined>>): boolean {
  return !deploiementTraiteCommeProduction(env);
}

async function lire(famille: string): Promise<unknown> {
  try {
    // Chemin calculé à l'exécution, relatif au répertoire de travail : ni le bundler ni le traceur n'ont de littéral à résoudre.
    const fichier = resolve("prototype", "fixtures", famille, "edimbourg.json");
    return JSON.parse(await readFile(fichier, "utf8"));
  } catch {
    throw new ErreurFixtures("fixtures_illisibles");
  }
}

/** Fabrique de doubles sur les fixtures lues une fois pour l'étape ; chaque appel rend des doubles neufs. */
export async function chargerDoublesEdimbourg(env: Readonly<Record<string, string | undefined>>): Promise<() => DoublesFixtures> {
  if (!lectureAdmise(env)) throw new ErreurFixtures("fixtures_refusees");
  const [modeles, pages, places, recherche, routes] = await Promise.all(["modeles", "pages", "places", "recherche", "routes"].map(lire));
  // Validation dans le `try` : une fixture invalide rend la même erreur fermée (jamais une `ZodError` ni un chemin).
  let fixtures;
  try {
    fixtures = {
      modeles: FixturesModelesSchema.parse(modeles),
      pages: FixturesPagesSchema.parse(pages),
      places: FixturesPlacesSchema.parse(places),
      recherche: FixturesRechercheSchema.parse(recherche),
      routes: FixturesRoutesSchema.parse(routes),
    };
  } catch {
    throw new ErreurFixtures("fixtures_illisibles");
  }
  return () => ({
    modeles: creerModelesSimules(fixtures.modeles),
    rechercheWeb: creerRechercheSimulee(fixtures.recherche),
    lecteur: creerLecteurPages({ resoudre: creerResolveurSimule(fixtures.pages.dns), http: creerHttpSimule(fixtures.pages.pages) }),
    places: creerPlacesSimule(fixtures.places),
    routes: creerRoutesSimule(fixtures.routes),
  });
}
