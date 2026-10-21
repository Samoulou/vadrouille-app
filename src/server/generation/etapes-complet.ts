import "server-only";

import { TripSnapshotSchema, type DaySnapshot, type TripSnapshot } from "@/contracts";
import type { CandidatMoteur, EntreeMoteur } from "@/domain/entrees";
import { modesAdmis, replanifierJour } from "@/domain/generation";
import { squeletteAvecEngagements } from "@/domain/squelette";
import { ajouterJours, joursEntre } from "@/domain/temps";
import { AGE_SOURCE_MAX_JOURS_APERCU, type CapaciteFinale, type CapaciteRecherche, type ExecuteurPublication, type FabriqueGeneration, type LieuARedige, type OptionsEtape } from "@/server/composition/generation";
import { CONFIGURATION_CLASSEMENT } from "@/server/config/classement";
import { DUREE_ETAPE_MS, JOURS_PLANIFIES_APERCU, TENTATIVES_PUBLICATION, type EtapeApercu } from "@/server/config/generation";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { DELAI_PORT_MS } from "@/server/usage/port";
import { ecrireVersion } from "@/server/versions/ecrire";
import { executeurSql } from "@/server/with-org";

import { signalerSiBloquee } from "./blocage";
import { ArretEtape, codeDeErreur, codeFerme } from "./codes";
import type { EtatBarriere } from "./barriere";
import type { DependancesGeneration, DependancesResolues } from "./dependances";
import { resoudre } from "./dependances";
import {
  dateDansFuseau,
  eligibles,
  evenementsDe,
  lireCandidats,
  logementVille,
  SQL_ANCRAGE,
  SQL_CANDIDAT,
  SQL_NOMS,
  SQL_NOTES,
  SQL_OCCURRENCE,
  SQL_OCCURRENCES,
  SQL_PLACE_SEJOUR,
  type CandidatLu,
} from "./etapes";
import { lireEtatComplet, type EtatComplet } from "./etat";
import { forfaitDeLEtape, type ForfaitDeLEtape, type PartDuPassage } from "./forfait-etape";
import { reserveDuPassage, type ReserveTextSearch } from "./reserve-text-search";
import { cloreCompletEnEchec, commencerEtapeComplet, echecCompletDeLigne, exigerGardeAuRang, gardeOuverteAuRang, type EchecComplet } from "./garde";
import { lireVoyage, nuitsDuVoyage, type ExecuteurLecture, type VilleDeLApercu, type VoyageLu } from "./lecture";
import { normaliser, SQL_CANDIDAT_REPRISE, SQL_CANDIDATS_SOURCE, SQL_OCCURRENCES_REPRISE } from "./reprise-recherches";
import { etapeDuRang, identifiantForfait, joursDuPassage, RANG_COMPLET, rangDuJour, requestIdDeVersion, sansEtape, type EtapeJour } from "./voyage-complet";

/**
 * Étapes de `generateFullTrip`, **workflow 4** (spécification B9, B9d points 1 à 7, B9-PO-7 ; décisions 0081 B9-TL-3, B9-TL-12
 * et B9-TL-13 point 3, 0087 § 1.3 et § 1.7). Fonctions ordinaires, testables sans le SDK : `src/workflows/voyage-complet.ts` les
 * enveloppe dans des `"use step"`. Mêmes règles que les étapes de l'aperçu (`etapes.ts`) : entrée validée par son contrat strict,
 * garde `step_seq` avant toute composition et tout appel, barrière évaluée à l'entrée de chaque étape, forfait réservé avant tout
 * appel, toute écriture sous la garde, arrêt sur un code fermé, aucune donnée de lieu dans l'état sérialisé.
 *
 * Déroulé d'une exécution (un **passage** de la ligne `full`) :
 * - `a` (rang 1) : relit le voyage et la dernière version, calcule les jours à planifier (`joursDuPassage` : jours hors de
 *   l'aperçu sans élément `stop`, 0086 § 1.7) ; aucun jour : la ligne finit `ready` sans appel ; sinon **réserve le forfait du
 *   passage** (profil `complet`) ;
 * - `l` (rang 2) : contrôle du logement des villes de ces jours (0087 § 2) ;
 * - puis, pour le jour de rang `i` (jours croissants), `b`, `c`, `d`, `e` aux rangs `2 + 4 × i + k` (0087 § 1.3 point 4) :
 *   `b` cherche les villes que ce jour introduit (candidats de l'aperçu repris et **complétés** par une recherche de profil
 *   `complet`, `dejaTrouves`), `c` les ancre (les candidats repris sont **ré-ancrés** : un `placeId` ne vaut jamais verdict),
 *   `d` note ceux qui n'ont pas de notes, `e` relit (fiches, trajets) **ce jour seulement**, le planifie par `replanifierJour` sur
 *   la dernière version (le moteur admet un jour de base non planifié, B9-TL-13 point 3), rédige les raisons et **publie une
 *   version** (`request_id` dérivé du passage et du jour, 0087 § 1.7). Le dernier jour clôt la ligne (`ready`, ou `incomplete`
 *   si un jour reste sans étape).
 * Les jours de l'aperçu ne sont jamais replanifiés (B9-PO-7). Un arrêt clôt la ligne en `failed` : les versions déjà publiées
 * restent, aucun jour n'est à moitié planifié (B9-PO-8). L'écrivain dont l'écriture a passé la ligne en `failed` évalue l'état
 * bloqué et écrit `generation.full_stuck` (0087 § 1.4).
 *
 * Correspondance des villes : la ville d'une recherche du passage est le rang de sa ligne `research_runs` parmi celles de
 * l'exécution (comme l'aperçu), dans l'ordre des **villes du voyage complet** (`villesDuComplet`) ; une ligne par ville et par
 * exécution, gardée d'un passage à l'autre (une reprise ne cherche pas à nouveau une ville déjà cherchée par la même ligne).
 */

type Executeur = ExecuteurLecture & { query(texte: string, valeurs?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }> };

type LigneDuPassage = { readonly id: string; readonly reprisesPersonne: number; readonly reprisesStudio: number };

type ContexteComplet = {
  readonly dep: DependancesResolues;
  readonly organizationId: string;
  readonly generationRunId: string;
  readonly tripId: string;
  readonly ligne: LigneDuPassage;
  readonly echeance: number;
  readonly etape: EtapeApercu;
  readonly rang: number;
  readonly barriere: EtatBarriere;
};

const sql = <T>(contexte: Pick<ContexteComplet, "dep" | "organizationId">, travail: (executeur: Executeur) => Promise<T>): Promise<T> =>
  contexte.dep.transaction(contexte.organizationId, (tx) => travail(executeurSql(tx)));

const maintenant = (contexte: ContexteComplet): Date => new Date(contexte.dep.maintenant());

/** Rang de l'étape à commencer depuis le rang de la dernière étape terminée ; `null` si l'étape n'est pas celle attendue. */
function rangSuivant(etat: EtatComplet, etape: EtapeApercu): number | null {
  if (etape === "a") return RANG_COMPLET.a;
  if (etape === "l") return etat.rang === RANG_COMPLET.a ? RANG_COMPLET.l : null;
  const suivant = etapeDuRang(etat.rang + 1);
  return suivant !== null && suivant.etape === etape ? etat.rang + 1 : null;
}

/**
 * Gabarit des étapes du voyage complet : garde (ligne `full`, rang de l'étape), barrière, corps, clôture en échec sur un code
 * fermé. Une ligne déjà finie (`ready`, `incomplete`) rend l'entrée **inchangée** : le workflow s'arrête sans rien écrire.
 */
async function executerComplet(entree: unknown, etape: EtapeApercu, corps: (contexte: ContexteComplet) => Promise<void>, dependances?: DependancesGeneration): Promise<EtatComplet> {
  const etat = lireEtatComplet(entree);
  if (etat.arret !== undefined) return etat;
  const rang = rangSuivant(etat, etape);
  if (rang === null) return { ...etat, arret: "invalid_input" };
  const dep = resoudre(dependances);
  const { organizationId, generationRunId } = etat;
  const ouverte = await dep.transaction(organizationId, (tx) => commencerEtapeComplet(executeurSql(tx), organizationId, generationRunId, etape, rang, new Date(dep.maintenant())));
  if (ouverte === "finie") return etat;
  if (ouverte === null) return { ...etat, arret: "step_expired" };
  const commun = {
    dep,
    organizationId,
    generationRunId,
    tripId: ouverte.tripId,
    ligne: { id: generationRunId, reprisesPersonne: ouverte.reprisesPersonne, reprisesStudio: ouverte.reprisesStudio },
    echeance: dep.maintenant() + DUREE_ETAPE_MS,
    etape,
    rang,
  };
  try {
    const barriere = await dep.barriere();
    if (barriere === "production") throw new ArretEtape("production_refused");
    await corps({ ...commun, barriere });
    return { generationRunId, organizationId, rang };
  } catch (erreur) {
    if (etape === "a" && !(erreur instanceof ArretEtape)) throw erreur;
    const code = erreur instanceof ArretEtape ? erreur.code : codeDeErreur(erreur);
    let close: EchecComplet | null = null;
    try {
      close = await sql(commun, (x) => cloreCompletEnEchec(x, organizationId, generationRunId, rang, code, new Date(dep.maintenant())));
    } catch {
      // Clôture impossible : l'exécution expire (`step_expired`, 0081 B9-TL-3 point 5), et l'expiration signale le blocage.
    }
    if (close !== null) signalerSiBloquee(organizationId, close);
    return { generationRunId, organizationId, rang, arret: code };
  }
}

/**
 * Clôture sur erreur inattendue, **gardée par le rang** (revue de la PR 600, mineur 1) : la ligne n'est close que si elle est
 * en `preparing` au rang de la dernière étape terminée par ce workflow (`$5`, l'étape suivante n'a pas pu s'ouvrir) ou à celui de
 * l'étape qui a levé (`$5 + 1`). Un ancien workflow dont la ligne a expiré puis a été reprise (nouveau passage, `step_seq` remis
 * à 0 puis rouvert) ne clôt donc pas le nouveau passage tant que celui-ci n'est pas exactement à ces rangs ; une ligne `queued`
 * n'est jamais close ici (l'expiration s'en charge).
 */
export const SQL_CLOTURE_COMPLET = `UPDATE public.generation_runs SET phase = 'failed', stop_reason = $3, updated_at = $4::timestamptz, finished_at = $4::timestamptz
  WHERE organization_id = $1 AND id = $2 AND phase = 'preparing' AND kind = 'full' AND step_seq IN ($5::int, $5::int + 1)
  RETURNING id, trip_id, stop_reason, cardinality(person_retry_request_ids)::int AS reprises_personne, studio_retries`;

/** Clôture d'une exécution `full` dont une étape a levé une erreur inattendue (workflow, après les reprises de la file). */
export async function etapeClotureComplet(entree: unknown, code: unknown, dependances?: DependancesGeneration): Promise<EtatComplet> {
  const etat = lireEtatComplet(entree);
  const dep = resoudre(dependances);
  const ferme = codeFerme(code);
  let close: EchecComplet | null = null;
  try {
    const ligne = (
      await dep.transaction(etat.organizationId, (tx) => executeurSql(tx).query(SQL_CLOTURE_COMPLET, [etat.organizationId, etat.generationRunId, ferme, new Date(dep.maintenant()).toISOString(), etat.rang]))
    ).rows[0];
    close = ligne === undefined ? null : echecCompletDeLigne(ligne);
  } catch {
    // L'exécution expire.
  }
  if (close !== null) signalerSiBloquee(etat.organizationId, close);
  return { ...etat, arret: etat.arret ?? ferme };
}

// --- Lecture du passage ----------------------------------------------------------------------------------------------------

const SQL_VERSION_COURANTE = `SELECT v.version, v.snapshot FROM public.trips t
  JOIN public.trip_versions v ON v.organization_id = t.organization_id AND v.trip_id = t.id AND v.version = t.current_version
  WHERE t.organization_id = $1 AND t.id = $2`;
const SQL_PUBLIEES = `SELECT request_id::text AS request_id FROM public.trip_versions
  WHERE organization_id = $1 AND trip_id = $2 AND request_id = ANY($3::uuid[])`;

/** Premier jour du voyage complet (le jour qui suit l'aperçu). */
const PREMIER_JOUR_COMPLET = Math.max(...JOURS_PLANIFIES_APERCU) + 1;

/**
 * Villes du voyage complet, dans l'ordre du séjour : séjours qui recoupent les jours qui suivent l'aperçu (borne de fin
 * comprise : une ville quittée le matin du premier de ces jours y figure). Le rang d'une ville est celui de sa recherche
 * parmi les recherches de l'exécution.
 */
export function villesDuComplet(voyage: VoyageLu): VilleDeLApercu[] {
  const nombre = joursEntre(voyage.draft.start, voyage.draft.end) + 1;
  if (nombre < PREMIER_JOUR_COMPLET) return [];
  const debut = ajouterJours(voyage.draft.start, PREMIER_JOUR_COMPLET - 1);
  const fin = voyage.draft.end;
  return voyage.sejours
    .filter((sejour) => sejour.du <= fin && sejour.au >= debut)
    .map((sejour, rang) => ({ rang, nom: sejour.ville, arrivee: sejour.du > debut ? sejour.du : debut, depart: sejour.au < fin ? sejour.au : fin, sejour }));
}

/** Villes d'un jour : séjours qui contiennent sa date, borne de fin comprise (un jour de changement a ses deux villes). */
export function villesDuJour(voyage: VoyageLu, villes: readonly VilleDeLApercu[], jour: number): VilleDeLApercu[] {
  const date = ajouterJours(voyage.draft.start, jour - 1);
  return villes.filter((ville) => ville.sejour.du <= date && ville.sejour.au >= date);
}

export type Passage = {
  readonly voyage: VoyageLu;
  readonly version: number;
  readonly instantane: TripSnapshot;
  readonly jours: readonly number[];
  readonly villes: readonly VilleDeLApercu[];
};

async function lireInstantane(x: Executeur, organizationId: string, tripId: string): Promise<{ version: number; instantane: TripSnapshot }> {
  const ligne = (await x.query(SQL_VERSION_COURANTE, [organizationId, tripId])).rows[0];
  if (ligne === undefined) throw new ArretEtape("invalid_input");
  const brut = typeof ligne.snapshot === "string" ? JSON.parse(ligne.snapshot) : ligne.snapshot;
  const lu = TripSnapshotSchema.safeParse(brut);
  if (!lu.success) throw new ArretEtape("invalid_input");
  return { version: Number(ligne.version), instantane: lu.data };
}

async function lirePassage(x: Executeur, contexte: ContexteComplet): Promise<Passage> {
  const voyage = await lireVoyage(x, contexte.organizationId, contexte.tripId);
  if (voyage === null) throw new ArretEtape("invalid_input");
  const { version, instantane } = await lireInstantane(x, contexte.organizationId, contexte.tripId);
  const parId = new Map(instantane.days.map((jour) => [requestIdDeVersion(contexte.ligne, jour.index), jour.index] as const));
  const lues = (await x.query(SQL_PUBLIEES, [contexte.organizationId, contexte.tripId, [...parId.keys()]])).rows;
  const publies = new Set(lues.flatMap((ligne) => {
    const jour = parId.get(String(ligne.request_id).toLowerCase());
    return jour === undefined ? [] : [jour];
  }));
  return { voyage, version, instantane, jours: joursDuPassage(instantane, publies), villes: villesDuComplet(voyage) };
}

/** Jour de rang `i` du passage et ses villes ; les villes que ce jour **introduit** (absentes des jours de rang inférieur). */
function jourDuRang(passage: Passage, i: number): { readonly jour: number; readonly villes: VilleDeLApercu[]; readonly introduites: VilleDeLApercu[] } {
  const jour = passage.jours[i];
  if (jour === undefined) throw new ArretEtape("invalid_input");
  const villes = villesDuJour(passage.voyage, passage.villes, jour);
  const avant = new Set(passage.jours.slice(0, i).flatMap((j) => villesDuJour(passage.voyage, passage.villes, j).map((v) => v.rang)));
  return { jour, villes, introduites: villes.filter((ville) => !avant.has(ville.rang)) };
}

/**
 * Rang de ville le plus haut que les jours de rang `0` à `i` du passage ont introduit ; pour `i = -1`, le rang qui précède la
 * première ville du passage (−1 si le passage n'a aucune ville). Les villes de rang `]plusHautIntroduit(i − 1), plusHautIntroduit(i)]`
 * sont celles que le jour de rang `i` introduit : ses villes nouvelles, et les villes intermédiaires que son étape `b` cherche
 * pour garder la correspondance par rang (une ville d'un jour qui n'est pas dans le passage).
 */
export function plusHautIntroduit(passage: Pick<Passage, "voyage" | "villes" | "jours">, i: number): number {
  const rangs = (j: number) => villesDuJour(passage.voyage, passage.villes, j).map((v) => v.rang);
  const tous = passage.jours.flatMap(rangs);
  let plusHaut = tous.length === 0 ? -1 : Math.min(...tous) - 1;
  for (const jour of passage.jours.slice(0, Math.max(0, i + 1))) plusHaut = Math.max(plusHaut, ...rangs(jour));
  return plusHaut;
}

/**
 * Part du passage de l'étape du jour de rang `i` (décision du Tech Lead, revue de la PR 600) : villes introduites pour `b`,
 * `c` et `d` (un jour qui n'en introduit aucune n'a rien à dépenser), un jour pour `e`.
 */
export function partDuPassage(passage: Pick<Passage, "voyage" | "villes" | "jours">, i: number, etape: EtapeJour): PartDuPassage {
  if (etape === "e") return { avant: i, ici: 1, total: passage.jours.length };
  const base = plusHautIntroduit(passage, -1);
  const avant = plusHautIntroduit(passage, i - 1);
  return { avant: avant - base, ici: plusHautIntroduit(passage, i) - avant, total: plusHautIntroduit(passage, passage.jours.length - 1) - base };
}

const rangDuJourCourant = (contexte: ContexteComplet): number => {
  const position = etapeDuRang(contexte.rang);
  if (position === null) throw new ArretEtape("invalid_input");
  return position.i;
};

/**
 * Réserve Text Search de l'étape `e` du passage (décision 0113 § 3 bis point 1) : chaque étape `e` positionne les villes de son
 * jour, donc une requête par ville `area` ou `none` **et par jour** ; `total` est la somme sur les jours du passage, `ici` la
 * réserve du jour de l'étape `e` en cours (0 pour les autres étapes). Même fonction pure que l'aperçu.
 */
export function reserveDeLEtape(passage: Pick<Passage, "voyage" | "villes" | "jours">, position: { readonly i: number; readonly etape: EtapeJour } | null): ReserveTextSearch {
  const { nuitsVille } = nuitsDuVoyage(passage.voyage, passage.villes);
  const jour = position !== null && position.etape === "e" ? (passage.jours[position.i] ?? null) : null;
  return reserveDuPassage({ jours: passage.jours, nuitsVille, villes: passage.villes.map((ville) => ({ rang: ville.rang, logement: ville.sejour.logement })) }, jour);
}

async function forfaitDuPassage(contexte: ContexteComplet, passage: Pick<Passage, "voyage" | "villes" | "jours">): Promise<ForfaitDeLEtape> {
  const position = etapeDuRang(contexte.rang);
  return forfaitDeLEtape(
    contexte.dep,
    { organizationId: contexte.organizationId, tripId: contexte.tripId, generationRunId: contexte.generationRunId, barriere: contexte.barriere },
    contexte.etape,
    { profil: "complet", identifiant: identifiantForfait(contexte.ligne), ...(position === null ? {} : { part: partDuPassage(passage, position.i, position.etape) }) },
    reserveDeLEtape(passage, position),
  );
}

async function ouvrir(contexte: ContexteComplet, passage: Pick<Passage, "voyage" | "villes" | "jours">): Promise<{ readonly fabrique: FabriqueGeneration; readonly options: OptionsEtape }> {
  const forfait = await forfaitDuPassage(contexte, passage);
  const fabrique = await contexte.dep.composer(contexte.barriere);
  if (contexte.dep.reglesPour(contexte.barriere) === null) throw new ArretEtape("usage_unavailable");
  return {
    fabrique,
    options: { usage: forfait.registre, plafonds: forfait.plafonds, executionId: contexte.generationRunId, forfait: forfait.forfait, horloge: contexte.dep.horloge, echeance: contexte.echeance },
  };
}

// --- Fin d'une exécution ---------------------------------------------------------------------------------------------------

const SQL_FIN_COMPLET = `UPDATE public.generation_runs SET phase = $4, stop_reason = NULL, last_version = COALESCE($5, last_version), updated_at = $6::timestamptz, finished_at = $6::timestamptz
  WHERE organization_id = $1 AND id = $2 AND step_seq = $3 AND phase = 'preparing' AND kind = 'full' RETURNING id`;
const SQL_JOUR_PUBLIE = `UPDATE public.generation_runs SET last_version = $4, updated_at = $5::timestamptz
  WHERE organization_id = $1 AND id = $2 AND step_seq = $3 AND phase = 'preparing' AND kind = 'full' RETURNING id`;

/** Phase finale : `incomplete` si un jour planifié par ce passage reste sans étape, `ready` sinon. */
function phaseFinale(instantane: TripSnapshot, jours: readonly number[]): "ready" | "incomplete" {
  return instantane.days.some((jour) => jours.includes(jour.index) && sansEtape(jour)) ? "incomplete" : "ready";
}

// --- Étape a ---------------------------------------------------------------------------------------------------------------

/** Étape `a` (rang 1) : jours du passage ; aucun : la ligne finit `ready` sans appel ; sinon réservation du forfait du passage. */
export function etapeCompletDebut(entree: unknown, dependances?: DependancesGeneration): Promise<EtatComplet> {
  return executerComplet(
    entree,
    "a",
    async (contexte) => {
      const passage = await sql(contexte, (x) => lirePassage(x, contexte));
      if (passage.jours.length === 0) {
        await sql(contexte, async (x) => {
          const fin = await x.query(SQL_FIN_COMPLET, [contexte.organizationId, contexte.generationRunId, contexte.rang, "ready", null, maintenant(contexte).toISOString()]);
          if (fin.rows.length === 0) throw new ArretEtape("step_expired");
        });
        return;
      }
      if (passage.villes.length === 0) throw new ArretEtape("invalid_input");
      await forfaitDuPassage(contexte, passage);
    },
    dependances,
  );
}

// --- Étape l ---------------------------------------------------------------------------------------------------------------

/** Étape `l` (rang 2, 0087 § 2) : contrôle du logement des villes des jours du passage, avant toute dépense d'IA. */
export function etapeCompletLogement(entree: unknown, dependances?: DependancesGeneration): Promise<EtatComplet> {
  return executerComplet(
    entree,
    "l",
    async (contexte) => {
      const passage = await sql(contexte, (x) => lirePassage(x, contexte));
      const rangs = new Set(passage.jours.flatMap((jour) => villesDuJour(passage.voyage, passage.villes, jour).map((v) => v.rang)));
      const aVerifier = passage.villes.filter((ville) => rangs.has(ville.rang) && (ville.sejour.logement.kind === "known" || ville.sejour.logement.kind === "suggestedLodging"));
      if (aVerifier.length === 0) return;
      const { fabrique, options } = await ouvrir(contexte, passage);
      const capacite = fabrique.logement(options);
      const verifies: { ville: VilleDeLApercu; placeId: string }[] = [];
      for (const ville of aVerifier) {
        const issue = await capacite.verifier(ville.sejour.logement, ville.nom);
        if (!issue.ok) throw new ArretEtape(issue.code);
        if (issue.valeur !== null) verifies.push({ ville, placeId: issue.valeur.placeId });
      }
      await sql(contexte, async (x) => {
        await exigerGardeAuRang(x, contexte.organizationId, contexte.generationRunId, contexte.rang, maintenant(contexte));
        for (const { ville, placeId } of verifies) await x.query(SQL_PLACE_SEJOUR, [contexte.organizationId, contexte.tripId, ville.sejour.ville, ville.sejour.du, placeId]);
      });
    },
    dependances,
  );
}

// --- Étape b ---------------------------------------------------------------------------------------------------------------

const SQL_NOMBRE_RECHERCHES = `SELECT count(*)::int AS n FROM public.research_runs WHERE organization_id = $1 AND generation_run_id = $2`;
/** Recherche du voyage complet : `started_at` strictement croissant dans l'exécution (ordre des villes, même horloge figée). */
const SQL_RECHERCHE_COMPLET = `INSERT INTO public.research_runs (organization_id, trip_id, generation_run_id, queries, pages_read, duration_ms, cost_estimate_micros, errors, started_at, finished_at)
  VALUES ($1, $2, $3, $4::text[], $5, $6, $7, $8::text[],
    GREATEST($9::timestamptz, (SELECT max(started_at) + interval '1 millisecond' FROM public.research_runs WHERE organization_id = $1 AND generation_run_id = $3)),
    GREATEST($10::timestamptz, $9::timestamptz))
  RETURNING id`;
/**
 * Recherche de l'aperçu à reprendre pour la ville de rang `$3` **de l'aperçu** : la plus récente des exécutions `preview` du
 * voyage qui en a une (rang : ordre `started_at`, `id` des recherches d'une exécution, comme `SQL_SOURCE_REPRISE`).
 */
const SQL_SOURCE_APERCU = `WITH previews AS (
    SELECT id, started_at FROM public.generation_runs WHERE organization_id = $1 AND trip_id = $2 AND kind = 'preview'),
  recherches AS (
    SELECT r.id, r.generation_run_id, (row_number() OVER (PARTITION BY r.generation_run_id ORDER BY r.started_at, r.id) - 1)::int AS ville
    FROM public.research_runs r JOIN previews p ON p.id = r.generation_run_id
    WHERE r.organization_id = $1)
  SELECT r.id FROM recherches r JOIN previews p ON p.id = r.generation_run_id
  WHERE r.ville = $3
  ORDER BY p.started_at DESC, p.id DESC
  LIMIT 1`;

/** Rang de la ville `ville` parmi les villes de l'aperçu (séjours qui recoupent J1 et J2), ou `null`. */
function rangDansLApercu(voyage: VoyageLu, ville: VilleDeLApercu): number | null {
  const fin = ajouterJours(voyage.draft.start, Math.max(...JOURS_PLANIFIES_APERCU) - 1);
  const retenus = voyage.sejours.filter((sejour) => sejour.du <= fin && sejour.au > voyage.draft.start);
  const rang = retenus.findIndex((sejour) => sejour.ville === ville.sejour.ville && sejour.du === ville.sejour.du);
  return rang < 0 ? null : rang;
}

/**
 * Étape `b` du jour de rang `i` : pour chaque ville que ce jour introduit et que l'exécution n'a pas encore cherchée (dans
 * l'ordre des villes), une ligne `research_runs` qui reprend les candidats de l'aperçu de la même ville (copie, sans appel :
 * ré-ancrés à l'étape `c`) et les **complète** par une recherche de profil `complet` (`dejaTrouves` : les noms déjà connus, jamais
 * re-trouvés). Une ville déjà cherchée par un passage précédent de la même ligne n'est pas cherchée à nouveau.
 */
export function etapeCompletRecherche(entree: unknown, dependances?: DependancesGeneration): Promise<EtatComplet> {
  return executerComplet(
    entree,
    "b",
    async (contexte) => {
      const passage = await sql(contexte, (x) => lirePassage(x, contexte));
      const plusHaut = plusHautIntroduit(passage, rangDuJourCourant(contexte));
      let capacite: CapaciteRecherche | null = null;
      for (const ville of passage.villes.filter((v) => v.rang <= plusHaut)) {
        const deja = Number((await sql(contexte, (x) => x.query(SQL_NOMBRE_RECHERCHES, [contexte.organizationId, contexte.generationRunId]))).rows[0]?.n ?? 0);
        if (deja > ville.rang) continue;
        const rangApercu = rangDansLApercu(passage.voyage, ville);
        const source = rangApercu === null ? null : await sql(contexte, async (x) => (await x.query(SQL_SOURCE_APERCU, [contexte.organizationId, contexte.tripId, rangApercu])).rows[0]?.id ?? null);
        const repris = source === null ? [] : (await sql(contexte, (x) => x.query(SQL_CANDIDATS_SOURCE, [contexte.organizationId, String(source)]))).rows.map((l) => ({ id: String(l.id), nom: String(l.name) }));
        const connus = (await sql(contexte, (x) => x.query(SQL_NOMS, [contexte.organizationId, contexte.generationRunId]))).rows.map((l) => String(l.name));
        if (capacite === null) {
          const { fabrique, options } = await ouvrir(contexte, passage);
          capacite = fabrique.recherche(options);
        }
        const debut = contexte.dep.maintenant();
        const issue = await capacite.rechercher(
          passage.voyage.brief,
          { rang: ville.rang, nom: ville.nom, arrivee: ville.arrivee, depart: ville.depart },
          [...connus, ...repris.map((c) => c.nom)],
          passage.voyage.timeZone,
          "complet",
        );
        if (!issue.ok) throw new ArretEtape(issue.code);
        const { lignes, bilan } = issue.valeur;
        await sql(contexte, async (x) => {
          await exigerGardeAuRang(x, contexte.organizationId, contexte.generationRunId, contexte.rang, maintenant(contexte));
          const n = Number((await x.query(SQL_NOMBRE_RECHERCHES, [contexte.organizationId, contexte.generationRunId])).rows[0]?.n ?? 0);
          if (n !== ville.rang) throw new ArretEtape("invalid_input");
          const run = (
            await x.query(SQL_RECHERCHE_COMPLET, [
              contexte.organizationId,
              contexte.tripId,
              contexte.generationRunId,
              [...bilan.queries],
              bilan.pagesRead,
              bilan.durationMs,
              bilan.costEstimateMicros,
              [...bilan.errors],
              new Date(debut).toISOString(),
              new Date(contexte.dep.maintenant()).toISOString(),
            ])
          ).rows[0];
          if (run === undefined) throw new Error("recherche : exécution non écrite");
          const vus = new Set(connus.map(normaliser));
          let ordre = 0;
          // Candidats de l'aperçu d'abord (les mieux classés de la ville), puis ceux de la recherche complémentaire.
          for (const { id, nom } of repris) {
            const cle = normaliser(nom);
            if (vus.has(cle)) continue;
            vus.add(cle);
            const copie = (await x.query(SQL_CANDIDAT_REPRISE, [contexte.organizationId, id, run.id, new Date(debut + ordre).toISOString()])).rows[0];
            ordre += 1;
            if (copie === undefined) throw new Error("recherche : candidat non écrit");
            await x.query(SQL_OCCURRENCES_REPRISE, [contexte.organizationId, id, copie.id]);
          }
          for (const { candidat, occurrence } of lignes) {
            const cle = normaliser(candidat.name);
            if (vus.has(cle)) continue;
            vus.add(cle);
            const creeLe = new Date(debut + ordre).toISOString();
            ordre += 1;
            const ecrit = (
              await x.query(SQL_CANDIDAT, [
                contexte.organizationId,
                contexte.tripId,
                run.id,
                candidat.kind,
                candidat.name,
                candidat.summary,
                candidat.category,
                JSON.stringify(candidat.facts),
                JSON.stringify(candidat.sources),
                candidat.confidence,
                candidat.stopKind,
                candidat.toReserve,
                creeLe,
              ])
            ).rows[0];
            if (ecrit === undefined) throw new Error("recherche : candidat non écrit");
            if (occurrence !== null) {
              await x.query(SQL_OCCURRENCE, [
                contexte.organizationId,
                contexte.tripId,
                ecrit.id,
                occurrence.startsAt.toISOString(),
                occurrence.timezone,
                occurrence.category,
                occurrence.sourceUrl,
                occurrence.sourceCheckedAt === null ? null : occurrence.sourceCheckedAt.toISOString(),
                occurrence.status,
              ]);
            }
          }
        });
      }
    },
    dependances,
  );
}

// --- Étape c ---------------------------------------------------------------------------------------------------------------

/**
 * Étape `c` du jour de rang `i` (workflow 2) : ancrage de **tous** les candidats des villes que ce jour introduit, y compris
 * ceux repris de l'aperçu qui ont déjà un `placeId` (ré-ancrés : un candidat que l'ancrage ne résout plus perd son `placeId`).
 * Un lieu déjà porté par un candidat d'une autre ville de l'exécution n'est pas repris (un lieu, un candidat).
 */
export function etapeCompletAncrage(entree: unknown, dependances?: DependancesGeneration): Promise<EtatComplet> {
  return executerComplet(
    entree,
    "c",
    async (contexte) => {
      const passage = await sql(contexte, (x) => lirePassage(x, contexte));
      const { introduites } = jourDuRang(passage, rangDuJourCourant(contexte));
      const tous = (await sql(contexte, (x) => lireCandidats(x, contexte))).filter((c) => c.kind === "place");
      const rangs = new Set(introduites.map((v) => v.rang));
      const candidats = tous.filter((c) => rangs.has(c.ville));
      if (candidats.length === 0) return;
      const { fabrique, options } = await ouvrir(contexte, passage);
      const capacite = fabrique.ancrage(options);
      const resolus = new Map<string, string>();
      const traites: string[] = [];
      for (const ville of introduites) {
        const deLaVille = candidats.filter((c) => c.ville === ville.rang);
        if (deLaVille.length === 0) continue;
        const issue = await capacite.ancrer(logementVille(ville), ville.nom, deLaVille.map(({ id, nom }) => ({ id, nom })));
        if (!issue.ok) throw new ArretEtape(issue.code);
        for (const candidat of deLaVille) {
          traites.push(candidat.id);
          const placeId = issue.valeur.get(candidat.id);
          if (placeId !== undefined) resolus.set(candidat.id, placeId);
        }
      }
      const pris = new Set(tous.filter((c) => !rangs.has(c.ville) && c.placeId !== null).map((c) => c.placeId as string));
      for (const id of traites) {
        const placeId = resolus.get(id);
        if (placeId === undefined) continue;
        if (pris.has(placeId)) resolus.delete(id);
        else pris.add(placeId);
      }
      await sql(contexte, async (x) => {
        await exigerGardeAuRang(x, contexte.organizationId, contexte.generationRunId, contexte.rang, maintenant(contexte));
        for (const id of traites) await x.query(SQL_ANCRAGE, [contexte.organizationId, id, resolus.get(id) ?? null]);
      });
    },
    dependances,
  );
}

// --- Étape d ---------------------------------------------------------------------------------------------------------------

/**
 * Étape `d` du jour de rang `i` (workflow 3) : notes des candidats ancrés des villes que ce jour **introduit** et qui n'en ont pas
 * encore (la part de `d` est répartie sur les villes introduites : un jour qui n'en introduit aucune ne note rien).
 */
export function etapeCompletNotation(entree: unknown, dependances?: DependancesGeneration): Promise<EtatComplet> {
  return executerComplet(
    entree,
    "d",
    async (contexte) => {
      const passage = await sql(contexte, (x) => lirePassage(x, contexte));
      const { introduites: villes } = jourDuRang(passage, rangDuJourCourant(contexte));
      const rangs = new Set(villes.map((v) => v.rang));
      const aNoter = (await sql(contexte, (x) => lireCandidats(x, contexte))).filter(
        (c) => rangs.has(c.ville) && c.kind === "place" && c.placeId !== null && c.fit === null && (c.stopKind === "activity" || c.stopKind === "meal"),
      );
      if (aNoter.length === 0) return;
      const { fabrique, options } = await ouvrir(contexte, passage);
      const capacite = fabrique.notation(options);
      const notes = new Map<string, { matchesWishes: boolean; notForMeRisk: number; mustSee: boolean; slotFit: readonly string[] }>();
      for (const ville of villes) {
        const deLaVille = aNoter.filter((c) => c.ville === ville.rang);
        if (deLaVille.length === 0) continue;
        const issue = await capacite.noter(
          passage.voyage.brief,
          { rang: ville.rang, nom: ville.nom, arrivee: ville.arrivee, depart: ville.depart },
          deLaVille.map((c) => ({ id: c.id, nom: c.nom, resume: c.resume, categorie: c.categorie, typeEtape: c.stopKind as "activity" | "meal" })),
        );
        if (!issue.ok) throw new ArretEtape(issue.code);
        for (const [id, note] of issue.valeur) notes.set(id, note);
      }
      await sql(contexte, async (x) => {
        await exigerGardeAuRang(x, contexte.organizationId, contexte.generationRunId, contexte.rang, maintenant(contexte));
        for (const [id, note] of notes) await x.query(SQL_NOTES, [contexte.organizationId, id, note.matchesWishes, note.notForMeRisk, note.mustSee, [...note.slotFit]]);
      });
    },
    dependances,
  );
}

// --- Étape e ---------------------------------------------------------------------------------------------------------------

/** Lieux de l'instantané hors du jour `index` (étapes, événements, idées) : jamais repris pour ce jour (un lieu, une fois). */
function lieuxAilleurs(instantane: TripSnapshot, index: number): Set<string> {
  const lieux = new Set<string>();
  for (const jour of instantane.days) {
    if (jour.index === index) continue;
    for (const item of jour.items) if (item.type === "stop" && item.stop.placeId !== undefined) lieux.add(item.stop.placeId);
    for (const evenement of jour.events) if (evenement.placeId !== undefined) lieux.add(evenement.placeId);
    if (jour.surprise?.placeId !== undefined) lieux.add(jour.surprise.placeId);
  }
  return lieux;
}

/**
 * Étape `e` du jour de rang `i` : relectures Google de **ce jour seulement** (fiches de ses lieux, une matrice Routes ; aucun
 * appel pour un autre jour, B9-TL-13), `replanifierJour` sur la dernière version (repli sans candidat ni événement si aucun
 * programme ne tient : le jour reste sans étape, jamais un échec), raisons des lieux retenus (une seconde passe replanifie sans
 * les lieux restés sans raison), puis **une transaction de publication** : la dernière version relue sous la garde, ce jour
 * remplacé, une version écrite (`request_id` dérivé, 0087 § 1.7), et, pour le dernier jour, la fin de l'exécution.
 */
export function etapeCompletPlanification(entree: unknown, dependances?: DependancesGeneration): Promise<EtatComplet> {
  return executerComplet(
    entree,
    "e",
    async (contexte) => {
      const passage = await sql(contexte, (x) => lirePassage(x, contexte));
      const i = rangDuJourCourant(contexte);
      const { jour: index, villes } = jourDuRang(passage, i);
      const { voyage, instantane } = passage;
      const lus = await sql(contexte, async (x) => ({
        candidats: await lireCandidats(x, contexte),
        occurrences: (await x.query(SQL_OCCURRENCES, [contexte.organizationId, contexte.tripId])).rows,
      }));
      const { fabrique, options } = await ouvrir(contexte, passage);
      const capacite: CapaciteFinale = fabrique.finale(options);

      const obtenuesA = contexte.dep.maintenant();
      const dateReference = dateDansFuseau(obtenuesA, voyage.timeZone);
      const { nuits, nuitsVille } = nuitsDuVoyage(voyage, passage.villes);
      const squelette = squeletteAvecEngagements({
        voyage: { start: voyage.draft.start, end: voyage.draft.end },
        pace: voyage.brief.pace,
        nombreDeNuits: nuits.length,
        engagements: voyage.draft.commitments,
        configuration: CONFIGURATION_MOTEUR,
        budgetTrajetReduit: false,
      }).filter((jour) => jour.index === index);
      const classement = { classement: CONFIGURATION_CLASSEMENT, ageSourceMaxJours: AGE_SOURCE_MAX_JOURS_APERCU, dateReference };
      const ailleurs = lieuxAilleurs(instantane, index);
      const rangs = new Set(villes.map((v) => v.rang));
      const retenables = eligibles(lus.candidats).filter(({ moteur }) => rangs.has(moteur.ville) && (moteur.placeId === undefined || !ailleurs.has(moteur.placeId)));
      const planification = await capacite.planifier({
        jours: squelette,
        nuitsVille,
        villes: passage.villes.map((ville) => ({ rang: ville.rang, nom: ville.nom, logement: logementVille(ville) })),
        candidats: retenables.map(({ moteur }) => moteur),
        modes: [...modesAdmis(voyage.brief.mobility)],
        classement,
        configuration: CONFIGURATION_MOTEUR,
      });
      if (!planification.ok) throw new ArretEtape(planification.code);

      const parPlaceId = new Map(retenables.flatMap(({ lu, moteur }) => (moteur.placeId === undefined ? [] : [[moteur.placeId, lu] as const])));
      const evenements = evenementsDe(lus.candidats, lus.occurrences);
      const entreeMoteur = (candidats: readonly CandidatMoteur[], avecEvenements = true): EntreeMoteur => ({
        voyage: {
          destination: voyage.draft.destination,
          start: voyage.draft.start,
          end: voyage.draft.end,
          timeZone: voyage.timeZone,
          travellers: { adults: voyage.brief.travellers.adults, children: voyage.brief.travellers.children },
        },
        brief: voyage.brief,
        nuits,
        engagements: voyage.draft.commitments,
        candidats,
        evenements: avecEvenements ? evenements : [],
        idees: [],
        choix: new Map(),
        configuration: CONFIGURATION_MOTEUR,
        classement: { formule: CONFIGURATION_CLASSEMENT, ageSourceMaxJours: AGE_SOURCE_MAX_JOURS_APERCU },
        relectures: planification.valeur.relectures,
        porteeR1: { evenementsSansLieu: "admis" as const },
        dateReference,
        version: passage.version + 1,
        budgetTrajetReduit: false,
      });
      const planifier = (candidats: readonly CandidatMoteur[]): DaySnapshot => {
        const plein = replanifierJour(entreeMoteur(candidats), instantane, index);
        if (plein.ok) return plein.jour;
        const vide = replanifierJour(entreeMoteur([], false), instantane, index);
        if (vide.ok) return vide.jour;
        throw new ArretEtape("invalid_input");
      };

      const raisons = new Map<string, string>();
      const essayes = new Set<string>();
      let candidats: readonly CandidatMoteur[] = planification.valeur.candidats;
      let jour = planifier(candidats);
      for (let passe = 1; passe <= 2; passe += 1) {
        const etapes = jour.items.flatMap((item) => (item.type === "stop" && item.stop.placeId !== undefined && parPlaceId.has(item.stop.placeId) ? [parPlaceId.get(item.stop.placeId) as CandidatLu] : []));
        for (const ville of villes) {
          const lieux: LieuARedige[] = etapes
            .filter((c) => c.ville === ville.rang && !raisons.has(c.id) && !essayes.has(c.id))
            .map((c) => ({ id: c.id, nom: c.nom, resume: c.resume, categorie: c.categorie, typeEtape: c.stopKind === "meal" ? "meal" : "activity", sourceUrl: c.sources.find((s) => s.url !== "")?.url }));
          if (lieux.length === 0) continue;
          const issue = await capacite.rediger(voyage.brief, { rang: ville.rang, nom: ville.nom, arrivee: ville.arrivee, depart: ville.depart }, lieux);
          if (!issue.ok) throw new ArretEtape(issue.code);
          for (const lieu of lieux) essayes.add(lieu.id);
          for (const [id, raison] of issue.valeur) raisons.set(id, raison.raison);
        }
        const sansRaison = new Set(etapes.filter((c) => !raisons.has(c.id)).map((c) => c.id));
        if (sansRaison.size === 0 || passe === 2) break;
        candidats = candidats.filter((c) => !sansRaison.has(c.id));
        jour = planifier(candidats);
      }
      const avecRaisons: DaySnapshot = {
        ...jour,
        items: jour.items.map((item) => {
          if (item.type !== "stop" || item.stop.placeId === undefined) return item;
          const lu = parPlaceId.get(item.stop.placeId);
          const raison = lu === undefined ? undefined : raisons.get(lu.id);
          return raison === undefined ? item : { ...item, stop: { ...item.stop, reason: raison } };
        }),
      };

      const publies = new Set(avecRaisons.items.flatMap((item) => (item.type === "stop" && item.stop.placeId !== undefined ? [item.stop.placeId] : [])));
      const ecrirePositions = contexte.dep.ecriturePositions(fabrique)
        ? (executeur: ExecuteurPublication) => planification.valeur.positions.ecrire(executeur, publies, obtenuesA, contexte.dep.portPositions)
        : undefined;
      await publierJour(contexte, { jour: avecRaisons, index, dernier: i === passage.jours.length - 1, jours: passage.jours, ...(ecrirePositions === undefined ? {} : { ecrirePositions }) });
    },
    dependances,
  );
}

type DonneesJour = {
  readonly jour: DaySnapshot;
  readonly index: number;
  readonly dernier: boolean;
  readonly jours: readonly number[];
  readonly ecrirePositions?: (executeur: ExecuteurPublication) => Promise<{ readonly ok: boolean; readonly code?: string; readonly retryable?: boolean }>;
};

/**
 * Publication d'un jour, **une transaction** sous la garde de l'étape `e` (rejeu borné sans nouvel appel externe, comme
 * l'aperçu, 0081 B9-TL-3 point 4) : la dernière version relue dans la transaction ; si le jour est toujours sans étape, il est
 * remplacé et la version écrite par le module unique (`request_id` dérivé : un rejeu la reconnaît), avec les positions de ses
 * lieux quand la configuration l'autorise ; sinon rien n'est écrit. Puis `last_version` et, pour le dernier jour, la phase finale.
 */
async function publierJour(contexte: ContexteComplet, donnees: DonneesJour): Promise<void> {
  const { organizationId, generationRunId, tripId } = contexte;
  const requestId = requestIdDeVersion(contexte.ligne, donnees.index);
  for (let tentative = 1; tentative <= TENTATIVES_PUBLICATION; tentative += 1) {
    try {
      await contexte.dep.transaction(organizationId, async (tx) => {
        const x = executeurSql(tx);
        const instant = maintenant(contexte);
        if (!(await gardeOuverteAuRang(x, organizationId, generationRunId, contexte.rang, instant))) throw new ArretEtape("step_expired");
        const { version, instantane } = await lireInstantane(x, organizationId, tripId);
        const courant = instantane.days.find((jour) => jour.index === donnees.index);
        if (courant === undefined) throw new ArretEtape("invalid_input");
        // Jour planifié entre-temps (une modification de la personne, ou ce passage au rejeu) : aucune version écrite (revue de
        // la PR 600, mineur 4) ; l'exécution avance sur la dernière version.
        const ecrite = sansEtape(courant)
          ? await ecrireVersion(x, { organizationId, tripId, requestId, auteur: "workflow", instantane: { days: instantane.days.map((jour) => (jour.index === donnees.index ? donnees.jour : jour)) } })
          : { version, creee: false, instantane };
        if (sansEtape(courant) && donnees.ecrirePositions !== undefined) {
          const positions = await donnees.ecrirePositions(x);
          if (!positions.ok && positions.code === "base") {
            if (positions.retryable === true) throw new Error("positions");
            throw new ArretEtape("upstream_error");
          }
        }
        const fin = donnees.dernier
          ? await x.query(SQL_FIN_COMPLET, [organizationId, generationRunId, contexte.rang, phaseFinale(ecrite.instantane, donnees.jours), ecrite.version, instant.toISOString()])
          : await x.query(SQL_JOUR_PUBLIE, [organizationId, generationRunId, contexte.rang, ecrite.version, instant.toISOString()]);
        if (fin.rows.length === 0) throw new ArretEtape("step_expired");
      });
      return;
    } catch (erreur) {
      if (erreur instanceof ArretEtape) throw erreur;
      if (contexte.dep.maintenant() + DELAI_PORT_MS >= contexte.echeance) break;
    }
  }
  throw new ArretEtape("upstream_unavailable");
}

/** Rangs des étapes d'un jour (tests et documentation du workflow). */
export const rangsDuJour = (i: number): Readonly<Record<EtapeJour, number>> => ({ b: rangDuJour(i, "b"), c: rangDuJour(i, "c"), d: rangDuJour(i, "d"), e: rangDuJour(i, "e") });
