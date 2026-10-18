import "server-only";

import type { Lodging } from "@/contracts";
import { RAYON_BIAIS_METRES } from "@/grounding/ancrage";
import {
  ancrerCandidatsDansZone,
  type CandidatAAncrer,
} from "@/grounding/ancrage-zone";
import { chargerFiches, chargerPosition } from "@/grounding/fiches";
import {
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
import { zoneDuSejour } from "@/grounding/zone";

/**
 * Ancrage de production du MVP (B8a ; spécification B8, B8-PO-1 à B8-PO-4 ; décision 0085 § 1.3, § 3 et § 4).
 * **Aucune fiche pour un candidat** (0053, amendement 1, point 1) : Text Search « IDs only » restreint à la zone de la
 * ville, premier `placeId` gardé (algorithme unique `ancrerCandidatsDansZone`, réutilisé de P0r3c). Logements et
 * villes ne sont pas des candidats : fiche `details` du logement saisi ou suggéré, `position` de la ville.
 *
 * Entrées structurelles (0085 § 1.3) : `src/grounding` n'importe ni `@/ai` ni `@/research` ; la composition de B9 les
 * remplit depuis les sorties de B7. Les sorties de `ancrerCandidats` et `ancrerLogementsSuggeres` n'ont que des
 * identifiants maison et des `placeId` (ni verdict, ni motif, ni compteur) ; celle d'`ancrerLogement` porte des
 * positions, données Google en mémoire seulement.
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
 * Zone `null` : Text Search sans restriction ni biais (écart noté dans la PR de B8a, question au Product Owner).
 */
export async function ancrerLogementsSuggeres<
  L extends { readonly nom: string },
>(
  quartier: QuartierAAncrer<L>,
  ville: string,
  places: Pick<ClientPlacesMvp, "textSearch">,
): Promise<ResultatAncrage<(L & { readonly placeId: string })[]>> {
  return capturer(async () => {
    const restriction =
      quartier.zone === null
        ? undefined
        : zoneDuSejour(
            [quartier.zone.centre],
            Math.max(quartier.zone.rayonM, RAYON_MIN_QUARTIER_METRES),
          );
    const resultat: (L & { readonly placeId: string })[] = [];
    for (const logement of quartier.logements) {
      const { placeIds } = await places.textSearch({
        texte: `${logement.nom}, ${ville}`,
        biais: null,
        ...(restriction === undefined ? {} : { restriction }),
      });
      const placeId = placeIds[0];
      if (placeId !== undefined) resultat.push({ ...logement, placeId });
    }
    return resultat;
  });
}

/**
 * Logement d'une ville ancré (B8-PO-1, B8-PO-3) : zone de la ville (cercle de `RAYON_BIAIS_METRES` autour du centre),
 * centre, `placeId` du logement s'il en a un, et point de départ des trajets (`placeId` du logement, sinon de la
 * ville : 0085 § 1.6). Positions : données Google, en mémoire seulement (sauf le centre maison d'un `suggestedArea`).
 */
export type LogementAncre = {
  readonly zone: RectangleZone;
  readonly centre: Coordonnees;
  readonly placeIdLogement: string | null;
  readonly depart: { readonly placeId: string; readonly position: Coordonnees };
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

/** Fiche `details` d'un logement : introuvable ou fermé définitivement → `lodging_unresolved` (règle de P0, B8-PO-3). */
async function ficheLogement(
  placeId: string,
  places: Pick<ClientPlacesMvp, "details">,
): Promise<Coordonnees> {
  const fiche = valeurOuEchec(await chargerFiches([placeId], places))[0];
  if (
    fiche === undefined ||
    fiche.issue === "introuvable" ||
    fiche.statut === "CLOSED_PERMANENTLY"
  )
    throw nonResolu();
  return fiche.position;
}

/** Ville : Text Search sur son nom, puis `position` (B8-PO-1) ; introuvable → `lodging_unresolved`. */
async function centreDeVille(
  ville: string,
  places: Pick<ClientPlacesMvp, "textSearch" | "position">,
): Promise<{ placeId: string; position: Coordonnees }> {
  const placeId = await premierPlaceId(ville, places);
  const issue = valeurOuEchec(await chargerPosition(placeId, places));
  if (issue.issue === "introuvable") throw nonResolu();
  return { placeId, position: issue.position };
}

const zoneDe = (centre: Coordonnees) =>
  zoneDuSejour([centre], RAYON_BIAIS_METRES);

/**
 * Logement du brouillon d'une ville (0085 § 1.3) — fonction de production, jamais celle de `ancrage.ts` :
 * - `known` : Text Search `<libellé>, <ville>` sans biais ni restriction, premier `placeId`, puis sa fiche ;
 * - `suggestedLodging` : fiche de son `placeId` (absent : résolu comme `known` sur son nom maison, écart noté) ;
 * - `suggestedArea` : centre maison de la zone (B7-PO-3), départ des trajets depuis le `placeId` de la ville (Text
 *   Search seul, lecture du Tech Lead ; question au Product Owner) ;
 * - `area`, `none` : Text Search sur le nom de la ville, puis `position`.
 * Non résolu, introuvable ou fermé définitivement : `lodging_unresolved` (la génération s'arrête).
 */
export async function ancrerLogement(
  logement: Lodging,
  ville: string,
  places: Pick<ClientPlacesMvp, "textSearch" | "details" | "position">,
): Promise<ResultatAncrage<LogementAncre>> {
  return capturer(async (): Promise<LogementAncre> => {
    switch (logement.kind) {
      case "known":
      case "suggestedLodging": {
        const placeId =
          logement.kind === "suggestedLodging" && logement.placeId !== undefined
            ? logement.placeId
            : await premierPlaceId(
                `${logement.kind === "known" ? logement.label : logement.name}, ${ville}`,
                places,
              );
        const centre = await ficheLogement(placeId, places);
        return {
          zone: zoneDe(centre),
          centre,
          placeIdLogement: placeId,
          depart: { placeId, position: centre },
        };
      }
      case "suggestedArea": {
        const centre = { lat: logement.center.lat, lng: logement.center.lng };
        const placeId = await premierPlaceId(ville, places);
        return {
          zone: zoneDe(centre),
          centre,
          placeIdLogement: null,
          depart: { placeId, position: centre },
        };
      }
      case "area":
      case "none": {
        const depart = await centreDeVille(ville, places);
        return {
          zone: zoneDe(depart.position),
          centre: depart.position,
          placeIdLogement: null,
          depart,
        };
      }
    }
  });
}
