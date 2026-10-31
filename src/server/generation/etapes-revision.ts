import "server-only";

import type { DayLineItemSnapshot, DaySnapshot, SegmentSnapshot, StopSnapshot, TripSnapshot } from "@/contracts";
import { arriveeAffichee } from "@/domain/changement-de-ville";
import type { ConfigurationMoteur } from "@/domain/configuration";
import type { TriDuRecalcul } from "@/domain/recalcul";
import { etapesVerrouilleesModifiees } from "@/domain/verrous";
import type { CapaciteProgramme, ExecuteurPublication, OptionsEtape } from "@/server/composition/generation";
import { RANG_LOT } from "@/server/config/generation";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { logEvent } from "@/server/log";
import { finDeLEtape, modeDeTrajet, tempsLibreEntre } from "@/server/programme/assemblage";
import { entreeProgrammeDepuisBrief, entreeProgrammeV5DepuisBrief } from "@/server/programme/entree";
import { entreeRevisionDepuisJours, nomsEcartesDesJours, retirerEtapesEcartees, type ChoixRevision } from "@/server/programme/revision";
import { verrouillerVersions } from "@/server/versions/ecrire";

import type { EtatBarriere } from "./barriere";
import type { DependancesResolues } from "./dependances";
import { briefAPlusieursVilles, compteursInitiaux, redigerEtVerifier, sql, voyageEtBriefSansRecit } from "./etapes-programme";
import { cibleDuForfait, forfaitDeLaRevision } from "./forfait-etape";
import { lireInstantane, lireVersion, type ExecuteurLecture } from "./lecture";
import { publier } from "./publication";
import { lireTriClos } from "./signaux";

/**
 * Révision de la chaîne inversée sur `api` (M1b, ticket 868 ; plan `docs/plans/mvp-etapes-1-9.md`, ligne M1b) : « Pas pour
 * moi » change le programme. La révision du site d'essai (décisions 0126 et 0142 : une requête `revision` sans donnée Google, filet du
 * code, vérification de toute la version, **une seule révision par voyage**, Q613) est portée sur l'exécution `batch` de B10b
 * (`deck_closures`), **à la place du moteur** (B5) quand la chaîne de l'app est `"inversee"` (0136 § 4.3 et § 4.4) : le pont
 * `src/workflows/recalcul.ts` et ses deux étapes ne changent pas, `etapes-lot.ts` passe ici le corps de chaque étape.
 *
 * - **`a`** (rang 1, sans appel) : choix du tri clos de la ligne (`choixDuTri` : « Pas pour moi » et « J'aime » des cases,
 *   identifiants d'étapes maison seulement ; **les catégories de repli ne sont jamais lues comme des préférences**, PO, 0136
 *   § 11 question 2), révision déjà consommée par une autre exécution `batch` du voyage (`SQL_REVISION_CONSOMMEE`), version
 *   courante différente de la version de base. Rien à réviser : la ligne finit `ready` sur sa version de base, sans forfait ni
 *   appel (la règle de 0136 § 4.4, inchangée pour ces cas). Sinon conversion du brief (`invalid_input`) et **réservation du
 *   forfait** du profil `revision` (décision 0142) sous l'identifiant de l'exécution (idempotente), comme la génération.
 * - **`e`** (rang 2, `maxRetries` 0) : mêmes relectures ; puis **le corps commun de l'étape « programme »**
 *   (`redigerEtVerifier`, `etapes-programme.ts`) : logements d'abord, **une** requête `revision` (entrée tirée des seuls
 *   textes de l'IA de la version de base et des choix, schéma strict, `zdr` ; prompt `revision` v3 sur le brief v5 sans
 *   récit pour un voyage à plusieurs villes, M4b), lecture tolérante, filet du code
 *   (`retirerEtapesEcartees`), vérification de toute la version sous la part et l'échéance, **aucun appel Routes**,
 *   assemblage par le module partagé `assemblerProgrammeIa` ; enfin la publication par le **module commun** `publier`
 *   (`publication.ts`, même rejeu borné, confirmation perdue comprise) : garde au rang, puis `ecrireSi` (verrou des versions,
 *   version courante relue : toujours la version de base, sinon rien n'est écrit), nouvelle version par le module unique
 *   (`author_kind = 'workflow'`, `request_id` de la ligne), positions (variante réelle seulement), fin `ready`, aucune case.
 *
 * **Étapes verrouillées (R3)** (spécification M5 § 3 et critère 2 ; décision 0147 § 9 ; revue de la PR 923, bloquant 1) : la
 * version révisée est contrôlée contre la version de base par la seule définition de R3 (`etapesVerrouilleesModifiees`,
 * `@/domain/verrous` : identifiant, nom, jour, heures, `placeId`). Si elle changeait une étape verrouillée, **rien n'est
 * écrit** (`ecrireSi` faux : la ligne finit `ready`, `last_version` nul, comme une version de base dépassée) ; sinon le
 * verrou des étapes gardées est reporté sur la version écrite (`verrousReportes`), que l'assemblage rend déverrouillées.
 *
 * **Lieux à soi** (M5d-1, ticket 939 ; décision 0147 § 12 S4) : une étape ajoutée par la personne (`addedBy: "person"`)
 * n'entre jamais dans la requête `revision` (`etapesPourLeModele`) ; elle est **réinjectée** de la version de base dans la
 * version révisée avant R3 (`lieuxASoiReinjectes` : nom, jour, heures, `placeId` et verrou inchangés), si bien que R3 la voit
 * gardée et que la révision s'écrit. Depuis M5d-4 (décision 0155 § 2, Q765), la réinjection réécrit aussi, sans aucun appel
 * (ni Places, ni Routes), un segment de chaque côté du lieu (mode `modeDeTrajet(brief)`, durée mesurée par la lecture suivante)
 * et le « Temps libre » autour de lui (règle `tempsLibreEntre` de l'assemblage) ; chaque jour réinjecté est contrôlé par
 * `ligneDuJourCoherente` (rejouée avec R3 seule : R1, R2 et R4 à R9 ne le sont pas), et un jour incohérent fait que rien
 * n'est écrit, comme R3. Le passage est compté au journal par `recalcul.lieux_a_soi` (compteurs seulement). Le voyage
 * complet (M1c) ne la touche pas : il ne remplace qu'un jour sans étape, et l'ajout est refusé (`generation_in_progress`)
 * tant qu'une exécution `full` ou `batch` du voyage est ouverte.
 *
 * Ce que la révision ne réécrit pas (choix conservateurs, décrits dans la PR) : les cases de l'aperçu (`proposals`) et
 * `stays.place_id` (écrits par la génération). Les lignes « À faire » suivent la version (décision 0147 § 7.2, qui amende 0142
 * § 4 : M5-PO-15) : `ecrireVersion` reçoit la version de base en `instantanePrecedent` et, dans la même transaction, retire
 * les lignes non faites des étapes écartées, délie leurs lignes faites et ajoute une ligne `reservation` par étape
 * `toReserve` nouvelle ; une ligne cochée n'est jamais retirée ni décochée. Le récit n'est
 * jamais lu ni envoyé (`voyageEtBriefSansRecit`). Aucun journal propre, sauf `recalcul.lieux_a_soi` (compteurs des lieux à soi
 * réinjectés, 0155 § 2.4) : l'arrêt est connu par `generation_runs.stop_reason`.
 * État sérialisé inchangé (`EtatLotSchema`) : aucun choix, aucun nom ni `placeId` n'y entre.
 */

/** Exécution `batch` ouverte par la garde du lot (champs de `ContexteLot`, `etapes-lot.ts`). */
export type ContexteRevision = {
  readonly dep: DependancesResolues;
  readonly organizationId: string;
  readonly generationRunId: string;
  readonly tripId: string;
  readonly baseVersion: number;
  readonly clotureId: string;
  readonly requestId: string;
  readonly echeance: number;
  readonly rang: number;
  readonly barriere: EtatBarriere;
};

/** Fin `ready` de la ligne `batch` au rang de l'étape (`SQL_FIN_LOT`), `last_version` posée si `version` ; levée sinon. */
export type FinDuLot = (x: ExecuteurLecture, version: number | null) => Promise<void>;

/**
 * Une seule révision par voyage (0126 § 2, Q613), **sans migration** : la révision est consommée dès qu'une **autre** exécution
 * `batch` du voyage a commencé son étape `e` (`step_seq` au moins `RANG_LOT.e`), qu'elle ait écrit une version, se soit arrêtée
 * ou ait expiré (comme le site d'essai : une révision arrêtée consomme la seule révision du voyage).
 *
 * **Lecture sans verrou** (revue de la PR 875, mineur 6 ; décision 0142 § 5) : deux lignes `batch` du même voyage qui
 * passeraient `e` en même temps pourraient chacune ne pas voir l'autre. Le verrou des versions de la publication et la relecture
 * de la version de base sous ce verrou (`ecrireSi`) empêchent la seconde d'écrire sur une version qui n'est plus la base, mais
 * elle aurait déjà consommé sa requête de modèle. Verrou à poser par M1h (deux recalculs du même voyage).
 */
export const SQL_REVISION_CONSOMMEE = `SELECT 1 AS prise FROM public.generation_runs
  WHERE organization_id = $1 AND trip_id = $2 AND kind = 'batch' AND id <> $3 AND step_seq >= $4 LIMIT 1`;

async function revisionConsommee(x: ExecuteurLecture, contexte: ContexteRevision): Promise<boolean> {
  return (await x.query(SQL_REVISION_CONSOMMEE, [contexte.organizationId, contexte.tripId, contexte.generationRunId, RANG_LOT.e])).rows.length > 0;
}

/**
 * Choix de la révision depuis le tri clos (fonction pure) : étapes de la version de base dont la case porte un « Pas pour moi »
 * actif (`pasPourMoi`) ou un « J'aime » actif (`jAime`, hors étapes écartées). Ni une catégorie (de repli sur la chaîne
 * inversée), ni une réponse à une question, ni « Je choisis », « Option suivante » ou la réduction de trajet ne sont lus ;
 * une étape verrouillée ou un engagement n'est jamais écarté (B10-PO-9). Identifiants maison seulement, dans l'ordre du tri.
 */
export function choixDuTri(tri: TriDuRecalcul, base: TripSnapshot): ChoixRevision {
  const etapes = new Map(base.days.flatMap((jour) => jour.items.flatMap((ligne) => (ligne.type === "stop" ? [[ligne.stop.id, ligne.stop] as const] : []))));
  const etapeDe = (proposalId: string | undefined) => {
    const stopId = tri.propositions.find((proposition) => proposition.id === proposalId)?.stopId;
    return stopId === undefined ? undefined : etapes.get(stopId);
  };
  const pasPourMoi: string[] = [];
  const jAime: string[] = [];
  for (const signal of tri.signaux) {
    if (signal.status === "cancelled" || (signal.signal !== "dislike" && signal.signal !== "like")) continue;
    const etape = etapeDe(signal.proposalId);
    if (etape === undefined) continue;
    if (signal.signal === "dislike" && !etape.locked && etape.commitment === undefined && !pasPourMoi.includes(etape.id)) pasPourMoi.push(etape.id);
    if (signal.signal === "like" && !jAime.includes(etape.id)) jAime.push(etape.id);
  }
  return { pasPourMoi, jAime: jAime.filter((id) => !pasPourMoi.includes(id)) };
}

/**
 * R3 sur la version révisée (fonction pure) : `null` si une étape verrouillée de la base y est changée ou absente (écriture
 * refusée en entier) ; sinon la version révisée, le verrou des étapes verrouillées de la base reporté sur elles (mêmes
 * identifiant, nom, jour, heures et `placeId`, garantis par R3), rien d'autre changé.
 */
export function verrousReportes(base: TripSnapshot, revisee: TripSnapshot): TripSnapshot | null {
  if (etapesVerrouilleesModifiees(base.days, revisee.days).length > 0) return null;
  const verrouillees = new Set(base.days.flatMap((jour) => jour.items.flatMap((ligne) => (ligne.type === "stop" && ligne.stop.locked ? [ligne.stop.id] : []))));
  if (verrouillees.size === 0) return revisee;
  return {
    ...revisee,
    days: revisee.days.map((jour) => ({
      ...jour,
      items: jour.items.map((ligne) => (ligne.type === "stop" && verrouillees.has(ligne.stop.id) ? { ...ligne, stop: { ...ligne.stop, locked: true } } : ligne)),
    })),
  };
}

const minutes = (heure: string): number => Number(heure.slice(0, 2)) * 60 + Number(heure.slice(3, 5));

/** Intervalle `[début, fin)` d'une ligne datée de la journée, ou `null` (terminus, trajet, changement de ville). */
function intervalle(ligne: DayLineItemSnapshot): readonly [number, number] | null {
  if (ligne.type === "stop") return [minutes(ligne.stop.start), minutes(ligne.stop.end ?? ligne.stop.start)];
  if (ligne.type === "free") return [minutes(ligne.from), minutes(ligne.to)];
  if (ligne.type === "openMeal") return [minutes(ligne.time), minutes(ligne.time) + 1];
  return null;
}

/**
 * Règles de la réinjection (décision 0155 § 2) : `mode`, celui de tous les segments du jour écrit par l'IA
 * (`modeDeTrajet(brief)`, `src/server/programme/assemblage.ts`) ; `configuration`, seuil du « Temps libre » et durées par
 * défaut (fin occupée d'une étape sans heure de fin), celles du moteur.
 */
export type ReglesReinjection = {
  readonly mode: SegmentSnapshot["mode"];
  readonly configuration: Pick<ConfigurationMoteur, "seuilTempsLibreMinutes" | "dureesParDefaut">;
};

/** Résultat de la réinjection : la version, les compteurs du journal (0155 § 2.4) et la cohérence des jours réinjectés. */
export type Reinjection = {
  readonly instantane: TripSnapshot;
  /** Lieux à soi réinjectés (absents de la révision, remis à leur heure). */
  readonly places: number;
  /** Étapes de l'IA retirées parce qu'elles chevauchaient un lieu réinjecté (ni temps libre, ni repas ouvert). */
  readonly stopsRemoved: number;
  /** Chaque jour réinjecté tient la cohérence de la ligne du jour (`ligneDuJourCoherente`, 0155 § 2.3). */
  readonly coherente: boolean;
};

/** Début d'une ligne datée (étape, temps libre, repas ouvert, changement de ville), en minutes ; `undefined` sinon. */
function debutDate(ligne: DayLineItemSnapshot): string | undefined {
  if (ligne.type === "stop") return ligne.stop.start;
  if (ligne.type === "free") return ligne.from;
  if (ligne.type === "openMeal") return ligne.time;
  if (ligne.type === "transfer") return ligne.start;
  return undefined;
}

/**
 * Fin **occupée** d'une ligne datée, en minutes (0155 § 2.2, règle de l'assemblage) ; `undefined` après un changement de
 * ville à l'arrivée « à confirmer » (l'assemblage n'écrit alors aucun « Temps libre » après lui). Étape avec heure de fin :
 * `finDeLEtape` ; sans heure de fin : sa durée (`facts.durationMinutes`), sinon la plus longue durée par défaut de sa sorte
 * (l'instantané ne garde pas la nature du créneau : un repas occupe `max(lunch, dinner)`, une activité
 * `max(activity, evening)`), si bien qu'un « Temps libre » ne recouvre jamais une occupation.
 */
function finOccupee(ligne: DayLineItemSnapshot, configuration: ReglesReinjection["configuration"]): number | undefined {
  const durees = configuration.dureesParDefaut;
  switch (ligne.type) {
    case "stop": {
      const { start, end, facts, kind } = ligne.stop;
      const fin = finDeLEtape(start, end);
      if (fin !== undefined) return minutes(fin);
      if (end !== undefined) return minutes(start);
      return minutes(start) + (facts.durationMinutes ?? (kind === "meal" ? Math.max(durees.lunch, durees.dinner) : Math.max(durees.activity, durees.evening)));
    }
    case "free":
      return minutes(ligne.to);
    case "openMeal":
      return minutes(ligne.time) + durees[ligne.meal];
    case "transfer":
      return arriveeAffichee(ligne);
    default:
      return undefined;
  }
}

/**
 * Zone du lieu réinjecté (revue de la PR 980, bloquants 1 et 2) : identifiants des lieux réinjectés du jour et intervalles
 * `[début, fin)` des lignes retirées parce qu'elles les chevauchaient. Seuls les intervalles qui la touchent reçoivent un
 * « Temps libre », et seules les paires qui contiennent un lieu réinjecté sont contrôlées en ordre et en chevauchement : le
 * reste du jour est celui que l'IA a écrit (la chaîne inversée ne rejoue ni R2 ni R8 sur lui).
 */
export type ZoneDuLieu = {
  readonly reinjectees: ReadonlySet<string>;
  readonly liberes: readonly (readonly [number, number])[];
};

const estReinjectee = (ligne: DayLineItemSnapshot | undefined, zone: ZoneDuLieu): boolean => ligne?.type === "stop" && zone.reinjectees.has(ligne.stop.id);

/**
 * « Temps libre » réécrit (0155 § 2.2, borné par la revue de la PR 980, bloquant 1 ; amendement de § 2.2 par le Tech Lead,
 * décision 0156) : entre la fin occupée des lignes datées déjà lues (la plus tardive) et le début de la ligne datée suivante,
 * un « Temps libre » par la règle de l'assemblage (`tempsLibreEntre`), **seulement** si une borne de l'intervalle est un lieu
 * réinjecté ou s'il recouvre une ligne retirée (`zone`) ; ailleurs, un écart brut entre deux lignes de l'IA (trajet et marge
 * compris) n'est jamais un trou. Posé juste après la dernière ligne datée (avant un trajet, comme l'assemblage) ; collé à un
 * temps libre qui finit à son début, il le prolonge.
 */
function avecTempsLibre(items: readonly DayLineItemSnapshot[], configuration: ReglesReinjection["configuration"], zone: ZoneDuLieu): DayLineItemSnapshot[] {
  const sortie: DayLineItemSnapshot[] = [];
  let occupee: number | undefined;
  let derniereDatee = -1;
  for (const ligne of items) {
    const debut = debutDate(ligne);
    if (debut !== undefined && occupee !== undefined) {
      const [de, a] = [occupee, minutes(debut)];
      const touche =
        estReinjectee(sortie[derniereDatee], zone) || estReinjectee(ligne, zone) || zone.liberes.some(([r0, r1]) => de < r1 && r0 < a);
      const libre = touche ? tempsLibreEntre(occupee, debut, configuration.seuilTempsLibreMinutes) : undefined;
      const precedente = sortie[derniereDatee];
      if (libre !== undefined && precedente?.type === "free" && precedente.to === libre.from) sortie[derniereDatee] = { ...precedente, to: libre.to };
      else if (libre !== undefined) sortie.splice((derniereDatee += 1), 0, libre);
    }
    sortie.push(ligne);
    if (debut === undefined) continue;
    derniereDatee = sortie.length - 1;
    const fin = finOccupee(ligne, configuration);
    occupee = ligne.type === "transfer" || fin === undefined ? fin : Math.max(occupee ?? fin, fin);
  }
  return sortie;
}

/** Point de trajet de la ligne du jour : étape à `placeId`, ou terminus (logement du début ou de la fin du jour). */
const estPoint = (ligne: DayLineItemSnapshot): boolean => ligne.type === "terminus" || (ligne.type === "stop" && ligne.stop.placeId !== undefined);

/**
 * Segments du lieu réinjecté (0155 § 2.1) : tout segment entre lui et son point voisin, de chaque côté, est retiré ; puis
 * **exactement un** segment au mode `mode` (`estimated: false`, sans durée : la lecture suivante la mesure pour le couple réel)
 * est posé juste avant le point le plus tardif du couple, comme l'assemblage. Aucun segment à travers un changement de ville
 * (0148 § 1 point 3, 0151 § 4) ni hors de la ligne (jour sans terminus) ; aucun vers ni depuis une étape sans `placeId`.
 */
function avecSegmentsDuLieu(items: readonly DayLineItemSnapshot[], stopId: string, mode: SegmentSnapshot["mode"]): DayLineItemSnapshot[] {
  const rang = items.findIndex((ligne) => ligne.type === "stop" && ligne.stop.id === stopId);
  const lieu = items[rang];
  if (lieu?.type !== "stop" || lieu.stop.placeId === undefined) return [...items];
  const borne = (ligne: DayLineItemSnapshot) => estPoint(ligne) || ligne.type === "transfer";
  let avant = rang - 1;
  while (avant >= 0 && !borne(items[avant]!)) avant -= 1;
  let apres = rang + 1;
  while (apres < items.length && !borne(items[apres]!)) apres += 1;
  const segment: DayLineItemSnapshot = { type: "segment", segment: { mode, estimated: false } };
  const sansSegment = (lignes: readonly DayLineItemSnapshot[]) => lignes.filter((ligne) => ligne.type !== "segment");
  const pointAvant = avant >= 0 && estPoint(items[avant]!);
  const pointApres = apres < items.length && estPoint(items[apres]!);
  return [
    ...items.slice(0, avant + 1),
    ...sansSegment(items.slice(avant + 1, rang)),
    ...(pointAvant ? [segment] : []),
    lieu,
    ...sansSegment(items.slice(rang + 1, apres)),
    ...(pointApres ? [segment] : []),
    ...items.slice(apres),
  ];
}

/**
 * Cohérence de la ligne d'un jour réinjecté (fonction pure ; décision 0155 § 2.3), rejouée avec R3 seule (R1, R2 et R4 à R9
 * ne le sont pas). **Sur tout le jour** (structure) : terminus de début en tête et de fin en queue quand le jour en a, au plus
 * un segment entre deux points, aucun segment à travers un changement de ville. **Dans la zone du lieu** (`zone` ; revue de
 * la PR 980, bloquants 1 et 2) : chaque lieu réinjecté dans l'ordre des lignes datées et sans chevauchement avec aucune
 * (sauf entre deux étapes verrouillées dans la base, B5-PO-6), et aucun trou au sens de 0155 § 2.2 (écart d'au moins
 * `seuilTempsLibreMinutes` entre la fin occupée des lignes datées lues et la suivante) sur un intervalle qui touche la zone.
 * Un chevauchement ou un écart entre deux lignes de l'IA sans rapport avec le lieu n'est pas contrôlé. Faux : la version
 * entière n'est pas écrite (`ecritureRevision`).
 */
export function ligneDuJourCoherente(
  jour: Pick<DaySnapshot, "items">,
  verrouilleesDansLaBase: ReadonlySet<string>,
  configuration: ReglesReinjection["configuration"],
  zone: ZoneDuLieu,
): boolean {
  const { items } = jour;
  // Terminus à leur place.
  for (const [rang, ligne] of items.entries()) {
    if (ligne.type !== "terminus") continue;
    if (ligne.role === "start" && rang !== 0) return false;
    if (ligne.role === "end" && rang !== items.length - 1) return false;
  }
  // Au plus un segment entre deux points, aucun à travers un changement de ville.
  let segments = 0;
  let apresChangement = false;
  for (const ligne of items) {
    if (ligne.type === "segment") {
      segments += 1;
      if (segments > 1 || apresChangement) return false;
    } else if (ligne.type === "transfer") {
      if (segments > 0) return false;
      apresChangement = true;
    } else if (estPoint(ligne)) {
      segments = 0;
      apresChangement = false;
    }
  }
  // Ordre et chevauchements : paires qui contiennent un lieu réinjecté seulement.
  const datees = items.filter((ligne) => debutDate(ligne) !== undefined);
  const verrouillee = (l: DayLineItemSnapshot) => l.type === "stop" && verrouilleesDansLaBase.has(l.stop.id);
  for (const [rang, lieu] of datees.entries()) {
    if (!estReinjectee(lieu, zone)) continue;
    const debutLieu = minutes(debutDate(lieu)!);
    const lu = intervalle(lieu)!;
    for (const [autreRang, autre] of datees.entries()) {
      if (autreRang === rang) continue;
      const debutAutre = minutes(debutDate(autre)!);
      if (autreRang < rang ? debutAutre > debutLieu : debutAutre < debutLieu) return false;
      const deja = intervalle(autre);
      if (deja === null || !(deja[0] < lu[1] && lu[0] < deja[1])) continue;
      if (!(verrouillee(lieu) && verrouillee(autre))) return false;
    }
  }
  // Aucun trou dans la zone du lieu : la règle du temps libre n'y ajoute ni ne prolonge rien.
  const refaite = avecTempsLibre(items, configuration, zone);
  return refaite.length === items.length && refaite.every((ligne, rang) => ligne === items[rang]);
}

/**
 * Lieux à soi réinjectés (fonction pure, **sans appel** ; M5d-1, décision 0147 § 12 S4 et addendum A.6 ; M5d-4, décision
 * 0155 § 2) : chaque étape `addedBy: "person"` de la version de base est remise, **telle quelle** (identifiant, nom, jour,
 * heures, `placeId`, verrou), dans le même jour de la version révisée, à son heure (avant la première ligne datée qui
 * commence après elle, sinon avant le terminus de fin). Les lignes de la révision qui la chevauchent sont retirées : étapes,
 * temps libres et repas ouverts ; une étape **verrouillée dans la base** (verrou lu dans `base`, l'assemblage rendant les
 * lignes de la révision déverrouillées) n'est jamais retirée (R3 les compare ensuite). Puis, dans chaque jour réinjecté :
 * - **segments** (§ 2.1, `avecSegmentsDuLieu`) : exactement un entre le lieu et chaque point voisin, au mode `regles.mode` ;
 *   aucune durée n'est écrite (l'instantané n'en porte pas) : la lecture suivante (B8b) la mesure pour le couple réel
 *   (`pointsDesSegments`), `travel_unknown` sinon, jamais une durée d'un autre couple ; deux segments voisins n'en font qu'un ;
 * - **temps libre** (§ 2.2, `avecTempsLibre`) : tout intervalle vide d'au moins le seuil **dans la zone du lieu** (une borne
 *   est le lieu, ou l'intervalle recouvre une ligne retirée) reçoit un « Temps libre » par la règle de l'assemblage
 *   (`tempsLibreEntre`), si bien qu'un temps libre coupé par le lieu donne ses parts qui l'atteignent ; ailleurs, rien ;
 * - **cohérence** (§ 2.3, `ligneDuJourCoherente`), lue par `ecritureRevision`.
 * Un jour absent de la révision, ou un lieu déjà présent (même identifiant), est laissé tel quel ; sans lieu à soi réinjecté,
 * la version révisée est rendue telle quelle (même objet). Aucune trace propre à la personne : seuls les compteurs `places`
 * et `stopsRemoved` sortent, pour le journal (`recalcul.lieux_a_soi`, § 2.4).
 */
export function reinjecterLieuxASoi(base: TripSnapshot, revisee: TripSnapshot, regles: ReglesReinjection): Reinjection {
  const parJour = new Map<number, StopSnapshot[]>();
  const verrouilleesDansLaBase = new Set<string>();
  for (const jour of base.days) {
    for (const ligne of jour.items) {
      if (ligne.type !== "stop") continue;
      if (ligne.stop.locked) verrouilleesDansLaBase.add(ligne.stop.id);
      if (ligne.stop.addedBy === "person") parJour.set(jour.index, [...(parJour.get(jour.index) ?? []), ligne.stop]);
    }
  }
  const inchangee: Reinjection = { instantane: revisee, places: 0, stopsRemoved: 0, coherente: true };
  if (parJour.size === 0) return inchangee;
  let places = 0;
  let stopsRemoved = 0;
  let coherente = true;
  const days = revisee.days.map((jour) => {
    const presents = new Set(jour.items.flatMap((ligne) => (ligne.type === "stop" ? [ligne.stop.id] : [])));
    const aPoser = (parJour.get(jour.index) ?? []).filter((stop) => !presents.has(stop.id));
    if (aPoser.length === 0) return jour;
    const chevauche = (ligne: DayLineItemSnapshot) => {
      if (ligne.type === "stop" && verrouilleesDansLaBase.has(ligne.stop.id)) return false;
      const lu = intervalle(ligne);
      if (lu === null) return false;
      return aPoser.some((stop) => {
        const [debut, fin] = [minutes(stop.start), minutes(stop.end ?? stop.start)];
        return lu[0] < Math.max(fin, debut + 1) && debut < lu[1];
      });
    };
    places += aPoser.length;
    // Un seul passage : lignes gardées, étapes retirées comptées, intervalles libérés (zone du lieu).
    let items: DayLineItemSnapshot[] = [];
    const liberes: (readonly [number, number])[] = [];
    for (const ligne of jour.items) {
      if (!chevauche(ligne)) {
        items.push(ligne);
        continue;
      }
      if (ligne.type === "stop") stopsRemoved += 1;
      const [debut, fin] = intervalle(ligne)!;
      liberes.push([debut, Math.max(fin, debut + 1)]);
    }
    const zone: ZoneDuLieu = { reinjectees: new Set(aPoser.map((stop) => stop.id)), liberes };
    const poses = [...aPoser].sort((x, y) => minutes(x.start) - minutes(y.start));
    for (const stop of poses) {
      const rang = items.findIndex((ligne) => {
        const debut = debutDate(ligne);
        return (debut !== undefined && minutes(debut) > minutes(stop.start)) || (ligne.type === "terminus" && ligne.role === "end");
      });
      items.splice(rang === -1 ? items.length : rang, 0, { type: "stop", stop });
    }
    for (const stop of poses) items = avecSegmentsDuLieu(items, stop.id, regles.mode);
    items = items.filter((ligne, i) => !(ligne.type === "segment" && items[i - 1]?.type === "segment"));
    items = avecTempsLibre(items, regles.configuration, zone);
    if (!ligneDuJourCoherente({ items }, verrouilleesDansLaBase, regles.configuration, zone)) coherente = false;
    return { ...jour, items };
  });
  return places === 0 ? inchangee : { instantane: { ...revisee, days }, places, stopsRemoved, coherente };
}

/**
 * Version réinjectée seule (`reinjecterLieuxASoi`, voir son en-tête). Plus d'appelant de production depuis M5d-4
 * (`ecritureRevision` passe par `versionDeLaRevision`) : gardée pour les tests, qui construisent avec elle une version de base
 * ou lisent la seule version réinjectée (`tests/unit/programme/revision.test.ts`, `tests/db/lieu-a-soi.test.ts`).
 */
export function lieuxASoiReinjectes(base: TripSnapshot, revisee: TripSnapshot, regles: ReglesReinjection): TripSnapshot {
  return reinjecterLieuxASoi(base, revisee, regles).instantane;
}

/**
 * Version que la révision écrit (fonction pure ; 0147 A.6, 0155 § 2.3) : réinjection des lieux à soi, cohérence des jours
 * réinjectés, puis R3 (`verrousReportes`). `tenue` nulle : rien n'est écrit (`ecrireSi` faux). `publiee` : la version tenue,
 * sinon la version réinjectée (positions). Compteurs pour `recalcul.lieux_a_soi`.
 */
export function versionDeLaRevision(
  base: TripSnapshot,
  instantane: TripSnapshot,
  regles: ReglesReinjection,
): { readonly tenue: TripSnapshot | null; readonly publiee: TripSnapshot; readonly places: number; readonly stopsRemoved: number } {
  const reinjection = reinjecterLieuxASoi(base, instantane, regles);
  const tenue = reinjection.coherente ? verrousReportes(base, reinjection.instantane) : null;
  return { tenue, publiee: tenue ?? reinjection.instantane, places: reinjection.places, stopsRemoved: reinjection.stopsRemoved };
}

/**
 * Trace des lieux à soi réinjectés (décision 0155 § 2.4) : `recalcul.lieux_a_soi`, niveau `info`, une fois par passage de
 * l'étape `e` qui réinjecte au moins un lieu, après `verrousReportes`, par `ecritureRevision` seule. **Compteurs seulement**
 * (`places`, `stopsRemoved`) ; le compte peut inclure un passage dont la publication n'écrit rien (R3, cohérence, version
 * dépassée), et un rejeu du lot peut compter deux fois le même lieu (revue de la PR 980, mineur 7 de la Sécurité) : biais de
 * mesure seulement, aucune donnée de la personne. Aucun lieu réinjecté : rien n'est écrit.
 */
export function journaliserReinjection(compteurs: { readonly places: number; readonly stopsRemoved: number }): void {
  if (compteurs.places === 0) return;
  logEvent("recalcul.lieux_a_soi", { places: compteurs.places, stopsRemoved: compteurs.stopsRemoved });
}

type Lus = { readonly base: TripSnapshot; readonly choix: ChoixRevision };

/** Relectures communes à `a` et `e`, dans une transaction ; `null` : rien à réviser (voir l'en-tête). */
async function lireRevision(x: ExecuteurLecture, contexte: ContexteRevision): Promise<Lus | null> {
  if (await revisionConsommee(x, contexte)) return null;
  const derniere = await lireInstantane(x, contexte.organizationId, contexte.tripId);
  if (derniere.version !== contexte.baseVersion) return null;
  const base = await lireVersion(x, contexte.organizationId, contexte.tripId, contexte.baseVersion);
  const choix = choixDuTri(await lireTriClos(x, contexte.organizationId, contexte.tripId, contexte.clotureId), base.instantane);
  return choix.pasPourMoi.length === 0 ? null : { base: base.instantane, choix };
}

/** Étape `a` de la révision : rien à réviser, ligne finie sur sa version de base ; sinon brief converti et forfait réservé. */
export async function debutRevision(contexte: ContexteRevision, fin: FinDuLot): Promise<"finie" | void> {
  const lus = await sql(contexte, async (x) => {
    const revision = await lireRevision(x, contexte);
    if (revision !== null) await voyageEtBriefSansRecit(x, contexte.organizationId, contexte.tripId);
    return revision;
  });
  if (lus === null) {
    await sql(contexte, (x) => fin(x, contexte.baseVersion));
    return "finie";
  }
  await forfaitDeLaRevision(contexte.dep, cibleDuForfait(contexte));
}

/** Étape `e` de la révision : voir l'en-tête. */
export async function ecritureRevision(contexte: ContexteRevision, fin: FinDuLot): Promise<void> {
  const lus = await sql(contexte, async (x) => {
    const revision = await lireRevision(x, contexte);
    return revision === null ? null : { ...revision, ...(await voyageEtBriefSansRecit(x, contexte.organizationId, contexte.tripId)) };
  });
  if (lus === null) {
    await sql(contexte, (x) => fin(x, null));
    return;
  }
  const { base, choix, voyage, brief } = lus;
  const { forfait, registre, plafonds } = await forfaitDeLaRevision(contexte.dep, cibleDuForfait(contexte));
  const options: OptionsEtape = { usage: registre, plafonds, executionId: contexte.generationRunId, forfait, horloge: contexte.dep.horloge, echeance: contexte.echeance };
  const fabrique = await contexte.dep.composer(contexte.barriere, { destination: voyage.draft.destination });
  const capacite = fabrique.programme(options);
  // Entrée de la requête `revision` : textes de l'IA de la version de base et choix (identifiants maison), jamais une donnée Google.
  // Plusieurs villes (prédicat unique `briefAPlusieursVilles`) : prompt `revision` v3, brief v5 **sans récit** (villes,
  // logements par ville, changements sans libellé de billet : `billets` n'est jamais lu) ; la durée estimée d'un changement
  // de ville vient de la sortie v3. Une ville : prompt `revision` v2, entrée v4, inchangée.
  const sejour = { arrivee: brief.arrivee, depart: brief.depart };
  const reviser = briefAPlusieursVilles(brief)
    ? (() => {
        const entree = entreeRevisionDepuisJours(base.days, entreeProgrammeV5DepuisBrief(brief, { recit: false }), choix);
        const noms = nomsEcartesDesJours(base.days, entree.choix.pasPourMoi);
        return (c: CapaciteProgramme) => c.reviserV3(entree, sejour, (programme) => retirerEtapesEcartees(programme, noms));
      })()
    : (() => {
        const entree = entreeRevisionDepuisJours(base.days, entreeProgrammeDepuisBrief(brief), choix);
        const noms = nomsEcartesDesJours(base.days, entree.choix.pasPourMoi);
        return (c: CapaciteProgramme) => c.reviser(entree, sejour, (programme) => retirerEtapesEcartees(programme, noms));
      })();
  const { instantane, verifies, obtenuesA } = await redigerEtVerifier(contexte, { brief, capacite, forfait, registre, compteurs: compteursInitiaux() }, reviser);
  // Lieux à soi de la base réinjectés (segments, temps libre, cohérence du jour : 0155 § 2), puis R3 : une version qui
  // changerait une étape verrouillée, ou dont un jour réinjecté serait incohérent, n'est pas écrite. Trace à compteurs seulement.
  const { tenue, publiee, places, stopsRemoved } = versionDeLaRevision(base, instantane, { mode: modeDeTrajet(brief), configuration: CONFIGURATION_MOTEUR });
  journaliserReinjection({ places, stopsRemoved });
  // Positions écrites : celles des lieux de la version **publiée** (lieux à soi compris ; seules les fiches lues par cette
  // révision ont une position en mémoire, `PositionsDeLEtape`), jamais d'une étape retirée par la réinjection.
  const publies = new Set(publiee.days.flatMap((jour) => jour.items.flatMap((item) => (item.type === "stop" && item.stop.placeId !== undefined ? [item.stop.placeId] : []))));
  const ecrirePositions = contexte.dep.ecriturePositions(fabrique)
    ? (executeur: ExecuteurPublication) => verifies.positions.ecrire(executeur, publies, obtenuesA, contexte.dep.portPositions)
    : undefined;
  // Publication par le module commun (`publier`, même rejeu borné, confirmation perdue comprise) ; `ecrireSi` : sous la garde,
  // verrou des versions (sérialise avec le workflow 4 et les modifications de la personne) et version courante relue : si ce
  // n'est plus la version de base, **rien n'est écrit** et la ligne finit `ready`, `last_version` nul. Aucune case réécrite.
  const { organizationId, generationRunId, tripId } = contexte;
  await publier(
    contexte.dep,
    { organizationId, generationRunId, tripId, requestId: contexte.requestId, echeance: contexte.echeance, rang: contexte.rang },
    {
      instantane: publiee,
      // Version remplacée : la version de base, seule version courante admise par `ecrireSi` (relue sous le verrou).
      instantanePrecedent: base,
      cases: [],
      statut: "ready",
      ...(ecrirePositions === undefined ? {} : { ecrirePositions }),
      ecrireSi: async (x) => {
        await verrouillerVersions(x, tripId);
        return tenue !== null && (await lireInstantane(x, organizationId, tripId)).version === contexte.baseVersion;
      },
    },
  );
}
