import "server-only";

import {
  selectionnerSerie,
  type BornesSerie,
  type LieuClasse,
} from "@/grounding/fiches-finales";
import {
  ErreurAncrage,
  type ClientPlacesMvp,
  type Coordonnees,
  type DetailsLieu,
  type RectangleZone,
  type STATUTS_GOOGLE,
} from "@/grounding/interfaces";
import {
  capturer,
  echecDe,
  reussi,
  valeurOuEchec,
  type ResultatAncrage,
} from "@/grounding/resultat";
import { dansZone } from "@/grounding/zone";

/**
 * Fiches Place Details du MVP (B8a ; spécification B8, B8-PO-5, B8-PO-6, B8-PO-12 ; décision 0085 § 1.4, § 1.5, § 2 et
 * § 5). **Seul module** de `src/grounding` qui convertit une réponse Place Details (masques `details`, `position`,
 * `identifiant`) en type de production (0085 § 1.4) ; `positionsDuJour` et `positionsSansCache` (B8b) passeront par lui.
 *
 * - `chargerFiches` : une issue par `placeId` demandé, dans l'ordre, sans filtrage ni compteur ; une fiche par
 *   `placeId` distinct ; appels **séquentiels**, arrêt au premier échec, sans issue partielle (0085 § 5).
 * - `ficherSerie` : seul appelant de planification ; filtrage, remplacement par le suivant et compte des écartés, par
 *   le cœur partagé avec P0 (`selectionnerSerie`, 0085 § 1.9).
 * - `chargerPosition` : masque `id,location` (centre d'une ville, B8-PO-1).
 * - `rafraichirPlaceId` : masque `id`, au-delà de 365 jours seulement (B8-PO-12).
 *
 * Tout ce que rendent ces fonctions, sauf les `placeId`, est une donnée Google : en mémoire seulement. Nom, adresse,
 * note et prix ne sont jamais recopiés (champs recopiés un par un).
 */

/** Plage d'une fiche : jour (0 = dimanche), minutes depuis minuit ; `finLendemain` si la fermeture tombe le lendemain. */
export type PlageFiche = {
  readonly jour: number;
  readonly debut: number;
  readonly fin: number;
  readonly finLendemain?: number;
};

export type FicheChargee = {
  readonly placeId: string;
  readonly issue: "chargee";
  /** Absent : aucun état d'établissement déclaré (Q460). */
  readonly statut?: (typeof STATUTS_GOOGLE)[number];
  readonly position: Coordonnees;
  /** `null` : horaires inconnus. */
  readonly horaires: readonly PlageFiche[] | null;
};
export type FicheIntrouvable = {
  readonly placeId: string;
  readonly issue: "introuvable";
};
export type IssueFiche = FicheChargee | FicheIntrouvable;

/** Conversion d'une fiche `details`, champ par champ (aucun champ hors du masque n'est recopié). */
function ficheDe(placeId: string, details: DetailsLieu): FicheChargee {
  return {
    placeId,
    issue: "chargee",
    ...(details.statut === undefined ? {} : { statut: details.statut }),
    position: { lat: details.position.lat, lng: details.position.lng },
    horaires:
      details.horaires === null
        ? null
        : details.horaires.map(({ jour, debut, fin, finLendemain }) =>
            finLendemain === undefined
              ? { jour, debut, fin }
              : { jour, debut, fin, finLendemain },
          ),
  };
}

const estIntrouvable = (erreur: unknown) =>
  erreur instanceof ErreurAncrage && erreur.code === "place_not_found";

/**
 * Fiches d'une liste de `placeId`, quel que soit l'usage (planification par `ficherSerie`, lecture par B8b) : **une
 * issue par entrée**, dans l'ordre, `chargee` ou `introuvable` (`place_not_found` du client, jamais rendu comme code).
 * Un `placeId` répété reçoit la même issue, une seule fiche. Au premier échec (erreur, plafond, quota, « Google
 * indisponible »), aucun appel de plus : l'appel entier rend `{ ok: false, code, retryable }`.
 */
export async function chargerFiches(
  placeIds: readonly string[],
  places: Pick<ClientPlacesMvp, "details">,
): Promise<ResultatAncrage<readonly IssueFiche[]>> {
  const lues = new Map<string, IssueFiche>();
  for (const placeId of placeIds) {
    if (lues.has(placeId)) continue;
    try {
      lues.set(placeId, ficheDe(placeId, await places.details(placeId)));
    } catch (erreur) {
      if (!estIntrouvable(erreur)) return echecDe(erreur);
      lues.set(placeId, { placeId, issue: "introuvable" });
    }
  }
  return reussi(placeIds.map((placeId) => lues.get(placeId) as IssueFiche));
}

/** Sortie de `ficherSerie` : retenus dans l'ordre du classement, nombre d'écartés, série remplie. En mémoire seulement. */
export type SerieFichee = {
  readonly retenus: readonly {
    readonly id: string;
    readonly fiche: FicheChargee;
  }[];
  readonly ecartes: number;
  readonly complete: boolean;
};

/**
 * Fiches de la série de planification (B8-PO-5, B8-PO-6) : dans l'ordre du classement, d'abord la série, puis un
 * remplaçant par lieu écarté, au plus `premiereSerie + marge` fiches. **Écarté** : issue `introuvable`, statut
 * `CLOSED_PERMANENTLY` ou position hors de `zone` ; `CLOSED_TEMPORARILY` est gardé (le moteur l'écarte, R4). Marge
 * épuisée : série incomplète (`complete: false` ; la case « aucune option compatible » est posée par le moteur). La
 * marge est un nombre reçu (la composition la calcule par `margeRemplacement`).
 */
export async function ficherSerie(
  classement: readonly LieuClasse[],
  bornes: BornesSerie,
  zone: RectangleZone,
  places: Pick<ClientPlacesMvp, "details">,
): Promise<ResultatAncrage<SerieFichee>> {
  // Échec d'un appel : remonté par le cœur (`EchecRemonte`), sans série partielle.
  const lire = async (placeId: string): Promise<IssueFiche> =>
    valeurOuEchec(await chargerFiches([placeId], places))[0] as IssueFiche;
  const gardee = (fiche: IssueFiche): fiche is FicheChargee =>
    fiche.issue === "chargee" &&
    fiche.statut !== "CLOSED_PERMANENTLY" &&
    dansZone(fiche.position, zone);
  return capturer(async () => {
    const selection = await selectionnerSerie(classement, lire, gardee, bornes);
    return {
      retenus: selection.retenus,
      ecartes: selection.ecartes,
      complete: selection.complete,
    };
  });
}

/** Position d'un lieu (masque `id,location`, B8-PO-1), ou `introuvable`. */
export type IssuePosition =
  | {
      readonly issue: "chargee";
      readonly placeId: string;
      readonly position: Coordonnees;
    }
  | FicheIntrouvable;

export async function chargerPosition(
  placeId: string,
  places: Pick<ClientPlacesMvp, "position">,
): Promise<ResultatAncrage<IssuePosition>> {
  try {
    const lu = await places.position(placeId);
    return reussi({
      issue: "chargee",
      placeId,
      position: { lat: lu.position.lat, lng: lu.position.lng },
    });
  } catch (erreur) {
    return estIntrouvable(erreur)
      ? reussi({ placeId, issue: "introuvable" })
      : echecDe(erreur);
  }
}

/** Âge au-delà duquel un `placeId` est rafraîchi (B8-PO-12 ; Google recommande 12 mois). */
export const AGE_RAFRAICHISSEMENT_MS = 365 * 24 * 60 * 60 * 1000;

/** Issue d'un rafraîchissement : identifiant à utiliser (le même ou un nouveau), ou `introuvable`. */
export type IssueRafraichissement =
  | {
      readonly issue: "identifiant";
      readonly placeId: string;
      readonly rafraichi: boolean;
    }
  | FicheIntrouvable;

/**
 * Rafraîchit un `placeId` dont la date de référence (ms depuis l'époque Unix) a **plus de 365 jours** à `maintenant`
 * (B8-PO-12) : **un** Place Details au masque `id` (`GET /v1/places/{placeId}`), jamais un Text Search. 365 jours ou
 * moins : aucun appel. Réponse avec un autre `id` : le nouvel identifiant ; identifiant obsolète (404 `NOT_FOUND`) :
 * `introuvable` (valeur, jamais le code `place_not_found`) ; erreur, plafond ou quota : code fermé, aucun identifiant.
 */
export async function rafraichirPlaceId(
  entree: { readonly placeId: string; readonly reference: number },
  maintenant: number,
  places: Pick<ClientPlacesMvp, "identifiant">,
): Promise<ResultatAncrage<IssueRafraichissement>> {
  if (!Number.isFinite(entree.reference) || !Number.isFinite(maintenant))
    return { ok: false, code: "invalid_request", retryable: false };
  if (maintenant - entree.reference <= AGE_RAFRAICHISSEMENT_MS)
    return reussi({
      issue: "identifiant",
      placeId: entree.placeId,
      rafraichi: false,
    });
  try {
    const { placeId } = await places.identifiant(entree.placeId);
    return reussi({ issue: "identifiant", placeId, rafraichi: true });
  } catch (erreur) {
    return estIntrouvable(erreur)
      ? reussi({ placeId: entree.placeId, issue: "introuvable" })
      : echecDe(erreur);
  }
}
