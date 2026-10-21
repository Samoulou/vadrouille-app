import "server-only";

import { PARTS_FORFAIT, RANG_ETAPE, type EtapeApercu } from "@/server/config/generation";
import type { Forfait } from "@/server/usage/forfait";
import type { Plafond } from "@/server/usage/port";
import { creerRegistreForfait, type RegistreForfait } from "@/server/usage/registre";
import { forfaitDuProfil, plafondsDuForfait, reserverForfait } from "@/server/usage/reservation";
import { executeurSql } from "@/server/with-org";

import type { EtatBarriere } from "./barriere";
import { ArretEtape } from "./codes";
import type { DependancesResolues } from "./dependances";

/**
 * Forfait de l'aperçu et part de chaque étape (décision 0081 B9-TL-3 points 1 (5) et 5 ; spécification B9c point 2).
 *
 * - **Réservé avant tout appel** : `reserverForfait(profil "apercu")` est idempotent par `generationRunId` ; chaque étape le
 *   rappelle pour retrouver son `Forfait` (jamais un second débit). Refusé (plafond par génération, par organisation et par
 *   jour, ou plafonds absents : `usage_unavailable`), l'étape s'arrête sur le code de refus, avant toute composition.
 * - **Part de l'étape** (`PARTS_FORFAIT`) : un forfait partiel et un registre **en mémoire** par étape, qui borne ses appels.
 *   Le dernier consommateur de chaque ressource reçoit le reste de l'arrondi, si bien que les parts somment au forfait.
 * - **Variante simulée** (décision 0110 § 3) : forfait du profil calculé en mémoire, **sans réservation** ni ligne dans
 *   `usage_ledger` (aucun fournisseur n'est appelé, et ces lignes s'ajouteraient aux cumuls lus par la variante réelle),
 *   sauf `reserverEnSimulee` (bancs de la base). Le registre en mémoire borne les doubles de la même façon.
 */

export type ForfaitDeLEtape = {
  readonly forfait: Forfait;
  readonly registre: RegistreForfait;
  readonly plafonds: readonly Plafond[];
};

type Parts = Readonly<Partial<Record<EtapeApercu, number>>>;

/** Part entière de `total` pour `etape` : arrondi par défaut, sauf le dernier consommateur qui reçoit le reste. */
export function partDe(total: number, parts: Parts, etape: EtapeApercu): number {
  const etapes = (Object.keys(parts) as EtapeApercu[]).sort((x, y) => RANG_ETAPE[x] - RANG_ETAPE[y]);
  if (!etapes.includes(etape)) return 0;
  const plancher = (e: EtapeApercu) => Math.floor((total * (parts[e] ?? 0)) / 100);
  if (etapes.at(-1) === etape) return Math.max(0, total - etapes.slice(0, -1).reduce((somme, e) => somme + plancher(e), 0));
  return plancher(etape);
}

/** Forfait partiel d'une étape depuis le forfait entier de l'exécution. */
export function forfaitPartiel(forfait: Forfait, etape: EtapeApercu): Forfait {
  return {
    nature: "execution",
    textSearchRequetes: partDe(forfait.textSearchRequetes, PARTS_FORFAIT.textSearch, etape),
    placeDetailsRequetes: partDe(forfait.placeDetailsRequetes, PARTS_FORFAIT.details, etape),
    routesRequetes: partDe(forfait.routesRequetes, PARTS_FORFAIT.routes, etape),
    routesElements: partDe(forfait.routesElements, PARTS_FORFAIT.routes, etape),
    coutGoogleMicros: 0,
    coutModelesMicros: forfait.coutModelesMicros === null ? null : partDe(forfait.coutModelesMicros, PARTS_FORFAIT.modeles, etape),
  };
}

/**
 * Forfait d'un passage du voyage complet (spécification B9d ; profil `complet`, B7-PO-5) : réservé sous l'identifiant du passage
 * (`identifiantForfait`, une réservation par passage, idempotente au rejeu). Répartition de la part de chaque étape (décision
 * du Tech Lead, revue consolidée de la PR 600 du 2026-10-20) :
 * - `a` et `l` : leur part entière (`forfaitPartiel`), inchangée ;
 * - `b`, `c` et `d` : leur part **répartie sur les villes que le passage introduit** (`part` : villes introduites par les jours
 *   de rang inférieur, par ce jour, et par tout le passage). Le jour qui introduit une ville reçoit la part de cette ville ; un
 *   jour qui n'en introduit aucune n'a rien à dépenser ;
 * - `e` : sa part **répartie par jour** du passage (un jour par étape `e`).
 * Le découpage est cumulatif (`partCumulee`) : la somme des parts des jours vaut exactement la part de l'étape.
 */
export type PartDuPassage = {
  /** Unités (villes introduites, ou jours pour `e`) des jours de rang inférieur. */
  readonly avant: number;
  /** Unités de ce jour. */
  readonly ici: number;
  /** Unités de tout le passage. */
  readonly total: number;
};

export type ForfaitDuPassage = { readonly profil: "complet"; readonly identifiant: string; readonly part?: PartDuPassage };

/** Part entière de `valeur` pour les unités `[avant, avant + ici)` parmi `total` : différence des arrondis cumulés. */
export function partCumulee(valeur: number, part: PartDuPassage): number {
  const total = Math.max(0, Math.floor(part.total));
  if (total === 0) return 0;
  const avant = Math.min(total, Math.max(0, Math.floor(part.avant)));
  const jusqua = Math.min(total, avant + Math.max(0, Math.floor(part.ici)));
  return Math.floor((valeur * jusqua) / total) - Math.floor((valeur * avant) / total);
}

/** Part d'un jour du voyage complet : chaque ressource de la part de l'étape découpée par `partCumulee`. */
export function partDuJour(forfait: Forfait, part: PartDuPassage): Forfait {
  const decouper = (valeur: number) => partCumulee(valeur, part);
  return {
    ...forfait,
    textSearchRequetes: decouper(forfait.textSearchRequetes),
    placeDetailsRequetes: decouper(forfait.placeDetailsRequetes),
    routesRequetes: decouper(forfait.routesRequetes),
    routesElements: decouper(forfait.routesElements),
    coutModelesMicros: forfait.coutModelesMicros === null ? null : decouper(forfait.coutModelesMicros),
  };
}

const ETAPES_DU_JOUR: ReadonlySet<EtapeApercu> = new Set(["b", "c", "d", "e"]);

export async function forfaitDeLEtape(
  dependances: DependancesResolues,
  contexte: { readonly organizationId: string; readonly tripId: string; readonly generationRunId: string; readonly barriere: EtatBarriere },
  etape: EtapeApercu,
  passage?: ForfaitDuPassage,
): Promise<ForfaitDeLEtape> {
  const profil = passage?.profil ?? "apercu";
  const cle = passage?.identifiant ?? contexte.generationRunId;
  const part = passage?.part;
  const ajuster = (entier: Forfait): Forfait => (part !== undefined && ETAPES_DU_JOUR.has(etape) ? partDuJour(entier, part) : entier);
  // Règles de la variante que la barrière vient de choisir (B9e point 2) : jamais les valeurs de test pour un appel réel.
  const regles = dependances.reglesPour(contexte.barriere);
  if (regles === null) throw new ArretEtape("usage_unavailable");
  if (contexte.barriere === "simulee" && !dependances.reserverEnSimulee) {
    let entier: Forfait;
    try {
      entier = forfaitDuProfil(regles.plafonds, regles.table, profil);
    } catch {
      throw new ArretEtape("usage_unavailable");
    }
    return forfaitEnMemoire(entier, etape, contexte.generationRunId, dependances, ajuster);
  }
  const reserve = await reserverForfait(
    (fn) => dependances.transaction(contexte.organizationId, (tx) => fn(executeurSql(tx))),
    { organisationId: contexte.organizationId, tripId: contexte.tripId, generationRunId: cle, profil },
    regles,
  );
  if (!reserve.ok) throw new ArretEtape(reserve.code);
  return forfaitEnMemoire(reserve.forfait, etape, contexte.generationRunId, dependances, ajuster);
}

function forfaitEnMemoire(entier: Forfait, etape: EtapeApercu, generationRunId: string, dependances: DependancesResolues, ajuster: (forfait: Forfait) => Forfait = (f) => f): ForfaitDeLEtape {
  const forfait = ajuster(forfaitPartiel(entier, etape));
  const registre = creerRegistreForfait(forfait, generationRunId, dependances.horloge);
  return { forfait, registre, plafonds: plafondsDuForfait(forfait) };
}
