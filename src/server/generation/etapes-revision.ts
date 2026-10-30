import "server-only";

import type { DayLineItemSnapshot, StopSnapshot, TripSnapshot } from "@/contracts";
import type { TriDuRecalcul } from "@/domain/recalcul";
import { etapesVerrouilleesModifiees } from "@/domain/verrous";
import type { CapaciteProgramme, ExecuteurPublication, OptionsEtape } from "@/server/composition/generation";
import { RANG_LOT } from "@/server/config/generation";
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
 * gardée et que la révision s'écrit. Le voyage complet (M1c) ne la touche pas : il ne remplace qu'un jour sans étape, et
 * l'ajout est refusé (`generation_in_progress`) tant qu'une exécution `full` ou `batch` du voyage est ouverte.
 *
 * Ce que la révision ne réécrit pas (choix conservateurs, décrits dans la PR) : les cases de l'aperçu (`proposals`) et
 * `stays.place_id` (écrits par la génération). Les lignes « À faire » suivent la version (décision 0147 § 7.2, qui amende 0142
 * § 4 : M5-PO-15) : `ecrireVersion` reçoit la version de base en `instantanePrecedent` et, dans la même transaction, retire
 * les lignes non faites des étapes écartées, délie leurs lignes faites et ajoute une ligne `reservation` par étape
 * `toReserve` nouvelle ; une ligne cochée n'est jamais retirée ni décochée. Le récit n'est
 * jamais lu ni envoyé (`voyageEtBriefSansRecit`). Aucun journal propre : l'arrêt est connu par `generation_runs.stop_reason`.
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
 * Lieux à soi réinjectés (fonction pure ; M5d-1, décision 0147 § 12 S4) : chaque étape `addedBy: "person"` de la version de
 * base est remise, **telle quelle** (identifiant, nom, jour, heures, `placeId`, verrou), dans le même jour de la version
 * révisée, à son heure (avant la première étape qui commence après elle, sinon avant le terminus de fin). Les lignes de la
 * révision qui la chevauchent sont retirées : étapes non verrouillées, temps libres et repas ouverts ; une étape verrouillée
 * de la base n'est jamais retirée (la base les tenait déjà sans chevauchement). Deux trajets devenus voisins n'en font
 * qu'un. Un jour absent de la révision, ou un lieu déjà présent (même identifiant), est laissé tel quel.
 */
export function lieuxASoiReinjectes(base: TripSnapshot, revisee: TripSnapshot): TripSnapshot {
  const parJour = new Map<number, StopSnapshot[]>();
  for (const jour of base.days) {
    for (const ligne of jour.items) {
      if (ligne.type === "stop" && ligne.stop.addedBy === "person") parJour.set(jour.index, [...(parJour.get(jour.index) ?? []), ligne.stop]);
    }
  }
  if (parJour.size === 0) return revisee;
  return {
    ...revisee,
    days: revisee.days.map((jour) => {
      const presents = new Set(jour.items.flatMap((ligne) => (ligne.type === "stop" ? [ligne.stop.id] : [])));
      const aPoser = (parJour.get(jour.index) ?? []).filter((stop) => !presents.has(stop.id));
      if (aPoser.length === 0) return jour;
      const chevauche = (ligne: DayLineItemSnapshot) => {
        if (ligne.type === "stop" && ligne.stop.locked) return false;
        const lu = intervalle(ligne);
        if (lu === null) return false;
        return aPoser.some((stop) => {
          const [debut, fin] = [minutes(stop.start), minutes(stop.end ?? stop.start)];
          return lu[0] < Math.max(fin, debut + 1) && debut < lu[1];
        });
      };
      let items: DayLineItemSnapshot[] = jour.items.filter((ligne) => !chevauche(ligne));
      for (const stop of [...aPoser].sort((x, y) => minutes(x.start) - minutes(y.start))) {
        const rang = items.findIndex((ligne) => (ligne.type === "stop" && minutes(ligne.stop.start) > minutes(stop.start)) || (ligne.type === "terminus" && ligne.role === "end"));
        items.splice(rang === -1 ? items.length : rang, 0, { type: "stop", stop });
      }
      items = items.filter((ligne, i) => !(ligne.type === "segment" && items[i - 1]?.type === "segment"));
      return { ...jour, items };
    }),
  };
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
  // Lieux à soi de la base réinjectés (voir l'en-tête), puis R3 : une version qui changerait une étape verrouillée n'est pas écrite.
  const revisee = lieuxASoiReinjectes(base, instantane);
  const tenue = verrousReportes(base, revisee);
  const publies = new Set(instantane.days.flatMap((jour) => jour.items.flatMap((item) => (item.type === "stop" && item.stop.placeId !== undefined ? [item.stop.placeId] : []))));
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
      instantane: tenue ?? revisee,
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
