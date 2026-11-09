import "server-only";

import type { DaySnapshot, SegmentSnapshot, TripSnapshot } from "@/contracts";
import { joursCandidatsApercu } from "@/domain/apercu";
import { ajouterJours } from "@/domain/temps";
import { villesDeLaDate } from "@/domain/villes-du-voyage";
import type { ExecuteurPublication, OptionsEtape, ProgrammeRedige } from "@/server/composition/generation";
import { modeDeTrajet } from "@/server/programme/assemblage";
import { plagesDesVilles } from "@/server/programme/cadrage";
import { verrouillerVersions } from "@/server/versions/ecrire";

import type { EtatBarriere } from "./barriere";
import type { DependancesResolues } from "./dependances";
import { briefAPlusieursVilles, controleDeLaVerification, sql, voyageEtBriefSansRecit, type BriefDuVoyage } from "./etapes-programme";
import { avecSegmentsDuLieu } from "./etapes-revision";
import { cibleDuForfait, forfaitDeLaVerification } from "./forfait-etape";
import { lireInstantane, type ExecuteurLecture } from "./lecture";
import { publier } from "./publication";
import { identifiantForfait, requestIdDeVerification, type LigneVoyageComplet } from "./voyage-complet";

/**
 * Voyage complet de la **chaîne inversée** (M1c, ticket 1048 ; B9d réécrite pour la chaîne inversée ; réponse de Samuel à Q638
 * du 2026-11-09 : avant le paiement, Google ne vérifie que les propositions de l'aperçu ; après le déblocage, le voyage complet
 * vérifie les lieux restants). Corps des étapes `a` et `l` de `generateFullTrip` quand la chaîne de l'app est `"inversee"`
 * (`etapes-complet.ts` les appelle sous sa garde, sa barrière et sa clôture) ; le pont `src/workflows/voyage-complet.ts` ne
 * change pas : la ligne `full` finie à `l`, l'étape `b` suivante la trouve finie et le workflow s'arrête sans rien écrire.
 *
 * - **`a`** (rang 1, sans appel) : version courante relue ; **aucune étape restante** (`etapesRestantes`) : la ligne finit
 *   `ready` sur la version courante, sans forfait ni composition (la règle de 0136 § 4.4, gardée pour ce cas) ; sinon
 *   conversion du brief **sans récit** (`voyageEtBriefSansRecit` : aucune requête de modèle n'est faite, le récit n'est pas
 *   lu) et **réservation du forfait** du profil `verification` sous l'identifiant du passage (`identifiantForfait`).
 * - **`l`** (rang 2, `maxRetries` 0) : mêmes relectures ; logements d'abord (`lodging_unresolved` comme la génération), puis
 *   la vérification des étapes restantes par la capacité `lieuxRestants` de la famille `programme()` (mêmes lieux distincts,
 *   même texte, même zone, même contrôle de part et d'échéance que la génération), **sans requête de modèle ni Routes** ;
 *   enfin la publication par le module commun `publier` : garde au rang, verrou des versions et version courante relue
 *   (`ecrireSi` : toujours celle que `l` a lue avant la vérification, sinon rien n'est écrit), nouvelle version (`author_kind = 'workflow'`, `request_id`
 *   dérivé du passage), positions des lieux vérifiés (variante réelle seulement), fin `ready`. Aucun lieu vérifié : la ligne
 *   finit `ready` sans version.
 *
 * Ce qui change dans la version : le `placeId` des étapes vérifiées, et un segment de chaque côté de chacune (la règle de
 * l'assemblage, `avecSegmentsDuLieu`, mode du brief, sans durée). Rien d'autre : ni nom, ni heure, ni texte, ni case. Une étape
 * qui reste introuvable garde sa forme et son badge « à confirmer » à la lecture (0116 § 5.1). État sérialisé inchangé
 * (`EtatCompletSchema`) ; aucun nom, aucun `placeId` n'y entre. Aucun journal propre : l'arrêt est connu par
 * `generation_runs.stop_reason`, comme la révision.
 */

/** Contexte d'une étape du voyage complet (champs de `ContexteComplet`, `etapes-complet.ts`). */
export type ContexteCompletProgramme = {
  readonly dep: DependancesResolues;
  readonly organizationId: string;
  readonly generationRunId: string;
  readonly tripId: string;
  readonly ligne: Pick<LigneVoyageComplet, "id" | "reprisesPersonne" | "reprisesStudio">;
  readonly echeance: number;
  readonly rang: number;
  readonly barriere: EtatBarriere;
};

/** Fin `ready` de la ligne `full` au rang de l'étape (`SQL_FIN_COMPLET`), `last_version` posée si `version` ; levée sinon. */
export type FinDuComplet = (x: ExecuteurLecture, version: number | null) => Promise<void>;

/** Étape de la version courante qu'il reste à vérifier : journée, identifiant, nom maison, côté d'un changement de ville. */
export type EtapeRestante = {
  readonly jour: number;
  readonly stopId: string;
  readonly nom: string;
  readonly debut: string;
  /** Vrai si l'étape suit une ligne « Vers {ville} » dans sa journée (ville d'arrivée). */
  readonly apresChangement: boolean;
};

/**
 * Étapes restantes (fonction pure) : dans les journées **hors de l'aperçu** (`joursCandidatsApercu`, celles que la génération
 * n'a pas vérifiées), les étapes sans `placeId` écrites par l'IA (ni engagement, ni étape ajoutée par la personne ou
 * découverte, ni étape verrouillée : R3 tient le `placeId` d'une étape verrouillée pour fixe), dans l'ordre des journées puis
 * des lignes. Les journées de l'aperçu ne sont jamais revérifiées (une étape de l'aperçu restée sans lieu l'a déjà été).
 */
export function etapesRestantes(instantane: TripSnapshot): EtapeRestante[] {
  const verifiees = joursCandidatsApercu(instantane.days);
  return [...instantane.days]
    .sort((a, b) => a.index - b.index)
    .filter((jour) => !verifiees.has(jour.index))
    .flatMap((jour) => {
      let apresChangement = false;
      const restantes: EtapeRestante[] = [];
      for (const ligne of jour.items) {
        if (ligne.type === "transfer") apresChangement = true;
        if (ligne.type !== "stop") continue;
        const { stop } = ligne;
        if (stop.placeId !== undefined || stop.locked || stop.addedBy !== undefined || stop.commitment !== undefined || stop.name.trim() === "") continue;
        restantes.push({ jour: jour.index, stopId: stop.id, nom: stop.name, debut: stop.start, apresChangement });
      }
      return restantes;
    });
}

/**
 * Ville d'une étape restante pour la vérification (fonction pure) : une seule ville, aucune (la destination du brief, comme la
 * génération) ; plusieurs villes, la ville que le cadrage aurait posée (`villesDeLaDate` sur les villes du brief : la ville du
 * jour, ou, le jour d'un changement de ville, la ville quittée avant la ligne « Vers {ville} » et la ville d'arrivée après).
 * `null` : aucune ville connue pour cette date (l'étape n'est pas vérifiée, jamais la zone commune).
 */
export function villeDeLEtape(brief: BriefDuVoyage, etape: Pick<EtapeRestante, "jour" | "apresChangement">): string | undefined | null {
  if (!briefAPlusieursVilles(brief)) return undefined;
  const villes = villesDeLaDate(plagesDesVilles(brief.villes), ajouterJours(brief.arrivee, etape.jour - 1));
  if (villes === undefined) return null;
  if ("ville" in villes) return villes.ville;
  return etape.apresChangement ? villes.vers : villes.de;
}

/**
 * Programme à vérifier reconstruit depuis les étapes restantes (fonction pure) : une journée par journée qui en a, un créneau
 * `visite` par étape (nom et heure maison, ville de `villeDeLEtape`), et la correspondance `(jour, rang)` → étape. Aucun autre
 * champ : seuls le nom et la ville entrent dans la requête Text Search (0117 § 2 point 1, 0139 § 5.2).
 */
export function programmeDesRestantes(
  restantes: readonly EtapeRestante[],
  brief: BriefDuVoyage,
): { readonly programme: ProgrammeRedige; readonly etapeDe: (jour: number, rang: number) => string | undefined } {
  const parJour = new Map<number, { stopId: string; creneau: ProgrammeRedige["jours"][number]["creneaux"][number] }[]>();
  for (const etape of restantes) {
    const ville = villeDeLEtape(brief, etape);
    if (ville === null) continue;
    const liste = parJour.get(etape.jour) ?? [];
    liste.push({ stopId: etape.stopId, creneau: { debut: etape.debut, nature: "visite", lieu: etape.nom, ...(ville === undefined ? {} : { ville }) } });
    parJour.set(etape.jour, liste);
  }
  const jours = [...parJour.entries()].sort(([a], [b]) => a - b);
  return {
    programme: { jours: jours.map(([jour, liste]) => ({ date: ajouterJours(brief.arrivee, jour - 1), creneaux: liste.map((l) => l.creneau) })), bonsPlans: [] },
    etapeDe: (jour, rang) => jours[jour]?.[1][rang]?.stopId,
  };
}

/**
 * Version complétée (fonction pure) : le `placeId` de chaque étape vérifiée posé sur elle, puis ses segments refaits par la
 * règle de l'assemblage (`avecSegmentsDuLieu`, dans l'ordre des lignes) ; une journée sans étape vérifiée est rendue telle
 * quelle (même objet).
 */
export function avecLieuxVerifies(instantane: TripSnapshot, placeIds: ReadonlyMap<string, string>, mode: SegmentSnapshot["mode"]): TripSnapshot {
  const days = instantane.days.map((jour): DaySnapshot => {
    const ids = jour.items.flatMap((ligne) => (ligne.type === "stop" && placeIds.has(ligne.stop.id) ? [ligne.stop.id] : []));
    if (ids.length === 0) return jour;
    let items = jour.items.map((ligne) => {
      if (ligne.type !== "stop") return ligne;
      const placeId = placeIds.get(ligne.stop.id);
      return placeId === undefined ? ligne : { ...ligne, stop: { ...ligne.stop, placeId } };
    });
    for (const id of ids) items = avecSegmentsDuLieu(items, id, mode);
    return { ...jour, items };
  });
  return { ...instantane, days };
}

/** Étape `a` de la chaîne inversée : fin sans écriture s'il ne reste rien, sinon conversion et réservation du forfait. */
export async function debutDuCompletProgramme(contexte: ContexteCompletProgramme, finir: FinDuComplet): Promise<void> {
  const aVerifier = await sql(contexte, async (x) => {
    const { version, instantane } = await lireInstantane(x, contexte.organizationId, contexte.tripId);
    if (etapesRestantes(instantane).length === 0) {
      await finir(x, version);
      return false;
    }
    await voyageEtBriefSansRecit(x, contexte.organizationId, contexte.tripId);
    return true;
  });
  if (aVerifier) await forfaitDeLaVerification(contexte.dep, cibleDuForfait(contexte), identifiantForfait(contexte.ligne));
}

/** Étape `l` de la chaîne inversée : logements, vérification des étapes restantes et publication (voir l'en-tête). */
export async function verificationDuCompletProgramme(contexte: ContexteCompletProgramme, finir: FinDuComplet): Promise<void> {
  const { dep, organizationId, generationRunId, tripId } = contexte;
  const lu = await sql(contexte, async (x) => {
    const { version, instantane } = await lireInstantane(x, organizationId, tripId);
    const restantes = etapesRestantes(instantane);
    if (restantes.length === 0) {
      await finir(x, version);
      return null;
    }
    return { version, instantane, restantes, ...(await voyageEtBriefSansRecit(x, organizationId, tripId)) };
  });
  if (lu === null) return;
  const { forfait, registre, plafonds } = await forfaitDeLaVerification(dep, cibleDuForfait(contexte), identifiantForfait(contexte.ligne));
  const options: OptionsEtape = { usage: registre, plafonds, executionId: generationRunId, forfait, horloge: dep.horloge, echeance: contexte.echeance };
  const fabrique = await dep.composer(contexte.barriere, { destination: lu.voyage.draft.destination });
  const capacite = fabrique.programme(options);
  // Instant pris **avant** les fiches qui rendent les positions (0060 § 1.3 point 2).
  const obtenuesA = dep.maintenant();
  await capacite.logements(lu.brief, briefAPlusieursVilles(lu.brief));
  const { programme, etapeDe } = programmeDesRestantes(lu.restantes, lu.brief);
  const verifies = await capacite.lieuxRestants(programme).verifier(controleDeLaVerification(contexte, forfait, registre));
  const placeIds = new Map<string, string>();
  programme.jours.forEach((jour, indiceJour) =>
    jour.creneaux.forEach((_, rang) => {
      const stopId = etapeDe(indiceJour, rang);
      const placeId = verifies.placeIdDe(indiceJour, rang);
      if (stopId !== undefined && placeId !== undefined) placeIds.set(stopId, placeId);
    }),
  );
  if (placeIds.size === 0) {
    await sql(contexte, (x) => finir(x, null));
    return;
  }
  const instantane = avecLieuxVerifies(lu.instantane, placeIds, modeDeTrajet(lu.brief));
  const publies = new Set(placeIds.values());
  const ecrirePositions = dep.ecriturePositions(fabrique)
    ? (executeur: ExecuteurPublication) => verifies.positions.ecrire(executeur, publies, obtenuesA, dep.portPositions)
    : undefined;
  await publier(
    dep,
    { organizationId, generationRunId, tripId, requestId: requestIdDeVerification(contexte.ligne), echeance: contexte.echeance, rang: contexte.rang },
    {
      instantane,
      instantanePrecedent: lu.instantane,
      cases: [],
      statut: "ready",
      ...(ecrirePositions === undefined ? {} : { ecrirePositions }),
      // Sous le verrou des versions : la version courante est toujours celle que `l` a lue, sinon rien n'est écrit.
      ecrireSi: async (x) => {
        await verrouillerVersions(x, tripId);
        return (await lireInstantane(x, organizationId, tripId)).version === lu.version;
      },
    },
  );
}
