import "server-only";

import { PARTS_FORFAIT, RANG_ETAPE, type EtapeApercu } from "@/server/config/generation";
import type { Forfait } from "@/server/usage/forfait";
import type { Plafond } from "@/server/usage/port";
import { creerRegistreForfait, type RegistreForfait } from "@/server/usage/registre";
import { plafondsDuForfait, reserverForfait } from "@/server/usage/reservation";
import { executeurSql } from "@/server/with-org";

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

export async function forfaitDeLEtape(
  dependances: DependancesResolues,
  contexte: { readonly organizationId: string; readonly tripId: string; readonly generationRunId: string },
  etape: EtapeApercu,
): Promise<ForfaitDeLEtape> {
  if (dependances.regles === null) throw new ArretEtape("usage_unavailable");
  const regles = dependances.regles;
  const reserve = await reserverForfait(
    (fn) => dependances.transaction(contexte.organizationId, (tx) => fn(executeurSql(tx))),
    { organisationId: contexte.organizationId, tripId: contexte.tripId, generationRunId: contexte.generationRunId, profil: "apercu" },
    regles,
  );
  if (!reserve.ok) throw new ArretEtape(reserve.code);
  const forfait = forfaitPartiel(reserve.forfait, etape);
  const registre = creerRegistreForfait(forfait, contexte.generationRunId, dependances.horloge);
  return { forfait, registre, plafonds: plafondsDuForfait(forfait) };
}
