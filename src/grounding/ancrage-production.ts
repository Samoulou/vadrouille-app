import "server-only";

import type { Lodging } from "@/contracts";
import { RAYON_BIAIS_METRES } from "@/grounding/ancrage";
import {
  ancrerCandidatsDansZone,
  type CandidatAAncrer,
} from "@/grounding/ancrage-zone";
import { chargerFiches, chargerPosition } from "@/grounding/fiches";
import {
  cleMaison,
  ErreurAncrage,
  type ClientPlacesMvp,
  type Coordonnees,
  type RectangleZone,
} from "@/grounding/interfaces";
import {
  capturer,
  valeurOuEchec,
  type ResultatAncrage,
} from "@/grounding/resultat";
import type { PointTrajet } from "@/grounding/trajets";
import { zoneDuSejour } from "@/grounding/zone";

/**
 * Ancrage de production du MVP (B8a ; spécification B8, B8-PO-1 à B8-PO-4 ; décision 0085 § 1.3, § 3 et § 4).
 * **Aucune fiche pour un candidat** (0053, amendement 1, point 1) : Text Search « IDs only » restreint à la zone de la
 * ville, premier `placeId` gardé (algorithme unique `ancrerCandidatsDansZone`, réutilisé de P0r3c). Logements et
 * villes ne sont pas des candidats : fiche `details` du logement saisi ou suggéré à la vérification (`verifierLogement`,
 * étape `l`), fiche `position` du logement vérifié ou de la ville pour la zone et le départ (`zoneEtDepart` ; 0087 § 2.4).
 *
 * Entrées structurelles (0085 § 1.3) : `src/grounding` n'importe ni `@/ai` ni `@/research` ; la composition de B9 les
 * remplit depuis les sorties de B7. Les sorties de `ancrerCandidats` et `ancrerLogementsSuggeres` n'ont que des
 * identifiants maison et des `placeId` (ni verdict, ni motif, ni compteur) ; celle de `verifierLogement`, un `placeId`
 * seul ; celle de `zoneEtDepart` porte des positions, données Google en mémoire seulement (sauf le centre maison d'un
 * `suggestedArea`).
 */

/** Rayon minimal de la zone d'un quartier suggéré (B8-PO-4) : une zone de 50 m ne refuse pas un logement à deux rues. */
export const RAYON_MIN_QUARTIER_METRES = 2_000;

/**
 * Candidats d'**une** ville résolus dans sa zone (B8-PO-1, B8-PO-2) : requête `<nom maison>, <ville>`, restriction au
 * rectangle de la zone, premier `placeId`. Seuls les candidats résolus figurent dans la sortie (sans résultat : rien,
 * sans trace du motif). N candidats : N requêtes Text Search au plus, aucune fiche.
 */
export async function ancrerCandidats(
  candidats: readonly CandidatAAncrer[],
  ville: string,
  zone: RectangleZone,
  places: Pick<ClientPlacesMvp, "textSearch">,
): Promise<ResultatAncrage<ReadonlyMap<string, string>>> {
  return capturer(async () => {
    const ancrages = await ancrerCandidatsDansZone(
      candidats,
      ville,
      { textSearch: (requete) => places.textSearch(requete) },
      zone,
    );
    const resolus = new Map<string, string>();
    for (const [id, ancrage] of ancrages)
      if (ancrage.resolu) resolus.set(id, ancrage.placeId);
    return resolus;
  });
}

/** Quartier proposé par B7 (forme structurelle) : zone maison (ou `null`) et logements maison sans `placeId`. */
export type QuartierAAncrer<L extends { readonly nom: string }> = {
  readonly zone: {
    readonly centre: Coordonnees;
    readonly rayonM: number;
  } | null;
  readonly logements: readonly L[];
};

/**
 * Logements suggérés (`suggestLodging`, B8-PO-4) : chacun résolu par Text Search « IDs only » (`<nom maison>, <ville>`),
 * restreint au rectangle de la zone (`max(rayonM, 2 000 m)`) ; non résolu : retiré sans trace ; zéro logement est une
 * réponse valide. **Aucune fiche**, aucune écriture. Les champs maison (`meta`, `sourceUrl`…) traversent sans être lus.
 * Zone `null` (B8-PO-13, amendement 1) : liste vide, **aucun appel** (B9a rend `no_option` avant ; un Text Search sans
 * restriction pourrait rendre l'homonyme d'un autre pays).
 */
export async function ancrerLogementsSuggeres<
  L extends { readonly nom: string },
>(
  quartier: QuartierAAncrer<L>,
  ville: string,
  places: Pick<ClientPlacesMvp, "textSearch">,
): Promise<ResultatAncrage<(L & { readonly placeId: string })[]>> {
  return capturer(async () => {
    const resultat: (L & { readonly placeId: string })[] = [];
    // B8-PO-13 : quartier sans zone, aucun logement suggéré et aucun appel (jamais un Text Search sans restriction).
    if (quartier.zone === null) return resultat;
    const restriction = zoneDuSejour(
      [quartier.zone.centre],
      Math.max(quartier.zone.rayonM, RAYON_MIN_QUARTIER_METRES),
    );
    for (const logement of quartier.logements) {
      const { placeIds } = await places.textSearch({
        texte: `${logement.nom}, ${ville}`,
        biais: null,
        restriction,
      });
      const placeId = placeIds[0];
      if (placeId !== undefined) resultat.push({ ...logement, placeId });
    }
    return resultat;
  });
}

/**
 * Logement vérifié d'une ville (décision 0087 § 2.4) : seul le `placeId` sort de la vérification ; la fiche `details`
 * est oubliée. `null` : logement sans `placeId` à vérifier (`suggestedArea`, `area`, `none`), aucun appel.
 */
export type LogementVerifie = { readonly placeId: string } | null;

/**
 * Logement prêt pour la zone et le départ (0087 § 2.4) : `known` et `suggestedLodging` portent le `placeId` **déjà
 * vérifié** par `verifierLogement` (lu dans `stays.place_id`, B8-PO-14) ; les autres types sont ceux du contrat.
 */
export type LogementAPositionner =
  | { readonly kind: "known" | "suggestedLodging"; readonly placeId: string }
  | Extract<Lodging, { readonly kind: "suggestedArea" | "area" | "none" }>;

/**
 * Zone et départ d'un logement (B8-PO-1, B8-PO-3, B8-PO-15) : zone de la ville (cercle de `RAYON_BIAIS_METRES` autour du
 * centre), centre, `placeId` du logement s'il en a un, et point de départ des trajets (`PointTrajet` de `trajets.ts`) :
 * `placeId` et position d'une fiche, ou centre maison d'un `suggestedArea` et sa clé (`cleMaison`). Routes et
 * l'estimation partent toujours de ce point. Positions des fiches : données Google, en mémoire seulement.
 */
export type LogementAncre = {
  readonly zone: RectangleZone;
  readonly centre: Coordonnees;
  readonly placeIdLogement: string | null;
  readonly depart: PointTrajet;
};

const nonResolu = () => new ErreurAncrage("lodging_unresolved");

/** Premier `placeId` d'un Text Search sans biais ni restriction (logement saisi, ville : B8-TL-6 point 3). */
async function premierPlaceId(
  texte: string,
  places: Pick<ClientPlacesMvp, "textSearch">,
): Promise<string> {
  const { placeIds } = await places.textSearch({ texte, biais: null });
  const placeId = placeIds[0];
  if (placeId === undefined) throw nonResolu();
  return placeId;
}

/** Fiche `position` d'un lieu (module de conversion des fiches, 0085 § 1.4) ; introuvable → `lodging_unresolved`. */
async function positionOuNonResolu(
  placeId: string,
  places: Pick<ClientPlacesMvp, "position">,
): Promise<Coordonnees> {
  const issue = valeurOuEchec(await chargerPosition(placeId, places));
  if (issue.issue === "introuvable") throw nonResolu();
  return issue.position;
}

const zoneDe = (centre: Coordonnees) =>
  zoneDuSejour([centre], RAYON_BIAIS_METRES);

/**
 * **Vérification** du logement d'une ville (0087 § 2.2 et § 2.4 ; B8-PO-3, B8-PO-14), appelée par la seule étape `l` :
 * - `known` : Text Search `<libellé>, <ville>` sans biais ni restriction, premier `placeId` ;
 * - `suggestedLodging` : son `placeId` ; absent, résolu comme `known` sur son nom maison (B8-PO-14) ;
 * puis **une** fiche `details` (statut). Introuvable, non résolu ou fermé définitivement : `lodging_unresolved`.
 * `suggestedArea`, `area`, `none` : aucun appel, `null`. Rend le `placeId` seul (aucune position, aucun horaire).
 */
export async function verifierLogement(
  logement: Lodging,
  ville: string,
  places: Pick<ClientPlacesMvp, "textSearch" | "details">,
): Promise<ResultatAncrage<LogementVerifie>> {
  return capturer(async (): Promise<LogementVerifie> => {
    if (logement.kind !== "known" && logement.kind !== "suggestedLodging")
      return null;
    const placeId =
      logement.kind === "suggestedLodging" && logement.placeId !== undefined
        ? logement.placeId
        : await premierPlaceId(
            `${logement.kind === "known" ? logement.label : logement.name}, ${ville}`,
            places,
          );
    const fiche = valeurOuEchec(await chargerFiches([placeId], places))[0];
    if (
      fiche === undefined ||
      fiche.issue === "introuvable" ||
      fiche.statut === "CLOSED_PERMANENTLY"
    )
      throw nonResolu();
    return { placeId };
  });
}

/**
 * **Zone et départ** du logement d'une ville (0087 § 2.3, § 2.4 et § 3 ; B8-PO-1, B8-PO-15, B8-PO-16), par étape qui
 * en a besoin (c, e) :
 * - logement vérifié (`known`, `suggestedLodging`) : une fiche `position` sur son `placeId`, jamais `details` ni un
 *   second Text Search ;
 * - `area`, `none` : Text Search sur le nom de la ville, puis une fiche `position` ;
 * - `suggestedArea` : **aucun appel** ; zone, centre et départ sur le centre maison `area.center` (variante (i) de
 *   B8-PO-15), envoyé à Routes en coordonnées et utilisé par l'estimation.
 * Introuvable : `lodging_unresolved`.
 */
export async function zoneEtDepart(
  logement: LogementAPositionner,
  ville: string,
  places: Pick<ClientPlacesMvp, "textSearch" | "position">,
): Promise<ResultatAncrage<LogementAncre>> {
  return capturer(async (): Promise<LogementAncre> => {
    switch (logement.kind) {
      case "known":
      case "suggestedLodging": {
        const centre = await positionOuNonResolu(logement.placeId, places);
        return {
          zone: zoneDe(centre),
          centre,
          placeIdLogement: logement.placeId,
          depart: { placeId: logement.placeId, position: centre },
        };
      }
      case "suggestedArea": {
        const centre = { lat: logement.center.lat, lng: logement.center.lng };
        return {
          zone: zoneDe(centre),
          centre,
          placeIdLogement: null,
          depart: { cleMaison: cleMaison(centre), centreMaison: centre },
        };
      }
      case "area":
      case "none": {
        const placeId = await premierPlaceId(ville, places);
        const centre = await positionOuNonResolu(placeId, places);
        return {
          zone: zoneDe(centre),
          centre,
          placeIdLogement: null,
          depart: { placeId, position: centre },
        };
      }
    }
  });
}
