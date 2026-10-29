import { MAX_PREVIEW_SLOTS, type Category, type ChecklistItem, type Day, type DayLineItem, type Segment, type Stop } from "@/contracts";

import { element } from "@/domain/tables";

/**
 * Règles de l'aperçu, écrites une seule fois (décision 0136 § 1.7) : fonctions pures, sans lecture ni réseau, partagées
 * par le site d'essai (adaptateurs `prototype-parcours.ts` et `prototype-lecture.ts`, par la réexportation
 * `src/server/programme/apercu.ts`) et la vraie app (`src/server`, directement). Déplacées de ces deux adaptateurs par
 * M1a-1, sans changement de comportement. N'importe que `@/contracts` et `@/domain/tables` (règle « src/domain sans
 * entrée-sortie »).
 *
 * - « Tes premières propositions » : les étapes du programme, dans son ordre, la première journée puis le début de la
 *   deuxième, `MAX_PREVIEW_SLOTS` (8) au plus (cadrage D11) ; engagements exclus ;
 * - seules les journées de l'aperçu sont lisibles avant le déblocage ;
 * - une étape sans `placeId` reçoit le badge « à confirmer » à la lecture (0116 § 5.1), rien n'est écrit.
 */

/** Journées lues pour l'aperçu : la première, puis le début de la deuxième (D4). */
export const JOURS_APERCU = 2;

/**
 * Catégorie **de repli** d'une proposition tirée d'une étape (décision 0124 § 5) : le programme écrit n'en garde aucune
 * (texte maison, jamais Google). Conséquences assumées : toutes les activités d'un voyage d'essai comptent comme
 * « heritage » et tous les repas comme « restaurant » dans la mesure du tri (console) — la répartition par catégorie
 * n'y veut rien dire ; aucune question de catégorie n'est posée (`questions: false`). Le lot 4 ne doit jamais relire ces
 * catégories comme des préférences : il les remplace par la catégorie écrite avec le programme.
 */
export const CATEGORIE_REPAS: Category = "restaurant";
export const CATEGORIE_ACTIVITE: Category = "heritage";

/** Étape d'une journée lue pour l'aperçu (forme minimale, partagée par les journées réduites et recomposées). */
export type EtapeLue = { readonly id: string; readonly commitment?: unknown };

/** Journée lue pour l'aperçu : indice et lignes ; seule l'étape (`stop`) d'une ligne est lue. */
export interface JourLu<E extends EtapeLue = EtapeLue> {
  readonly index: number;
  readonly items: readonly { readonly type: string; readonly stop?: E }[];
}

export interface SelectionApercu {
  /** Identifiants des étapes de l'aperçu, dans l'ordre du programme ; `MAX_PREVIEW_SLOTS` au plus. */
  readonly etapes: readonly string[];
  /** Journées lisibles avant le déblocage : celles de l'aperçu (la première au moins). */
  readonly jours: ReadonlySet<number>;
}

/** Étape proposable : une étape de la ligne du jour qui n'est pas un engagement saisi (`refineNoCommitment`). */
function proposable<E extends EtapeLue>(ligne: JourLu<E>["items"][number]): E | undefined {
  return ligne.type === "stop" && ligne.stop !== undefined && ligne.stop.commitment === undefined ? ligne.stop : undefined;
}

/** Prédicat par défaut de `selectionApercu` : toutes les étapes proposables sont retenues. */
const TOUTES = (): boolean => true;

/**
 * Aperçu d'un programme : étapes et journées, dans l'ordre des jours (indice croissant). `retenir` (par défaut : toutes)
 * écarte une étape proposable, qui laisse sa place à la suivante comme un engagement ; le site d'essai n'en passe pas.
 */
export function selectionApercu<E extends EtapeLue = EtapeLue>(jours: readonly JourLu<E>[], retenir: (etape: E) => boolean = TOUTES): SelectionApercu {
  const ordonnes = [...jours].sort((a, b) => a.index - b.index).slice(0, JOURS_APERCU);
  const etapes: string[] = [];
  const lisibles = new Set<number>();
  for (const jour of ordonnes) {
    for (const ligne of jour.items) {
      if (etapes.length >= MAX_PREVIEW_SLOTS) break;
      const etape = proposable(ligne);
      if (etape === undefined || !retenir(etape)) continue;
      etapes.push(etape.id);
      lisibles.add(jour.index);
    }
  }
  const premier = ordonnes[0];
  if (premier !== undefined) lisibles.add(premier.index);
  return { etapes, jours: lisibles };
}

/** Étape retenue pour une case de la chaîne inversée : un `placeId` et une `reason` non vide (décision 0136 § 3.4). */
export const etapeAncreeEtRedigee = (stop: { readonly placeId?: string; readonly reason?: string }): boolean =>
  stop.placeId !== undefined && stop.reason !== undefined && stop.reason.trim() !== "";

/** Étape lue par `retenirApercu` : identifiant, lieu, raison et heure de début (étape du voyage ou de l'instantané). */
export type EtapeRetenue = EtapeLue & { readonly placeId?: string; readonly reason?: string; readonly start: string };

/**
 * Fabrique du prédicat `retenir` de `selectionApercu` pour la chaîne inversée (décision 0136 § 3.4 et § 3.5), **la même** à
 * l'écriture des cases (`src/server/generation/cases-programme.ts`, M1a-2) et à la lecture avant le déblocage
 * (`src/server/voyages/lecture.ts`, M1a-3) : une étape ancrée et rédigée (`etapeAncreeEtRedigee`) dont le créneau (jour, heure
 * de début) n'est pas déjà pris par une étape retenue (le contrat `PreviewSlotsSchema` interdit deux cases au même créneau).
 * Le prédicat **garde un état** (les créneaux pris) : une fabrique neuve par sélection, appelée sur les étapes dans l'ordre
 * de `selectionApercu`. Déplacée de `cases-programme.ts` par M1a-3 (la lecture de `src/server/voyages` n'atteint pas
 * `src/server/generation`, règle `ligne/creation-imports`), sans changement de comportement.
 */
export function retenirApercu<E extends EtapeRetenue>(jours: readonly JourLu<E>[]): (stop: E) => boolean {
  const jourDeLEtape = new Map<string, number>();
  for (const jour of jours) for (const ligne of jour.items) if (ligne.type === "stop" && ligne.stop !== undefined) jourDeLEtape.set(ligne.stop.id, jour.index);
  const pris = new Set<string>();
  return (stop) => {
    if (!etapeAncreeEtRedigee(stop)) return false;
    const creneau = `${jourDeLEtape.get(stop.id) ?? 0}|${stop.start}`;
    if (pris.has(creneau)) return false;
    pris.add(creneau);
    return true;
  };
}

/** Partie commune d'une case tirée d'une étape : ce que les deux chemins lisent des mêmes données (0136 § 1.7). */
export interface EtapeEnCase {
  readonly id: string;
  readonly kind: "meal" | "activity";
  readonly day: number;
  readonly time: string;
  readonly stop: Stop;
  /** Catégorie de repli (`CATEGORIE_REPAS` ou `CATEGORIE_ACTIVITE`, 0124 § 5). */
  readonly category: Category;
  /** Trajet qui précède l'étape dans la ligne du jour, s'il y en a un (durée connue ou non). */
  readonly segmentAvant?: Segment;
}

/**
 * Case tirée de l'étape au rang `rang` d'une journée : identifiant et étape, `kind`, jour, heure, catégorie de repli et
 * segment qui précède l'étape ; `null` si la ligne n'est pas une étape ou est un engagement. Voisins, détour et trajet
 * montré restent propres à chaque chemin.
 */
export function etapeEnCase(jour: Day, rang: number): EtapeEnCase | null {
  const ligne = element(jour.items, rang);
  if (ligne?.type !== "stop" || ligne.stop.commitment !== undefined) return null;
  const { stop } = ligne;
  const precedent = element(jour.items, rang - 1);
  return {
    id: stop.id,
    kind: stop.kind === "meal" ? "meal" : "activity",
    day: jour.index,
    time: stop.start,
    stop,
    category: stop.kind === "meal" ? CATEGORIE_REPAS : CATEGORIE_ACTIVITE,
    ...(precedent?.type === "segment" ? { segmentAvant: precedent.segment } : {}),
  };
}

/** Journée lue par `servisAvantDeblocage` : `Day` recomposé (site d'essai) ou journée de l'instantané (`api`, M1a-3). */
export type JourServi = Pick<Day, "index"> & {
  readonly items: readonly ({ readonly type: "stop"; readonly stop: { readonly id: string } } | { readonly type: Exclude<DayLineItem["type"], "stop"> })[];
  readonly events: readonly { readonly id: string }[];
};

/**
 * Journées et lignes « À faire » servies avant le déblocage : journées hors de `lisibles` retirées ; lignes « À faire »
 * retirées si elles désignent une journée retirée (`when.type = "tripDay"`) ou une étape absente des journées gardées
 * (`stopId`, étapes et événements).
 */
export function servisAvantDeblocage<J extends JourServi = Day>(
  jours: readonly J[],
  aFaire: readonly ChecklistItem[],
  lisibles: ReadonlySet<number>,
): { jours: J[]; aFaire: ChecklistItem[] } {
  const gardes = jours.filter((jour) => lisibles.has(jour.index));
  const indices = new Set(gardes.map((jour) => jour.index));
  const etapes = new Set(
    gardes.flatMap((jour) => [...jour.items.flatMap((ligne) => (ligne.type === "stop" ? [ligne.stop.id] : [])), ...jour.events.map((e) => e.id)]),
  );
  const lignes = aFaire.filter(
    (ligne) => (ligne.when.type !== "tripDay" || indices.has(ligne.when.day)) && (ligne.stopId === undefined || etapes.has(ligne.stopId)),
  );
  return { jours: gardes, aFaire: lignes };
}

/** Badges d'une étape au plus (`Stop.exceptions`, `.max(2)` du contrat). */
const BADGES_MAX = 2;

/**
 * Badge « à confirmer » calculé à la lecture (décision 0116 § 5.1 ; 0011 § 5) : pur, sans donnée Google, sans appel,
 * rien d'écrit en base. Une étape (`type: "stop"`) sans `placeId` est relue avec `exceptions` contenant `"toConfirm"`,
 * ajouté à ses badges existants dans la limite de 2 de `Stop.exceptions` (une étape qui en porte déjà deux reste telle
 * quelle : rien n'est retiré ni inventé) ; toute autre ligne est rendue telle quelle (même objet).
 */
export function avecBadgeSansLieu(ligne: DayLineItem): DayLineItem {
  if (ligne.type !== "stop") return ligne;
  const { stop } = ligne;
  if (stop.placeId !== undefined || stop.exceptions.includes("toConfirm") || stop.exceptions.length >= BADGES_MAX) return ligne;
  return { type: "stop", stop: { ...stop, exceptions: [...stop.exceptions, "toConfirm"] } };
}
