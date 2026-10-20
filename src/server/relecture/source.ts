import "server-only";

import {
  type DemandeRelectures,
  type Point,
  type RefusRelectures,
  type SejourDeNuit,
  type SourceRelectures,
  type VoyageARelire,
} from "@/domain/relectures";
import { chargerFiches, chargerPosition, placeIdDeVille, positionsFraiches, type IssueFiche, type IssuePosition } from "@/grounding/fiches";
import { cleMaison, type ClientPlacesMvp, type ClientRoutes, type Coordonnees } from "@/grounding/interfaces";
import type { CodeEchecPositions, PositionGoogleFraiche } from "@/grounding/port-positions";
import { chargerTrajetsParCouples, type CoupleTrajet, type PointTrajet, type TableTrajets } from "@/grounding/trajets";
import { versRelectures } from "@/server/relecture/relectures";
import { logEvent } from "@/server/log";
import { ecrirePositionsAbsentes, LOT_ECRITURE_POSITIONS } from "@/server/relecture/positions-ecriture";
import { periodesDe } from "@/server/usage/periodes";
import type { ContexteAppel, Horloge, Plafond, PortConsommation } from "@/server/usage/port";
import { creerRegistreForfait } from "@/server/usage/registre";
import { forfaitDuProfil, plafondsDuForfait, reserverForfait, type ProfilForfait, type ReglesUsage, type TransactionOrganisation } from "@/server/usage/reservation";

/**
 * Source de relectures de la lecture des voyages (B8b ; décision 0100 § 3, § 4, § 5.1 et § 6) : implémente
 * `SourceRelectures` (0086 § 1.2 point 3). Pour une lecture, elle **réserve** le forfait (profil `relecture` ou
 * `relectureVoyage` selon la portée), **appelle** Places et Routes (fiches des lieux de la demande, positions des
 * logements, trajets par couples), **écrit** au cache les positions fraîches et **assemble** les tables de
 * `versRelectures` (`usage: "lecture"`). Elle ne recompose ni `Day` ni `Proposal` (`src/domain/recomposition.ts`) et ne
 * lit aucune variable d'environnement : tout lui est injecté par `src/server/composition/lecture.ts`.
 *
 * Forme des transactions (0100 § 3.2) : aucune n'est ouverte pendant un appel Google, aucune n'est imbriquée, une seule
 * connexion à la fois. Transaction 1 : réservation, **validée avant le premier appel** (le forfait est compté même si
 * les appels échouent : surestimation, jamais sous-estimation). Appels : registre en mémoire du forfait, clients
 * construits **avant** la réservation (barrière de sortie fermée ou clé absente : `unavailable`, rien n'est réservé).
 * Transaction 2 : écriture des seules positions fraîches absentes du cache, sauf interrupteur
 * `POSITIONS_ECRITURE_SUSPENDUE` ; une écriture qui échoue est abandonnée, la lecture est servie.
 *
 * Refus rendus (jamais levés) : `quota_reached` (plafond, quota du jour ou enveloppe, à la réservation ou pendant les
 * appels de Routes) et `unavailable` (tout le reste). Les fiches, elles, ne sont jamais un refus (B8-PO-9, 0100 § 4.1) :
 * un échec des fiches rend des relectures sans fiches (lieux `inconnu`, donc ni `toConfirm` ni plages), journalisé une
 * fois (`voyages.fiches_non_relues`, raison fermée). Un échec de Routes reste un refus, même si les fiches ont réussi.
 *
 * Données Google : fiches, positions et durées restent en mémoire de cette fonction et dans les tables rendues ; seules
 * les positions fraîches vont au cache (port `PortPositions`, 0060). Aucune n'est journalisée, ni mise dans un prompt.
 */

export { LOT_ECRITURE_POSITIONS };

/** Clients Places et Routes d'une lecture, construits par la fabrique commune (`composition/clients-google.ts`). */
export type ClientsLecture = { readonly places: ClientPlacesMvp; readonly routes: ClientRoutes };

/** Fabrique des clients : lève si la barrière de sortie est fermée ou si la clé est absente. */
export type FabriqueClients = (options: {
  readonly usage: PortConsommation;
  readonly contexte: () => ContexteAppel;
  readonly plafonds: readonly Plafond[];
  readonly horloge: Horloge;
}) => ClientsLecture;

export type DependancesSource = {
  /** Plafonds, table de prix et horloge du port ; `null` (`PLAFONDS_USAGE` nul) : lecture réelle indisponible. */
  readonly regles: ReglesUsage | null;
  /** Transaction `withOrg` du contexte de la lecture (organisation et utilisateur de la session). */
  readonly transaction: (contexte: VoyageARelire["contexte"]) => TransactionOrganisation;
  readonly clients: FabriqueClients;
  /** `POSITIONS_ECRITURE_SUSPENDUE` vaut `1` (0060 § 1.3). */
  readonly positionsSuspendues: () => boolean;
  readonly horloge: Horloge;
  /**
   * Où le forfait est compté : `usage_ledger` (défaut, transaction 1) ou en mémoire seulement (`"memoire"` : registre du
   * forfait, aucune ligne écrite). `"memoire"` est réservé à la lecture des voyages générés par la variante simulée, sur les
   * doubles des fixtures, sans client réel (décision 0110 § 3) : ses lignes ne doivent pas s'ajouter aux cumuls que lit la
   * variante réelle.
   */
  readonly reservation?: "usage_ledger" | "memoire";
};

/**
 * Codes qui rendent `quota_reached` (plafond, enveloppe, quota du jour). `upstream_rate_limited` (limite de débit de Google,
 * transitoire, hors de nos plafonds) n'en fait pas partie : c'est `unavailable`, pour Routes comme pour les fiches.
 */
const REFUS_QUOTA: ReadonlySet<string> = new Set(["cap_reached", "envelope_reached", "daily_quota_insufficient"]);

/** Raison fermée du journal des fiches non relues. */
function raisonFiches(code: string): "cap_reached" | "quota_reached" | "unavailable" {
  if (code === "cap_reached") return "cap_reached";
  if (code === "envelope_reached" || code === "daily_quota_insufficient") return "quota_reached";
  return "unavailable";
}

type GenreNuit = "lieu" | "maison" | "ville" | "aucun";

/**
 * Comment le point de départ d'une nuit se résout (0100 § 6.2) : (a) `stays.place_id` ; (b) `suggestedArea` avec centre :
 * clé maison, aucun appel ; (c) ville : Text Search puis fiche de position ; un `known` ou `suggestedLodging` sans lieu
 * (ou une ligne antérieure à B9b de type `lodging` sans lieu) : aucun appel, le point reste `inconnu`.
 */
function genreDe(sejour: SejourDeNuit): GenreNuit {
  if (sejour.placeId !== null) return "lieu";
  if (sejour.logement === "suggestedArea" && sejour.centre !== null) return "maison";
  if (sejour.logement === "known" || sejour.logement === "suggestedLodging") return "aucun";
  if (sejour.logement === null && sejour.type === "lodging") return "aucun";
  return sejour.ville !== null && sejour.ville.trim() !== "" ? "ville" : "aucun";
}

/** Index des nuits dont le logement est un point d'un trajet de la demande. */
function nuitsDeLaDemande(demande: DemandeRelectures): ReadonlySet<number> {
  const nuits = new Set<number>();
  for (const trajet of demande.trajets) {
    for (const point of [trajet.depuis, trajet.vers]) if ("logement" in point) nuits.add(point.logement);
  }
  return nuits;
}

const refus = (r: RefusRelectures) => ({ ok: false, refus: r }) as const;

async function lire(dep: DependancesSource, voyage: VoyageARelire, demande: DemandeRelectures) {
  const regles = dep.regles;
  if (regles === null) return refus("unavailable");
  const { contexte } = voyage;
  const profil: ProfilForfait = voyage.portee === "voyage" ? "relectureVoyage" : "relecture";

  // Forfait du profil (fonction de la configuration seule), registre en mémoire et clients : construits avant toute
  // réservation, pour qu'une barrière fermée ne consomme rien.
  let clients: ClientsLecture;
  try {
    const forfait = forfaitDuProfil(regles.plafonds, regles.table, profil);
    const registre = creerRegistreForfait(forfait, null, dep.horloge);
    clients = dep.clients({
      usage: registre,
      contexte: () => ({ nature: "relecture", executionId: null, periodes: periodesDe("google", dep.horloge) }),
      plafonds: plafondsDuForfait(forfait),
      horloge: dep.horloge,
    });
  } catch {
    return refus("unavailable");
  }

  // Transaction 1 : réservation, validée avant le premier appel Google (sauf forfait en mémoire seulement, 0110 § 3).
  if (dep.reservation !== "memoire") {
    const reserve = await reserverForfait(
      dep.transaction(contexte),
      { organisationId: contexte.organizationId, tripId: contexte.tripId, generationRunId: null, profil },
      regles,
    );
    if (!reserve.ok) return refus(REFUS_QUOTA.has(reserve.code) ? "quota_reached" : "unavailable");
  }

  const { places, routes } = clients;
  const obtenuesA = dep.horloge.maintenant();
  let echecFiches: string | null = null;
  const noterEchec = (code: string) => {
    echecFiches ??= code;
  };

  // 1. Logements sans lieu (0100 § 6.2) : Text Search « IDs only » de chaque ville distincte.
  // Seules les nuits **référencées par la demande** se résolvent (0100 § 1.4 et § 6.2) : une nuit hors demande ne consomme
  // ni Text Search ni fiche de position du plafond du profil (le jour demandé ne passe pas en `travel_unknown` à cause d'elle).
  const sejours = voyage.sejoursParNuit;
  const nuitsDemandees = nuitsDeLaDemande(demande);
  const genres = sejours.map((sejour, i) => (nuitsDemandees.has(i) ? genreDe(sejour) : "aucun"));
  const placeIdDesVilles = new Map<string, string | null>();
  const villes = [...new Set(sejours.flatMap((sejour, i) => (genres[i] === "ville" ? [(sejour.ville as string).trim()] : [])))];
  for (const ville of villes) {
    const trouvee = await placeIdDeVille(ville, places);
    if (!trouvee.ok) {
      noterEchec(trouvee.code);
      break;
    }
    placeIdDesVilles.set(ville, trouvee.valeur);
  }

  // 2. Fiches de position (`id,location`) des logements pourvus d'un lieu et des villes résolues ; un lieu de la demande
  // reçoit sa position de sa fiche (masque `details`), sans appel de plus.
  const lieuxDemandes = new Set(demande.lieux.map((lieu) => lieu.placeId));
  const logements = new Set<string>();
  sejours.forEach((sejour, i) => {
    if (genres[i] === "lieu") logements.add(sejour.placeId as string);
  });
  const villesResolues = new Set<string>();
  for (const placeId of placeIdDesVilles.values()) if (placeId !== null) villesResolues.add(placeId);
  const positionsLues: IssuePosition[] = [];
  const aPositionner = [...new Set([...logements, ...villesResolues])].filter((placeId) => !lieuxDemandes.has(placeId));
  for (const placeId of aPositionner) {
    const lue = await chargerPosition(placeId, places);
    if (!lue.ok) {
      noterEchec(lue.code);
      break;
    }
    positionsLues.push(lue.valeur);
  }

  // 3. Fiches des lieux de la demande (masque `details`), une par `placeId` distinct, séquentielles (0085 § 5).
  let fiches: readonly IssueFiche[] = [];
  const detail = await chargerFiches(
    demande.lieux.map((lieu) => lieu.placeId),
    places,
  );
  if (detail.ok) fiches = detail.valeur;
  else noterEchec(detail.code);

  // 4. Trajets par couples (0100 § 1.5) : un élément par couple et par mode.
  const positions = new Map<string, Coordonnees>();
  for (const fiche of [...fiches, ...positionsLues]) if (fiche.issue === "chargee") positions.set(fiche.placeId, fiche.position);
  const pointDeNuit = (i: number): PointTrajet | null => {
    const sejour = sejours[i];
    const genre = genres[i];
    if (sejour === undefined || genre === undefined) return null;
    if (genre === "lieu") return pointLieu(sejour.placeId as string, positions);
    if (genre === "maison") {
      const centre = sejour.centre as Coordonnees;
      return { cleMaison: cleMaison(centre), centreMaison: { lat: centre.lat, lng: centre.lng } };
    }
    if (genre === "ville") {
      const placeId = placeIdDesVilles.get((sejour.ville as string).trim());
      return placeId === undefined || placeId === null ? null : pointLieu(placeId, positions);
    }
    return null;
  };
  const pointDe = (point: Point): PointTrajet | null => ("lieu" in point ? pointLieu(point.lieu, positions) : pointDeNuit(point.logement));
  const couples: CoupleTrajet[] = [];
  for (const trajet of demande.trajets) {
    const depuis = pointDe(trajet.depuis);
    const vers = pointDe(trajet.vers);
    if (depuis !== null && vers !== null) couples.push({ depuis, vers, modes: trajet.modes });
  }
  const trajets = couples.length === 0 ? null : await chargerTrajetsParCouples(couples, routes);

  // 5. Transaction 2 : positions fraîches des fiches de cette lecture, absentes du cache. Après les appels, quelle qu'en
  // soit l'issue. Sont écrites **toutes** les fiches de `demande.lieux` (étapes, événements, et aussi lieux des propositions
  // et des créneaux : 0100 § 3.1 point 2 (b), qui alimente le cache de toute fiche chargée, l'emporte sur la liste
  // du § 3.2 point 6, qui ne vise que ce qui s'ajoute) et les logements **demandés** pourvus d'un lieu ; jamais le centre
  // d'une ville qui n'est pas aussi un lieu de la demande (position de ville, § 6.2).
  const fraiches = positionsFraiches([...fiches, ...positionsLues.filter((position) => logements.has(position.placeId))]);
  await ecrirePositions(dep, contexte, fraiches, obtenuesA);

  if (echecFiches !== null) logEvent("voyages.fiches_non_relues", { reason: raisonFiches(echecFiches), tripId: contexte.tripId }, "warn");
  let table: TableTrajets = { duree: () => undefined };
  if (trajets !== null) {
    if (!trajets.ok) return refus(REFUS_QUOTA.has(trajets.code) ? "quota_reached" : "unavailable");
    table = trajets.valeur;
  }
  const cles = sejours.map((_, i) => {
    const point = pointDeNuit(i);
    return point === null ? null : "placeId" in point ? point.placeId : point.cleMaison;
  });
  return { ok: true, relectures: versRelectures({ usage: "lecture", fiches, trajets: table, logementsParNuit: cles }) } as const;
}

function pointLieu(placeId: string, positions: ReadonlyMap<string, Coordonnees>): PointTrajet {
  const position = positions.get(placeId);
  return position === undefined ? { placeId } : { placeId, position: { lat: position.lat, lng: position.lng } };
}

type RaisonPositions = "perimees" | "base" | "exception";

/** Échec du port des positions, porté jusqu'à la sortie de la transaction (qui l'annule) ; ne porte que le code fermé. */
class EchecPositions extends Error {
  readonly raison: RaisonPositions;
  constructor(code: CodeEchecPositions) {
    super("positions");
    this.name = "EchecPositions";
    this.raison = code === "perimees" || code === "base" ? code : "exception";
  }
}

/**
 * Écrit au cache les positions fraîches **absentes** du cache (0100 § 3.2 point 4) : `lire` d'abord, puis `ecrire` des
 * seules positions des fiches de cette lecture dont le `placeId` n'est pas vivant, par lots de `LOT_ECRITURE_POSITIONS`.
 * Une position rendue par `lire` n'est jamais réécrite (0060 § 1.3). Échec (`perimees`, `base`, exception) : la transaction
 * est annulée en entier, l'écriture abandonnée, la lecture continue ; aucune relance. Seul le code est journalisé
 * (`voyages.positions_non_ecrites`, `reason` fermée, 0060 § 1.3) : ni identifiant, ni position, ni message.
 */
async function ecrirePositions(
  dep: DependancesSource,
  contexte: VoyageARelire["contexte"],
  fraiches: ReadonlyMap<string, PositionGoogleFraiche>,
  obtenuesA: number,
): Promise<void> {
  if (fraiches.size === 0 || dep.positionsSuspendues()) return;
  try {
    await dep.transaction(contexte)(async (executeur) => {
      const ecrite = await ecrirePositionsAbsentes(executeur, fraiches, obtenuesA);
      if (!ecrite.ok) throw new EchecPositions(ecrite.code);
    });
  } catch (erreur) {
    logEvent("voyages.positions_non_ecrites", { reason: erreur instanceof EchecPositions ? erreur.raison : "exception" }, "warn");
  }
}

/**
 * Source réelle de relectures. `pour` rend toujours un résultat : une exception interne est lue comme `unavailable`
 * (0086 § 1.2 point 3), sans message ni pile.
 */
export function creerSourceRelectures(dep: DependancesSource): SourceRelectures {
  return {
    async pour(voyage, demande) {
      try {
        return await lire(dep, voyage, demande);
      } catch {
        return refus("unavailable");
      }
    },
  };
}
