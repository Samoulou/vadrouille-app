/**
 * Inventaire des routes de l'application (F12-PO-13, décision 0022 § 3) : liste unique, partagée par la mesure
 * (Lighthouse, JavaScript initial) et la passe d'accessibilité. Données pures : aucun import de valeur de
 * `@playwright/test` ni de l'application, pour que Vitest le lise (`tests/unit/routes-inventaire.test.ts`).
 *
 * Règle (tests/e2e/README.md) : toute PR qui ajoute une page sous `src/app` hors `/dev` l'inscrit ici, avec ses
 * états et ses budgets. Une page oubliée, ou une entrée sans fichier, fait échouer le test unitaire.
 */

/** Voyage du jeu simulé utilisé par toutes les adresses de l'inventaire. */
export const INVENTORY_TRIP = "mock_trip_edimbourg";

/** États nommés d'une route ; l'action de chacun est dans `route-states.ts` (`ROUTE_STATES`). */
export type RouteStateName = "fiche-ouverte" | "annulation-proposee";

/**
 * Préparations côté serveur : certaines adresses n'existent qu'après une action (un paiement commencé crée son
 * identifiant). L'action, dans `route-states.ts` (`ROUTE_PREPARATIONS`), crée l'état dans une portée de
 * simulation explicite (0017 § 10.3) et renvoie l'adresse réelle à mesurer.
 */
export type RoutePreparationName = "paiement-en-attente" | "confirmation-en-attente";

/**
 * Parcours côté client (F8a, spécification F8, « Inventaire des routes ») : certaines pages n'ont de contenu
 * qu'avec le brouillon de création, qui vit en mémoire de l'onglet ; ouvertes directement, elles remplacent leur
 * adresse par `R1`. L'action, dans `route-states.ts` (`ROUTE_JOURNEYS`), part de son adresse de départ, remplit
 * le brouillon et atteint l'adresse de l'entrée par navigation côté client, dans le même onglet.
 */
export type RouteJourneyName = "brouillon-ecran-1";

/** `seuil` : budget bloquant ; `journal` : mesuré et journalisé sans seuil. */
export type BudgetMode = "seuil" | "journal";

export interface RouteEntry {
  /** Identifiant du handover (`R11`, `R12`, `R6`…), ou `R-…` pour une route sans numéro d'écran. */
  readonly id: string;
  /** Adresse avec les paramètres du jeu simulé ; avec `prepare`, adresse documentaire (`[paiementId]`). */
  readonly path: string;
  /** Fichier `page.tsx` sous `src/app`, groupes de routes compris ; absent pour la page introuvable. */
  readonly page?: string;
  /** Statut HTTP attendu de l'adresse (200 par défaut). */
  readonly status?: 200 | 404;
  /** Préparation qui crée l'adresse réelle (voir `RoutePreparationName`). */
  readonly prepare?: RoutePreparationName;
  /**
   * Parcours qui remplit le brouillon (voir `RouteJourneyName`) : la mesure du JavaScript compte tout ce qui est
   * chargé depuis l'adresse de départ. Lighthouse, qui ouvre l'adresse dans un onglet neuf, ne mesure pas ces
   * entrées (question au Tech Lead, PR de F8a).
   */
  readonly journey?: RouteJourneyName;
  /** États à vérifier en plus de l'état initial (balayage d'accessibilité, F12d). */
  readonly states: readonly RouteStateName[];
  readonly budgets: {
    /** `seuil` : performance ≥ 90 (médiane) et accessibilité = 100 ; `journal` : accessibilité = 100, le reste journalisé. */
    readonly lighthouse: BudgetMode;
    /** `seuil` : JavaScript initial strictement sous 200 000 octets gzip ; `journal` : mesuré sans seuil. */
    readonly javascript: BudgetMode;
  };
  /**
   * Dépassement du budget de JavaScript constaté à l'inscription d'une route soumise au seuil, soumis au Tech
   * Lead (décision 0022 § 4 : le seuil ne se relève pas et l'entrée ne repasse pas en « journal » sans décision
   * écrite). Le budget reste `seuil` ; le test échoue si la mesure dépasse `javascriptBytes` (elle ne doit pas
   * augmenter) et aussi si elle passe sous le seuil (l'entrée doit alors perdre ce champ).
   */
  readonly knownExceedance?: { readonly javascriptBytes: number; readonly reason: string };
}

const TRIP = `/voyages/${INVENTORY_TRIP}`;

export const ROUTES: readonly RouteEntry[] = [
  {
    id: "R-accueil",
    path: "/",
    page: "page.tsx",
    states: [],
    budgets: { lighthouse: "journal", javascript: "journal" },
  },
  {
    // F11a : JavaScript initial journalisé sans seuil (décision 0021 § 4).
    id: "R17",
    path: "/voyages",
    page: "voyages/page.tsx",
    states: [],
    budgets: { lighthouse: "journal", javascript: "journal" },
  },
  {
    id: "R11",
    path: TRIP,
    page: "voyages/[id]/(programme)/page.tsx",
    states: [],
    budgets: { lighthouse: "seuil", javascript: "seuil" },
  },
  {
    id: "R12",
    path: `${TRIP}/jour/2`,
    page: "voyages/[id]/(programme)/jour/[n]/page.tsx",
    states: ["fiche-ouverte"],
    budgets: { lighthouse: "seuil", javascript: "seuil" },
  },
  {
    // F10a : écran 15 « Aujourd'hui » ; hors des dates du voyage simulé, l'état mesuré est « avant le voyage ».
    id: "R15",
    path: `${TRIP}/aujourdhui`,
    page: "voyages/[id]/aujourdhui/page.tsx",
    states: [],
    budgets: { lighthouse: "journal", javascript: "seuil" },
  },
  {
    id: "R6",
    path: `${TRIP}/presentation`,
    page: "voyages/[id]/presentation/page.tsx",
    states: ["annulation-proposee"],
    budgets: { lighthouse: "journal", javascript: "seuil" },
  },
  {
    id: "R9",
    path: `${TRIP}/debloquer`,
    page: "voyages/[id]/debloquer/page.tsx",
    states: [],
    budgets: { lighthouse: "journal", javascript: "journal" },
  },
  {
    id: "R9-sim",
    path: `${TRIP}/debloquer/paiement-simule/[paiementId]`,
    page: "voyages/[id]/debloquer/paiement-simule/[paiementId]/page.tsx",
    prepare: "paiement-en-attente",
    states: [],
    budgets: { lighthouse: "journal", javascript: "journal" },
  },
  {
    id: "R9-retour",
    path: `${TRIP}/debloquer/confirmation?paiement=[paiementId]`,
    page: "voyages/[id]/debloquer/confirmation/page.tsx",
    prepare: "confirmation-en-attente",
    states: [],
    budgets: { lighthouse: "journal", javascript: "journal" },
  },
  {
    // F8a : écran 1 de la création ; budgets en `journal` en attendant le Tech Lead (F8-Q15).
    id: "R1",
    path: "/voyages/nouveau",
    page: "(creation)/voyages/nouveau/page.tsx",
    states: [],
    budgets: { lighthouse: "journal", javascript: "journal" },
  },
  {
    // F8a : écran 2, atteint par l'écran 1 rempli (le brouillon vit dans l'onglet) ; `journal` (F8-Q15).
    id: "R2",
    path: "/voyages/nouveau/brief",
    page: "(creation)/voyages/nouveau/brief/page.tsx",
    journey: "brouillon-ecran-1",
    states: [],
    budgets: { lighthouse: "journal", javascript: "journal" },
  },
  {
    // F10b : page de repli hors ligne, statique, sans donnée ; mesure journalisée (F10-TL-10).
    id: "R-repli",
    path: "/hors-ligne",
    page: "hors-ligne/page.tsx",
    states: [],
    budgets: { lighthouse: "journal", javascript: "journal" },
  },
  {
    id: "R-introuvable",
    path: "/voyages/inconnu",
    status: 404,
    states: [],
    budgets: { lighthouse: "journal", javascript: "journal" },
  },
];

/**
 * Pages de développement (`/dev`, carte simulée) : servent aux critères de recentrage et au balayage avec carte
 * (F12b, F12d). Jamais mesurées par Lighthouse ni comparées aux fichiers de `src/app`.
 */
export const DEV_ROUTES: readonly Pick<RouteEntry, "id" | "path" | "states">[] = [
  { id: "R11-dev", path: `/dev${TRIP}`, states: [] },
  { id: "R12-dev", path: `/dev${TRIP}/jour/2`, states: ["fiche-ouverte"] },
  { id: "R-erreur-dev", path: "/dev/etats/erreur", states: [] },
];
