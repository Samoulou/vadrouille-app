import "server-only";

import { ficheOuNull } from "@/grounding/ancrage";
import { ErreurAncrage, type ClientPlaces, type Coordonnees, type RectangleZone } from "@/grounding/interfaces";
import { dansZone } from "@/grounding/zone";
import type { AncrageResolu } from "@/prototype/ancrage";

/**
 * Fiches Place Details de l'étape finale de `p0Run` (décision 0055, section 6 points 3 et 4 ; 0053, amendement 1,
 * points 1, 2 et 4 ; 0052 § 1.3 et § 1.12). Masque et SKU inchangés (`MASQUE_DETAILS`, `SKU_DETAILS` : le moins cher
 * qui porte statut, position et horaires ; aucun nouveau masque ni SKU, 0052 § 1.3).
 *
 * - **Pré-tri avant fiche** (`preTriParCache`) : seul un candidat dont le cache `place_coordinates` a une position vivante
 *   peut être écarté sans fiche, et seulement s'il est **hors de la zone du séjour** (même rectangle que la restriction de
 *   l'ancrage et que le filet ci-dessous : aucun seuil de distance nouveau, la distance reste un coût, cadrage § 3.7).
 *   Un candidat sans position en cache n'est jamais écarté avant sa fiche. La position du cache ne sort pas de cette
 *   fonction : jamais à la planification, à la validation, à l'écriture ni dans un prompt.
 * - **Fiches** (`fichesEtapeFinale`) : dans l'ordre du classement, jusqu'à remplir la première série, avec une marge de
 *   remplacement ; écartés avant planification : fiche introuvable, fermé définitivement (R1), position hors de la zone
 *   (filet). Chaque écarté est remplacé par le suivant du classement ; marge épuisée : série incomplète (case « aucune
 *   option compatible », PO-6, décidée par l'appelant). **Au plus `premiereSerie + marge` fiches**, jamais davantage.
 * - **Logements** (`fichesLogementsEtapeFinale`) : une fiche par logement, relue ici puisque la position écrite vient de
 *   l'étape finale (0052 § 1.3).
 */

/** Candidat classé et résolu à l'ancrage : identifiant interne et `placeId` seulement. */
export type LieuClasse = { readonly id: string; readonly placeId: string };

/** Règle de la marge de remplacement (Q389, Product Owner) : `max(minimum, ⌈part × première série⌉)`. */
export type RegleMarge = { readonly minimum: number; readonly part: number };

export function margeRemplacement(premiereSerie: number, regle: RegleMarge): number {
  if (!Number.isSafeInteger(premiereSerie) || premiereSerie < 0) throw new RangeError("fiches: première série invalide");
  if (!Number.isSafeInteger(regle.minimum) || regle.minimum < 0 || !Number.isFinite(regle.part) || regle.part < 0 || regle.part > 1) {
    throw new RangeError("fiches: règle de marge invalide");
  }
  return Math.max(regle.minimum, Math.ceil(premiereSerie * regle.part));
}

/** Pré-tri avant fiche : écarte les seuls candidats dont la position en cache est hors de la zone. */
export function preTriParCache<T extends LieuClasse>(classement: readonly T[], positionsCache: ReadonlyMap<string, Coordonnees>, zone: RectangleZone): T[] {
  return classement.filter((lieu) => {
    const position = positionsCache.get(lieu.placeId);
    return position === undefined || dansZone(position, zone);
  });
}

export type IssueFiches = {
  /** Lieux retenus avec leur fiche, dans l'ordre du classement ; au plus `premiereSerie`. */
  readonly retenus: readonly { readonly id: string; readonly ancrage: AncrageResolu }[];
  /** Fiches demandées (une par `placeId` distinct), au plus `premiereSerie + marge`. */
  readonly fiches: number;
  /** Vrai si la première série est remplie. */
  readonly complete: boolean;
};

/**
 * Fiches de la première série et de sa marge, dans l'ordre du classement. Deux candidats du même `placeId` partagent
 * une seule fiche. Toute erreur du client autre que `place_not_found` est propagée (l'exécution s'arrête).
 */
export async function fichesEtapeFinale(
  classement: readonly LieuClasse[],
  places: Pick<ClientPlaces, "details">,
  zone: RectangleZone,
  bornes: { readonly premiereSerie: number; readonly marge: number },
): Promise<IssueFiches> {
  const { premiereSerie, marge } = bornes;
  if (!Number.isSafeInteger(premiereSerie) || premiereSerie < 0 || !Number.isSafeInteger(marge) || marge < 0) throw new RangeError("fiches: bornes invalides");
  const plafond = premiereSerie + marge;
  const lues = new Map<string, AncrageResolu | null>();
  const retenus: { id: string; ancrage: AncrageResolu }[] = [];
  for (const lieu of classement) {
    if (retenus.length >= premiereSerie) break;
    if (!lues.has(lieu.placeId)) {
      if (lues.size >= plafond) break;
      lues.set(lieu.placeId, await ficheOuNull(lieu.placeId, places));
    }
    const fiche = lues.get(lieu.placeId) ?? null;
    if (fiche === null || fiche.statut === "ferme_definitivement" || !dansZone(fiche.position, zone)) continue;
    retenus.push({ id: lieu.id, ancrage: fiche });
  }
  return { retenus, fiches: lues.size, complete: retenus.length >= premiereSerie };
}

/** Fiches des logements à l'étape finale : une chacun ; introuvable ou fermé définitivement : `lodging_unresolved`. */
export async function fichesLogementsEtapeFinale(placeIds: readonly string[], places: Pick<ClientPlaces, "details">): Promise<AncrageResolu[]> {
  const fiches: AncrageResolu[] = [];
  for (const placeId of placeIds) {
    const fiche = await ficheOuNull(placeId, places);
    if (fiche === null || fiche.statut === "ferme_definitivement") throw new ErreurAncrage("lodging_unresolved");
    fiches.push(fiche);
  }
  return fiches;
}
