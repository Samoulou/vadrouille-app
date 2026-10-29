import "server-only";

import type { TripSnapshot } from "@/contracts";
import type { TriDuRecalcul } from "@/domain/recalcul";
import type { ExecuteurPublication, OptionsEtape } from "@/server/composition/generation";
import { RANG_LOT } from "@/server/config/generation";
import { entreeProgrammeDepuisBrief } from "@/server/programme/entree";
import { entreeRevisionDepuisJours, nomsEcartesDesJours, retirerEtapesEcartees, type ChoixRevision } from "@/server/programme/revision";
import { verrouillerVersions } from "@/server/versions/ecrire";

import type { EtatBarriere } from "./barriere";
import type { DependancesResolues } from "./dependances";
import { compteursInitiaux, redigerEtVerifier, sql, voyageEtBriefSansRecit } from "./etapes-programme";
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
 *   textes de l'IA de la version de base et des choix, schéma strict, `zdr`), lecture tolérante, filet du code
 *   (`retirerEtapesEcartees`), vérification de toute la version sous la part et l'échéance, **aucun appel Routes**,
 *   assemblage par le module partagé `assemblerProgrammeIa` ; enfin la publication par le **module commun** `publier`
 *   (`publication.ts`, même rejeu borné, confirmation perdue comprise) : garde au rang, puis `ecrireSi` (verrou des versions,
 *   version courante relue : toujours la version de base, sinon rien n'est écrit), nouvelle version par le module unique
 *   (`author_kind = 'workflow'`, `request_id` de la ligne), positions (variante réelle seulement), fin `ready`, aucune case.
 *
 * Ce que la révision ne réécrit pas (choix conservateurs, décrits dans la PR) : les cases de l'aperçu (`proposals`), les lignes
 * « À faire » (`checklist_items`, la personne a pu en cocher) et `stays.place_id` (écrits par la génération). Le récit n'est
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
  const entree = entreeRevisionDepuisJours(base.days, entreeProgrammeDepuisBrief(brief), choix);
  const noms = nomsEcartesDesJours(base.days, entree.choix.pasPourMoi);
  const { instantane, verifies, obtenuesA } = await redigerEtVerifier(
    contexte,
    { brief, capacite, forfait, registre, compteurs: compteursInitiaux() },
    (c) => c.reviser(entree, { arrivee: brief.arrivee, depart: brief.depart }, (programme) => retirerEtapesEcartees(programme, noms)),
  );
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
      instantane,
      cases: [],
      statut: "ready",
      ...(ecrirePositions === undefined ? {} : { ecrirePositions }),
      ecrireSi: async (x) => {
        await verrouillerVersions(x, tripId);
        return (await lireInstantane(x, organizationId, tripId)).version === contexte.baseVersion;
      },
    },
  );
}
