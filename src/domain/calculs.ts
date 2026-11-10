import {
  ProposalNeighboursSchema,
  type Change,
  type DayLineItemSnapshot,
  type Proposal,
  type ProposalNeighbour,
  type ProposalNeighbours,
  type StopSnapshot,
  type Trip,
} from "@/contracts";

import type { ConfigurationMoteur } from "@/domain/configuration";
import { debutDeLigne, etapesDuJour, type JourProgramme } from "@/domain/programme";
import {
  dansLesPlages,
  INCONNU,
  logementsDuJour,
  trajetLePlusRapide,
  type Inconnu,
  type ModeTrajet,
  type Point,
  type Relectures,
} from "@/domain/relectures";
import { versMinutes } from "@/domain/temps";

/**
 * Fonctions calculées du moteur (handover § 5, colonne « calculé » ; spécification B5a, point 3). Pures : elles
 * lisent un jour, la configuration ou les interfaces injectées, et ne renvoient rien qui soit écrit. Les durées et
 * la marque `toConfirm` ne servent qu'à la recomposition en mémoire (B8), jamais à une sortie d'écriture.
 */

// --- Trip.destinationColor --------------------------------------------------------------------------------

const COULEURS = ["bruyere", "azulejo", "ocre", "granit"] as const satisfies readonly Trip["destinationColor"][];

/** Couleur de la plaque, attribution stable depuis la destination (reprise de P0). */
export function destinationColor(destination: string): Trip["destinationColor"] {
  let somme = 0;
  for (const caractere of destination) somme = (somme + (caractere.codePointAt(0) ?? 0)) % 997;
  return COULEURS.at(somme % COULEURS.length) ?? "granit";
}

// --- Proposal.option -------------------------------------------------------------------------------------

/**
 * Option d'un repas (cadrage § 3.4) : rang `index` (à partir de 1) parmi les options classées du créneau, `total`
 * borné à 3. Absente si le rang sort des options.
 */
export function optionDeRepas(index: number, nombreOptions: number): NonNullable<Proposal["option"]> | undefined {
  const total = Math.min(3, nombreOptions);
  if (!Number.isInteger(index) || index < 1 || index > total) return undefined;
  return { index, total };
}

// --- Proposal.neighbours (0037 B2-TL-1, point 2) -----------------------------------------------------------

function voisinDe(item: DayLineItemSnapshot, configuration: ConfigurationMoteur): ProposalNeighbour | undefined {
  switch (item.type) {
    case "terminus":
      return { type: "terminus", role: item.role };
    case "free":
      return { type: "free" };
    case "openMeal":
      return { type: "meal", meal: item.meal };
    case "stop":
      if (item.stop.kind === "meal") {
        // Repas choisi : déjeuner ou dîner selon la fenêtre de la configuration (B5-PO-1).
        const meal = versMinutes(item.stop.start) < versMinutes(configuration.repas.dinner.auPlusTot) ? "lunch" : "dinner";
        return { type: "meal", meal };
      }
      return { type: "stop", stopId: item.stop.id };
    case "transfer":
      // Le changement de ville n'est jamais un voisin : il arrête la recherche de ce côté (`voisins`, décision 0148 § 1).
      return undefined;
    case "segment":
      return undefined;
  }
}

/**
 * Voisins d'une proposition : l'élément de la ligne du jour qui précède son créneau (dernier élément qui commence
 * avant `time`) et celui qui le suit (premier qui commence à `time` ou après), en ignorant les trajets et l'étape
 * de la proposition. Jour en préparation, ou sans élément d'un côté : clé absente. Validé par
 * `ProposalNeighboursSchema`.
 *
 * Changement de ville (`transfer`, décision 0148 § 1 point 3 ; spécification M4 § 7.3) : il n'est jamais un voisin et
 * **arrête la recherche** de son côté, rangé par son départ `start` comme les autres éléments. Le plus proche élément
 * avant la proposition est le `transfer` : `before` absent ; le plus proche après : `after` absent. Un élément situé
 * au-delà du `transfer` n'est jamais un voisin. Aucun paramètre ni attente « déjeuner » propre au jour d'un changement
 * de ville (décision 0151 § 3) : un déjeuner n'y est cité que s'il est le voisin direct, comme un autre jour.
 */
export function voisins(
  jour: Pick<JourProgramme, "items" | "generating">,
  proposition: { time: string; stopId: string },
  configuration: ConfigurationMoteur,
): ProposalNeighbours {
  if (jour.generating === true) return ProposalNeighboursSchema.parse({});
  const instant = versMinutes(proposition.time);
  let before: ProposalNeighbour | undefined;
  let after: ProposalNeighbour | undefined;
  /** Un `transfer` rencontré après le créneau : plus aucun voisin `after` de ce côté. */
  let apresArrete = false;
  for (const item of jour.items) {
    if (item.type === "stop" && item.stop.id === proposition.stopId) continue;
    if (item.type === "transfer") {
      if (versMinutes(item.start) < instant) before = undefined;
      else apresArrete = true;
      continue;
    }
    if (apresArrete) continue;
    const debut = debutDeLigne(item);
    const voisin = voisinDe(item, configuration);
    if (debut === undefined || voisin === undefined) continue;
    if (debut < instant) before = voisin;
    else if (after === undefined) after = voisin;
  }
  return ProposalNeighboursSchema.parse({ ...(before ? { before } : {}), ...(after ? { after } : {}) });
}

// --- Day.budgetPerPerson et Change[budget] (B5-PO-10) -----------------------------------------------------

/**
 * Budget du jour : somme des `costPerPerson` des étapes du programme et des événements, **seulement si chacun a un
 * coût connu** (0 = gratuit) ; sinon absent. Sans étape ni événement, absent (comme P0). L'idée « Surprends-moi »,
 * les `openMeal` et les propositions ne comptent pas ; `mealBudgetPerPerson` du brief n'intervient jamais.
 */
export function budgetParPersonne(jour: Pick<JourProgramme, "items" | "events">): number | undefined {
  const lignes: readonly StopSnapshot[] = [...etapesDuJour(jour), ...jour.events];
  if (lignes.length === 0) return undefined;
  let somme = 0;
  for (const ligne of lignes) {
    const cout = ligne.facts.costPerPerson;
    if (cout === undefined) return undefined;
    somme += cout;
  }
  return somme;
}

/** `Change[budget]` : seulement si le budget est présent avant et après et que l'écart est non nul. */
export function changementDeBudget(avant: number | undefined, apres: number | undefined): Extract<Change, { type: "budget" }> | undefined {
  if (avant === undefined || apres === undefined || apres === avant) return undefined;
  return { type: "budget", deltaPerPerson: apres - avant };
}

// --- Day.travelMinutes (B5-PO-2) -------------------------------------------------------------------------

/**
 * Points successifs d'un jour, par tronçon : logement de départ, étapes qui ont un lieu, logement d'arrivée. Un jour
 * sans changement de ville a **un seul** tronçon (forme d'avant M4). Chaque `transfer` (décision 0148 § 1 point 3)
 * coupe la ligne : le tronçon d'avant finit à la dernière étape avant lui (aucun trajet vers la gare), celui d'après
 * commence à la première étape après lui (aucun trajet avant elle, spécification M4 § 7.3). Le changement de ville
 * n'est jamais un trajet : `Day.travelMinutes` ne le compte pas (M4-PO-11). Les trajets se lisent entre deux points
 * successifs **d'un même tronçon**.
 */
export function pointsDuJour(jour: Pick<JourProgramme, "index" | "items">, nombreDeNuits: number): Point[][] {
  const logements = logementsDuJour(jour.index - 1, nombreDeNuits);
  const troncons: Point[][] = [[{ logement: logements.depart }]];
  for (const item of jour.items) {
    if (item.type === "transfer") troncons.push([]);
    else if (item.type === "stop" && item.stop.placeId !== undefined) troncons.at(-1)?.push({ lieu: item.stop.placeId });
  }
  troncons.at(-1)?.push({ logement: logements.arrivee });
  return troncons;
}

/**
 * `Day.travelMinutes` : somme des durées fournies en mémoire (mode le plus rapide admis, B5-PO-6), **tous** les
 * trajets du jour, retour au logement compris (B5-PO-2). Un trajet sans durée connue : `inconnu` (jamais estimé
 * par le moteur ; B8 fournit l'estimation par l'interface). Pour la recomposition de B8, jamais écrit.
 */
export function minutesDeTrajet(
  jour: Pick<JourProgramme, "index" | "items">,
  nombreDeNuits: number,
  relectures: Relectures,
  modes: readonly ModeTrajet[],
): number | Inconnu {
  let total = 0;
  for (const points of pointsDuJour(jour, nombreDeNuits)) {
    for (let rang = 1; rang < points.length; rang += 1) {
      const depuis = points.at(rang - 1);
      const vers = points.at(rang);
      if (depuis === undefined || vers === undefined) continue;
      const trajet = trajetLePlusRapide(relectures, depuis, vers, modes);
      if (trajet === INCONNU) return INCONNU;
      total += trajet.minutes;
    }
  }
  return total;
}

// --- Marque toConfirm (B5-PO-5) ---------------------------------------------------------------------------

/**
 * Marque `toConfirm` d'une étape, en mémoire seulement (B8 la recalcule à la lecture, 0011 point 5) : plages
 * inconnues pour sa date ; ou étape verrouillée ou engagement hors des plages connues (R3 prime, l'étape reste).
 */
export function aConfirmer(stop: StopSnapshot, date: string, relectures: Relectures): boolean {
  if (stop.placeId === undefined) return false;
  const plages = relectures.plages(stop.placeId, date);
  if (plages === INCONNU) return true;
  if (!stop.locked && stop.commitment === undefined) return false;
  const debut = versMinutes(stop.start);
  const fin = stop.end === undefined ? debut : versMinutes(stop.end);
  return dansLesPlages(plages, debut, fin) === false;
}
