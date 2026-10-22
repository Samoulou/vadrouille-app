import "server-only";

import { BLOC_MATRICE, cleTrajet, matriceTrajets, minutesDeTrajets } from "@/grounding/ancrage";
import type { ClientRoutes, ModeRoutes, RequeteMatrice } from "@/grounding/interfaces";
import type { Trajets } from "@/prototype/ancrage";

/**
 * Budgets Routes de l'étape finale de `p0Run` (décision 0055, section 6 point 1 ; 0053 et son amendement 1, point 4 ;
 * Q330, réponse de Samuel : quota compté en éléments, sans plafond par jour, 3 000 éléments par minute). Module pur,
 * en mémoire ; il ne parle à Routes qu'à travers le `ClientRoutes` reçu (client réel branché sur le port de
 * consommation, qui applique en plus le forfait de l'exécution).
 *
 * - **Part d'un jour** : `floor(éléments par voyage / jours du brief)`, calculée ici à partir du brief, sans emprunt
 *   entre jours (0053).
 * - **Matrice du jour** : `n` le plus grand entier tel que `n² + 2n ≤ part` ; les `2n` éléments restants sont réservés à
 *   **une reprise au plus** par jour (ligne et colonne du seul lieu de remplacement contre les `n − 1` autres).
 * - **Requêtes** : blocs de `BLOC_MATRICE` ; avant chaque requête, le code vérifie la part du jour, le plafond
 *   d'éléments et le plafond de requêtes de l'exécution : sinon `cap_reached`, sans appel.
 * - **Cadence** : jamais plus de `maxParMinute` éléments sur une fenêtre glissante d'une minute (Q330 ; traduction du
 *   Tech Lead dans la revue de #318) ; une requête qui ne tient pas attend la sortie des plus anciennes.
 * Le premier tri à vol d'oiseau (`zone.ts`, `ordreVolOiseau`) précède Routes, qui ne sert qu'à l'ordre final.
 */

export const CODE_BUDGET_ROUTES = "cap_reached";

/** Budget Routes atteint : l'exécution s'arrête sans programme (`cap_reached`), jamais une durée inventée. */
export class ErreurBudgetRoutes extends Error {
  readonly code = CODE_BUDGET_ROUTES;
  constructor() {
    super(CODE_BUDGET_ROUTES);
    this.name = "ErreurBudgetRoutes";
  }
}

/** Plafonds Routes de l'exécution (configuration du mode réel : 840 éléments, Samuel, 0053 amendée par 0088 § 13 ; 20 requêtes, P0S2-PO-8). */
export type PlafondsRoutes = { readonly elements: number; readonly requetes: number };

const entierPositif = (valeur: number) => Number.isSafeInteger(valeur) && valeur > 0;

/** Part d'un jour : `floor(éléments / jours)`, sans emprunt. */
export function partDuJour(elements: number, jours: number): number {
  if (!entierPositif(elements) || !entierPositif(jours)) throw new RangeError("routes: éléments ou jours invalides");
  return Math.floor(elements / jours);
}

/** Plus grand `n` tel que `n² + 2n ≤ part` (0 si la part ne tient pas un lieu). */
export function tailleMatriceDuJour(part: number): number {
  if (!Number.isSafeInteger(part) || part < 0) throw new RangeError("routes: part invalide");
  // n² + 2n ≤ part ⇔ (n + 1)² ≤ part + 1.
  let n = Math.max(0, Math.floor(Math.sqrt(part + 1)) - 1);
  while ((n + 1) * (n + 1) + 2 * (n + 1) <= part) n += 1;
  while (n > 0 && n * n + 2 * n > part) n -= 1;
  return n;
}

const blocs = (k: number) => Math.ceil(k / BLOC_MATRICE);

/** Requêtes d'une matrice `n × n` découpée en blocs de `BLOC_MATRICE`. */
export const requetesMatrice = (n: number) => blocs(n) ** 2;

/** Requêtes d'une reprise : une ligne et une colonne de `n − 1` éléments, découpées en blocs. */
export const requetesReprise = (n: number) => (n < 2 ? 0 : 2 * blocs(n - 1));

export type PlanRoutes = {
  readonly jours: number;
  readonly plafonds: PlafondsRoutes;
  /** Part d'un jour, et `n` de sa matrice (le même chaque jour). */
  readonly part: number;
  readonly n: number;
  readonly elementsSansReprise: number;
  readonly requetesSansReprise: number;
  /** Reprises que le plafond de requêtes admet (une par jour au plus). */
  readonly reprisesAdmises: number;
  /** Vrai si les matrices de tous les jours tiennent sous les deux plafonds, et si `n ≥ 2`. */
  readonly tient: boolean;
};

/** Plan Routes d'un séjour de `jours` jours sous les plafonds de l'exécution. */
export function planRoutes(jours: number, plafonds: PlafondsRoutes): PlanRoutes {
  if (!entierPositif(plafonds.requetes)) throw new RangeError("routes: plafond de requêtes invalide");
  const part = partDuJour(plafonds.elements, jours);
  const n = tailleMatriceDuJour(part);
  const elementsSansReprise = jours * n * n;
  const requetesSansReprise = jours * requetesMatrice(n);
  const tient = n >= 2 && elementsSansReprise <= plafonds.elements && requetesSansReprise <= plafonds.requetes;
  const parReprise = requetesReprise(n);
  const reprisesAdmises = !tient || parReprise === 0 ? 0 : Math.min(jours, Math.floor((plafonds.requetes - requetesSansReprise) / parReprise));
  return { jours, plafonds, part, n, elementsSansReprise, requetesSansReprise, reprisesAdmises, tient };
}

/** Horloge de la cadence : instant courant et attente (injectées ; minuterie réelle par la composition). */
export type HorlogeCadence = { maintenant(): number; attendre(ms: number): Promise<void> };

export type Cadence = { reserver(elements: number): Promise<void> };

const MINUTE_MS = 60_000;

/**
 * Cadence par minute (Q330) : fenêtre glissante d'une minute, `maxParMinute` éléments au plus. Une demande seule
 * au-delà du maximum est refusée (`cap_reached`). Appels séquentiels (l'étape finale attend chaque requête).
 */
export function creerCadence(maxParMinute: number, horloge: HorlogeCadence): Cadence {
  if (!entierPositif(maxParMinute)) throw new RangeError("routes: cadence invalide");
  const fenetre: { instant: number; elements: number }[] = [];
  return {
    async reserver(elements) {
      if (!Number.isSafeInteger(elements) || elements < 0 || elements > maxParMinute) throw new ErreurBudgetRoutes();
      for (;;) {
        const maintenant = horloge.maintenant();
        while ((fenetre.at(0)?.instant ?? Number.POSITIVE_INFINITY) <= maintenant - MINUTE_MS) fenetre.shift();
        const total = fenetre.reduce((somme, ligne) => somme + ligne.elements, 0);
        const premiere = fenetre.at(0);
        if (total + elements <= maxParMinute || premiere === undefined) {
          fenetre.push({ instant: maintenant, elements });
          return;
        }
        await horloge.attendre(premiere.instant + MINUTE_MS - maintenant);
      }
    },
  };
}

export type RoutesDuSejour = {
  /** Matrice du jour `jour` (0 à `jours − 1`), une fois par jour, `n` lieux distincts au plus. */
  matriceDuJour(jour: number, placeIds: readonly string[], mode: ModeRoutes): Promise<Trajets>;
  /** Reprise du jour, une au plus, après sa matrice : `nouveau` contre `autres` (`n − 1` au plus). */
  reprise(jour: number, nouveau: string, autres: readonly string[], mode: ModeRoutes, trajets: Trajets): Promise<Trajets>;
  /** Éléments et requêtes demandés depuis la création (requêtes parties, abouties ou non). */
  consommation(): { readonly elements: number; readonly requetes: number };
};

/**
 * Routes de l'étape finale sous le plan : part du jour, plafonds de l'exécution et cadence vérifiés **avant** chaque
 * requête (`ErreurBudgetRoutes` sans appel sinon). Une requête partie est comptée, qu'elle aboutisse ou non.
 */
export function routesDuSejour(routes: ClientRoutes, plan: PlanRoutes, cadence: Cadence): RoutesDuSejour {
  const total = { elements: 0, requetes: 0 };
  const jours = Array.from({ length: plan.jours }, () => ({ elements: 0, matrice: false, reprise: false }));

  const etatDu = (jour: number) => {
    const etat = Number.isSafeInteger(jour) ? jours.at(jour) : undefined;
    if (etat === undefined || jour < 0) throw new RangeError("routes: jour hors du séjour");
    return etat;
  };

  const compte = (etat: { elements: number }): ClientRoutes => ({
    async matrice(requete: RequeteMatrice) {
      const elements = requete.origines.length * requete.destinations.length;
      if (etat.elements + elements > plan.part || total.elements + elements > plan.plafonds.elements || total.requetes + 1 > plan.plafonds.requetes) {
        throw new ErreurBudgetRoutes();
      }
      await cadence.reserver(elements);
      etat.elements += elements;
      total.elements += elements;
      total.requetes += 1;
      return routes.matrice(requete);
    },
  });

  return {
    async matriceDuJour(jour, placeIds, mode) {
      const etat = etatDu(jour);
      if (etat.matrice) throw new RangeError("routes: matrice du jour déjà demandée");
      etat.matrice = true;
      const ids = [...new Set(placeIds)];
      if (!plan.tient || ids.length > plan.n) throw new ErreurBudgetRoutes();
      if (ids.length < 2) return (depuis, vers) => (depuis === vers ? 0 : undefined);
      return matriceTrajets(ids, mode, compte(etat));
    },
    async reprise(jour, nouveau, autres, mode, trajets) {
      const etat = etatDu(jour);
      if (!etat.matrice) throw new RangeError("routes: reprise avant la matrice du jour");
      const distincts = [...new Set(autres)].filter((id) => id !== nouveau);
      if (etat.reprise || distincts.length === 0 || distincts.length > plan.n - 1) throw new ErreurBudgetRoutes();
      // Avant la reprise : toutes ses requêtes et tous ses éléments doivent tenir (jamais une reprise à moitié faite).
      const elements = 2 * distincts.length;
      if (
        total.requetes + requetesReprise(distincts.length + 1) > plan.plafonds.requetes ||
        total.elements + elements > plan.plafonds.elements ||
        etat.elements + elements > plan.part
      ) {
        throw new ErreurBudgetRoutes();
      }
      etat.reprise = true;
      const client = compte(etat);
      const aller = await minutesDeTrajets([nouveau], distincts, mode, client);
      const retour = await minutesDeTrajets(distincts, [nouveau], mode, client);
      return (depuis, vers) => {
        if (depuis === vers) return 0;
        if (depuis !== nouveau && vers !== nouveau) return trajets(depuis, vers);
        return (depuis === nouveau ? aller : retour).get(cleTrajet(depuis, vers));
      };
    },
    consommation: () => ({ elements: total.elements, requetes: total.requetes }),
  };
}

/** Plus grand nombre d'éléments d'une requête de trajets consécutifs (blocs d'origines et de destinations voisines). */
export const ELEMENTS_BLOC_CONSECUTIFS = 16;

/**
 * Requêtes de trajets consécutifs d'un programme (décision 0116 § 3.3) : paires distinctes de points consécutifs
 * définis de chaque chaîne, groupées dans l'ordre en blocs de `ELEMENTS_BLOC_CONSECUTIFS` éléments au plus. Seule
 * règle de groupement, partagée par `trajetsConsecutifs` et par la réserve de trajets de l'échéance (0116 § 3.5).
 */
export function blocsDeTrajets(chaines: readonly (readonly (string | undefined)[])[]): { readonly origines: string[]; readonly destinations: string[] }[] {
  const paires: [string, string][] = [];
  const vues = new Set<string>();
  for (const chaine of chaines) {
    for (let rang = 1; rang < chaine.length; rang += 1) {
      const depuis = chaine.at(rang - 1);
      const vers = chaine.at(rang);
      if (depuis === undefined || vers === undefined || depuis === vers || vues.has(cleTrajet(depuis, vers))) continue;
      vues.add(cleTrajet(depuis, vers));
      paires.push([depuis, vers]);
    }
  }
  const blocs: { origines: string[]; destinations: string[] }[] = [];
  for (const [depuis, vers] of paires) {
    const courant = blocs.at(-1);
    const origines = courant === undefined ? [] : [...new Set([...courant.origines, depuis])];
    const destinations = courant === undefined ? [] : [...new Set([...courant.destinations, vers])];
    if (courant !== undefined && origines.length * destinations.length <= ELEMENTS_BLOC_CONSECUTIFS) {
      courant.origines = origines;
      courant.destinations = destinations;
    } else blocs.push({ origines: [depuis], destinations: [vers] });
  }
  return blocs;
}

/**
 * Temps de trajet entre **points consécutifs vérifiés** du programme écrit par l'IA (décision 0115 § 3 étape 3 ;
 * décision 0116 § 3.3 et § 3.5 ; 0092 inchangée). `chaines` : pour chaque jour, les points dans l'ordre de la journée
 * (logement de départ, étapes, logement d'arrivée), `undefined` pour une étape non vérifiée : une paire n'est demandée
 * que si ses deux points sont des identifiants (jamais vers ni depuis un lieu « à confirmer », critère A8).
 *
 * Paires distinctes groupées dans l'ordre en requêtes de `ELEMENTS_BLOC_CONSECUTIFS` éléments au plus (origines ×
 * destinations), sous les plafonds de l'exécution (`plafonds`) et la cadence par minute ; plafond atteint, ou appel
 * refusé faute de temps (`cap_reached`) : les paires restantes restent **sans durée** (`undefined`, puis `null` à
 * l'affichage, 0092 § 4), jamais inventées et sans arrêt. Toute autre erreur est propagée. Durées en mémoire seulement.
 */
export async function trajetsConsecutifs(
  routes: ClientRoutes,
  chaines: readonly (readonly (string | undefined)[])[],
  mode: ModeRoutes,
  plafonds: PlafondsRoutes,
  cadence: Cadence,
): Promise<Trajets> {
  const blocs = blocsDeTrajets(chaines);
  const minutes = new Map<string, number>();
  const total = { elements: 0, requetes: 0 };
  for (const bloc of blocs) {
    const elements = bloc.origines.length * bloc.destinations.length;
    if (total.requetes + 1 > plafonds.requetes || total.elements + elements > plafonds.elements) break;
    try {
      await cadence.reserver(elements);
      total.requetes += 1;
      total.elements += elements;
      for (const [cle, valeur] of await minutesDeTrajets(bloc.origines, bloc.destinations, mode, routes)) minutes.set(cle, valeur);
    } catch (erreur) {
      if ((erreur as { code?: unknown } | null)?.code !== "cap_reached") throw erreur;
      break;
    }
  }
  return (depuis, vers) => (depuis === vers ? 0 : minutes.get(cleTrajet(depuis, vers)));
}
