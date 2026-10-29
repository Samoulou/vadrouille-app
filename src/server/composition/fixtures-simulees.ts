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
 * Fixtures de la variante simulée (`prototype/fixtures/`, valeurs sentinelles, aucune réponse réelle enregistrée) :
 * Édimbourg, ou le jeu de la destination dans une liste fermée (décision 0136 § 9). **Hors du graphe de production** (décision 0105 § 2 ; revue de la PR 563, bloquant 1) :
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

/** Jeu de fixtures par défaut, et celui de toute destination hors de la liste fermée. */
const JEU_PAR_DEFAUT = "edimbourg";

/**
 * Jeu de fixtures d'une destination (décision 0136 § 9, qui amende 0110 § 2) : **liste fermée**, égalité exacte du nom
 * saisi, jamais un chemin tiré d'un texte reçu ; toute autre destination (ou aucune) prend celui d'Édimbourg.
 */
export const JEUX_PAR_DESTINATION: ReadonlyMap<string, string> = new Map([
  ["Édimbourg", "edimbourg"],
  ["Rome", "rome"],
]);

/**
 * Fichiers propres à un jeu, par famille ; les autres familles d'un jeu prennent le fichier d'Édimbourg (Rome : `modeles` et
 * `places` seulement ; le double Routes calculé, la recherche web et les pages ne servent pas à la chaîne inversée). Le fichier
 * Places de Rome s'appelle `rome-chaine-inversee.json`, et non `rome.json` : `pnpm p0` et ses tests (`borne-demande-du-jour`)
 * tiennent un jeu pour complet dès que `places/<slug>.json` existe, et rome-1 n'a ni pages, ni recherche, ni routes.
 */
const FICHIERS_PAR_JEU: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map([
  [
    "rome",
    new Map([
      ["modeles", "rome"],
      ["places", "rome-chaine-inversee"],
    ]),
  ],
]);

/** Jeu de fixtures de la destination (liste fermée), Édimbourg sinon. */
export function jeuDeFixtures(destination: string | undefined): string {
  return (destination === undefined ? undefined : JEUX_PAR_DESTINATION.get(destination)) ?? JEU_PAR_DEFAUT;
}

async function lire(famille: string, jeu: string): Promise<unknown> {
  const fichierDuJeu = jeu === JEU_PAR_DEFAUT ? jeu : (FICHIERS_PAR_JEU.get(jeu)?.get(famille) ?? JEU_PAR_DEFAUT);
  try {
    // Chemin calculé à l'exécution, relatif au répertoire de travail : ni le bundler ni le traceur n'ont de littéral à résoudre.
    const fichier = resolve("prototype", "fixtures", famille, `${fichierDuJeu}.json`);
    return JSON.parse(await readFile(fichier, "utf8"));
  } catch {
    throw new ErreurFixtures("fixtures_illisibles");
  }
}

/** Fabrique de doubles sur les fixtures d'Édimbourg lues une fois pour l'étape ; chaque appel rend des doubles neufs. */
export function chargerDoublesEdimbourg(env: Readonly<Record<string, string | undefined>>): Promise<() => DoublesFixtures> {
  return chargerDoubles(env, undefined);
}

/**
 * Fabrique de doubles sur les fixtures du jeu de la destination (`jeuDeFixtures`, liste fermée ; Édimbourg par défaut), lues
 * une fois pour l'étape ; chaque appel rend des doubles neufs.
 */
export async function chargerDoubles(env: Readonly<Record<string, string | undefined>>, destination: string | undefined): Promise<() => DoublesFixtures> {
  if (!lectureAdmise(env)) throw new ErreurFixtures("fixtures_refusees");
  const jeu = jeuDeFixtures(destination);
  const [modeles, pages, places, recherche, routes] = await Promise.all(["modeles", "pages", "places", "recherche", "routes"].map((famille) => lire(famille, jeu)));
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
