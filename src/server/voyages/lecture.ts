import "server-only";

import type { AdapterContext, TripAdapter } from "@/adapters/types";
import {
  DayMapSchema,
  DaySchema,
  PreviewSlotSchema,
  PreviewSlotsSchema,
  ProposalRecordSchema,
  ProposalSchema,
  TimeZoneSchema,
  TripSchema,
  TripSnapshotSchema,
  TripSummarySchema,
  validateDayMap,
  type ChecklistItem,
  type Day,
  type DayMap,
  type DaySnapshot,
  type MapPoint,
  type PreviewSlot,
  type Proposal,
  type ProposalRecord,
  type TripSnapshot,
  type TripSummary,
} from "@/contracts";
import { CHECKLIST_KINDS, countToReserve } from "@/contracts/values";
import type { z } from "zod";
import { ordreDeLecture } from "@/domain/a-faire";
import { retenirApercu, selectionApercu, servisAvantDeblocage } from "@/domain/apercu";
import { destinationColor } from "@/domain/calculs";
import type { ConfigurationMoteur } from "@/domain/configuration";
import { modesAdmis } from "@/domain/generation";
import { jourSansEtape } from "@/domain/jours-planifies";
import { demandeDeRelectures, optionsDesRepas, recomposerJour, recomposerProposition, type JourALire } from "@/domain/recomposition";
import {
  logementsDuJour,
  type DemandeRelectures,
  type ModeTrajet,
  type PorteeLecture,
  type Relectures,
  type SejourDeNuit,
  type SourceRelectures,
} from "@/domain/relectures";
import { CHAINE_APERCU, type ChaineApercu } from "@/server/config/generation";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { EchecPositions, lirePositions } from "@/server/positions/lecture";
import { SQL_DEBLOQUE } from "@/server/presentation/etat";
import { executeurSql, withOrg as withOrgParDefaut, type OrgTransaction } from "@/server/with-org";

import { datesDeVerification, elementAFaire, identifiantLisible, mobiliteDepuisColonne, nombreDeNuits, sejoursParNuit, type VersionDeChaine } from "./conversion";
import { echec, LectureVoyageError, type ContexteEchec } from "./erreurs";

/**
 * Cas d'usage de lecture des voyages (spécification B6, B6a points 1 à 4 ; décision 0086 § 1.1 à § 1.4 et § 1.7) :
 * un par méthode de `TripAdapter`, chacun dans **une** transaction `withOrg` passée en lecture seule
 * (`SET TRANSACTION READ ONLY`, première instruction du rappel, deuxième de la transaction). Chaque requête porte
 * `organization_id = $1`, lié au contexte (double vérification avec la RLS, cadrage § 9), sauf la lecture des positions
 * (`lirePositions`, RLS seule, 0060 § 1.2) ; aucun paramètre ni option ne retire ce filtre.
 *
 * Les champs calculés sont recomposés à la lecture par les fonctions pures de `src/domain/recomposition.ts`, avec les
 * relectures du port `SourceRelectures` injecté (un appel par lecture, hors de la transaction ; jamais pour
 * `listTrips`, `getDayMap` ni `getTripMap`). Aucune valeur relue n'est gardée. Toute donnée incohérente lève l'erreur
 * fermée de `./erreurs` (B6-PO-10), journalisée avec des identifiants internes seulement.
 */

/** Exécuteur de la transaction de lecture (`executeurSql` de `withOrg`). */
export type ExecuteurLecture = ReturnType<typeof executeurSql>;

type FonctionWithOrg = <T>(ctx: Pick<AdapterContext, "organizationId" | "userId">, fn: (tx: OrgTransaction) => Promise<T>) => Promise<T>;

export type DependancesLecture = {
  /** Port de relectures (B6 : le double de `src/mocks/relectures-voyages.ts` ; B8b : Places et Routes). */
  readonly relectures: SourceRelectures;
  /**
   * **Tests seulement** (revue du head 7402324, mineur 5) : `withOrg` de `src/server/with-org.ts` par défaut ; les tests
   * de base injectent celui de leur client. Aucun appelant applicatif ne le pose (B6b branche la fabrique sans lui).
   */
  readonly withOrg?: FonctionWithOrg;
  readonly configuration?: ConfigurationMoteur;
  /**
   * Chaîne de l'aperçu (décision 0136 § 4.2) : choisit la lecture avant le déblocage (§ 3.5) et le badge « à confirmer » d'une
   * étape sans lieu (§ 3.6). Absente : voir `chaineDeLecture`.
   */
  readonly chaine?: ChaineApercu;
};

/**
 * Chaîne d'une lecture (décision 0136 § 4.2), **lue à chaque appel** : celle que nomme le jeu de dépendances ; sinon
 * `CHAINE_APERCU` pour la composition de l'app, qui ne pose jamais `withOrg` (branchement de `src/instrumentation.ts`), et
 * `"ancienne"` pour un jeu de test qui injecte `withOrg` sans nommer la chaîne (les tests existants de la lecture passent sans
 * modification, critère 14).
 */
export function chaineDeLecture(dependances: Pick<DependancesLecture, "chaine" | "withOrg">): ChaineApercu {
  return dependances.chaine ?? (dependances.withOrg === undefined ? CHAINE_APERCU : "ancienne");
}

/**
 * Transaction de lecture (B6-TL-4, 0086 § 1.4) : `withOrg`, puis `SET TRANSACTION READ ONLY` en première instruction du
 * rappel ; toute écriture tentée ensuite échoue (SQLSTATE `25006`). Seul chemin des cas d'usage vers la base.
 */
export async function transactionDeLecture<T>(
  withOrg: FonctionWithOrg,
  ctx: Pick<AdapterContext, "organizationId" | "userId">,
  fn: (executeur: ExecuteurLecture) => Promise<T>,
): Promise<T> {
  return withOrg(ctx, async (tx) => {
    const executeur = executeurSql(tx);
    await executeur.query("SET TRANSACTION READ ONLY");
    return fn(executeur);
  });
}

// --- Requêtes (constantes ; paramètres liés) ------------------------------------------------------------------

const SQL_VOYAGE = `SELECT id, destination, start_date::text AS start, end_date::text AS "end", travellers_adults AS adults,
  travellers_children AS children, time_zone, current_version
  FROM public.trips WHERE organization_id = $1 AND id = $2`;

/** Version courante et ses parents, en **une** requête récursive (B6-PO-6) ; une version ne remonte qu'à une plus ancienne. */
export const SQL_CHAINE = `WITH RECURSIVE chaine AS (
    SELECT v.version, v.parent_version, v.snapshot, v.created_at, 1 AS rang
    FROM public.trip_versions v WHERE v.organization_id = $1 AND v.trip_id = $2 AND v.version = $3
  UNION ALL
    SELECT p.version, p.parent_version, p.snapshot, p.created_at, c.rang + 1
    FROM public.trip_versions p JOIN chaine c ON p.version = c.parent_version AND p.version < c.version
    WHERE p.organization_id = $1 AND p.trip_id = $2
  )
  SELECT version, snapshot, (extract(epoch FROM created_at) * 1000)::float8 AS created_ms FROM chaine ORDER BY rang`;

const SQL_VERSION = `SELECT version, snapshot, (extract(epoch FROM created_at) * 1000)::float8 AS created_ms
  FROM public.trip_versions WHERE organization_id = $1 AND trip_id = $2 AND version = $3`;

/** Séjours : lieu, dates, et de quoi résoudre un logement sans lieu à la lecture (ville, centre maison, types ; 0100 § 6.2). */
const SQL_SEJOURS = `SELECT place_id, from_date::text AS "from", to_date::text AS "to", kind, lodging_kind, city, area_center_lat, area_center_lng
  FROM public.stays WHERE organization_id = $1 AND trip_id = $2`;

const SQL_MOBILITE = "SELECT mobility FROM public.briefs WHERE organization_id = $1 AND trip_id = $2 ORDER BY version DESC LIMIT 1";

const SQL_EN_COURS = `SELECT EXISTS (SELECT 1 FROM public.generation_runs WHERE organization_id = $1 AND trip_id = $2
  AND finished_at IS NULL AND kind IN ('full', 'batch')) AS en_cours`;

/**
 * Ordre stable par `id` à la base (aucune colonne d'ordre dans `checklist_items`) ; l'ordre de l'écran est posé par
 * `checklistDe` (`ordreDeLecture`, décision 0147 § 7.1 point 3).
 */
const SQL_A_FAIRE = `SELECT id, kind, label, moment, done, booking_url, sponsored, stop_id
  FROM public.checklist_items WHERE organization_id = $1 AND trip_id = $2 ORDER BY id`;

/** Propositions `deck` de la dernière exécution qui en a écrit (B6-PO-9). */
const SQL_PROPOSITIONS = `SELECT p.slot_type, p.day, p.time, p.kind, p.content FROM public.proposals p
  WHERE p.organization_id = $1 AND p.trip_id = $2 AND p.phase = 'deck' AND p.generation_run_id = (
    SELECT q.generation_run_id FROM public.proposals q
    JOIN public.generation_runs g ON g.organization_id = q.organization_id AND g.id = q.generation_run_id
    WHERE q.organization_id = $1 AND q.trip_id = $2 AND q.phase = 'deck'
    ORDER BY g.started_at DESC, g.id DESC LIMIT 1)
  ORDER BY p.position`;

/** Cases `preview` de la dernière exécution `preview` du voyage, dans l'ordre de `position` (B6-PO-9). */
const SQL_APERCU = `SELECT p.slot_type, p.day, p.time, p.kind, p.content FROM public.proposals p
  WHERE p.organization_id = $1 AND p.trip_id = $2 AND p.phase = 'preview' AND p.generation_run_id = (
    SELECT g.id FROM public.generation_runs g WHERE g.organization_id = $1 AND g.trip_id = $2 AND g.kind = 'preview'
    ORDER BY g.started_at DESC, g.id DESC LIMIT 1)
  ORDER BY p.position`;

/** « Mes voyages » : voyages visibles et nombre de jours de leur version courante, en une requête. */
const SQL_RESUMES = `SELECT t.id, t.destination, t.start_date::text AS start, t.end_date::text AS "end", t.travellers_adults AS adults,
  t.travellers_children AS children, t.time_zone, t.current_version,
  CASE WHEN jsonb_typeof(v.snapshot -> 'days') = 'array' THEN jsonb_array_length(v.snapshot -> 'days') END AS jours
  FROM public.trips t
  LEFT JOIN public.trip_versions v ON v.organization_id = t.organization_id AND v.trip_id = t.id AND v.version = t.current_version
  WHERE t.organization_id = $1 AND t.current_version IS NOT NULL`;

const SQL_DEBLOQUES = "SELECT DISTINCT trip_id FROM public.entitlements WHERE organization_id = $1 AND kind = 'tripUnlocked'";

const SQL_A_FAIRE_TOUS = "SELECT trip_id, kind, done FROM public.checklist_items WHERE organization_id = $1";

// --- Lecture des lignes -----------------------------------------------------------------------------------

type Ligne = Record<string, unknown>;

const texte = (valeur: unknown): string | undefined => (typeof valeur === "string" ? valeur : undefined);
const entier = (valeur: unknown): number | undefined => (typeof valeur === "number" && Number.isSafeInteger(valeur) ? valeur : undefined);

type EnTete = {
  readonly id: string;
  readonly destination: string;
  readonly start: string;
  readonly end: string;
  readonly travellers: { readonly adults: number; readonly children: number };
  readonly timeZone: string;
  readonly version: number;
};

/**
 * En-tête d'un voyage visible : `null` sans version courante (B6-PO-2, avant tout contrôle) ; fuseau nul :
 * `time_zone_missing` ; fuseau ou colonnes illisibles : `output_invalid`.
 */
function enTeteDe(ligne: Ligne): EnTete | null {
  const version = entier(ligne.current_version);
  if (version === undefined) return null;
  const id = texte(ligne.id);
  const contexte = { ...(id === undefined ? {} : { tripId: id }), version };
  if (ligne.time_zone === null) throw echec("time_zone_missing", contexte);
  const timeZone = TimeZoneSchema.safeParse(ligne.time_zone);
  const destination = texte(ligne.destination);
  const start = texte(ligne.start);
  const end = texte(ligne.end);
  const adults = entier(ligne.adults);
  const children = entier(ligne.children);
  if (!timeZone.success || id === undefined || destination === undefined || start === undefined || end === undefined || adults === undefined || children === undefined) {
    throw echec("output_invalid", contexte);
  }
  return { id, destination, start, end, travellers: { adults, children }, timeZone: timeZone.data, version };
}

function versionDe(ligne: Ligne | undefined, contexte: ContexteEchec): VersionDeChaine {
  const version = entier(ligne?.version);
  const snapshot = TripSnapshotSchema.safeParse(ligne?.snapshot);
  const createdAtMs = ligne?.created_ms;
  if (version === undefined || !snapshot.success || typeof createdAtMs !== "number") {
    throw echec("snapshot_invalid", { ...contexte, ...(version === undefined ? {} : { version }) });
  }
  return { version, snapshot: snapshot.data, createdAtMs };
}

type Besoins = {
  readonly chaine?: boolean;
  readonly sejours?: boolean;
  readonly mobilite?: boolean;
  readonly enCours?: boolean;
  readonly debloque?: boolean;
  readonly checklist?: boolean;
  readonly propositions?: "deck" | "preview";
};

type SejourLu = SejourDeNuit & { readonly from: string; readonly to: string };

const TYPES_SEJOUR: readonly SejourDeNuit["type"][] = ["lodging", "neighbourhood", "none"];
const TYPES_LOGEMENT: readonly NonNullable<SejourDeNuit["logement"]>[] = ["known", "area", "none", "suggestedLodging", "suggestedArea"];

type Etat = {
  readonly enTete: EnTete;
  /** `chaine[0]` : version courante. */
  readonly chaine: readonly VersionDeChaine[];
  readonly snapshot: TripSnapshot;
  readonly sejours: readonly SejourLu[];
  readonly mobilite: unknown;
  readonly enCours: boolean;
  readonly debloque: boolean;
  readonly checklist: readonly Ligne[];
  readonly propositions: readonly Ligne[];
};

/** Lignes d'un voyage dans la transaction de lecture ; `null` pour un voyage inconnu, d'une autre organisation ou sans version courante. */
async function lireEtat(executeur: ExecuteurLecture, ctx: AdapterContext, tripId: string, besoins: Besoins): Promise<Etat | null> {
  const org = ctx.organizationId;
  const [ligne] = (await executeur.query(SQL_VOYAGE, [org, tripId])).rows;
  if (ligne === undefined) return null;
  const enTete = enTeteDe(ligne);
  if (enTete === null) return null;
  const contexte = { tripId, version: enTete.version };
  const lignesVersions = (await executeur.query(besoins.chaine ? SQL_CHAINE : SQL_VERSION, [org, tripId, enTete.version])).rows;
  const chaine = lignesVersions.map((l) => versionDe(l, contexte));
  const courante = chaine[0];
  if (courante === undefined || courante.version !== enTete.version) throw echec("snapshot_invalid", contexte);
  const sejours = besoins.sejours
    ? (await executeur.query(SQL_SEJOURS, [org, tripId])).rows.map((s): SejourLu => {
        const from = texte(s.from);
        const to = texte(s.to);
        const placeId = s.place_id === null ? null : texte(s.place_id);
        const ville = s.city === null ? null : texte(s.city);
        const type = TYPES_SEJOUR.find((t) => t === s.kind);
        const logement = s.lodging_kind === null ? null : (TYPES_LOGEMENT.find((t) => t === s.lodging_kind) ?? undefined);
        const lat = s.area_center_lat === null ? null : s.area_center_lat;
        const lng = s.area_center_lng === null ? null : s.area_center_lng;
        const centre = lat === null && lng === null ? null : typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
        if (from === undefined || to === undefined || placeId === undefined || ville === undefined || type === undefined || logement === undefined || centre === undefined) {
          throw echec("output_invalid", contexte);
        }
        return { placeId, from, to, ville, centre, type, logement };
      })
    : [];
  const mobilite = besoins.mobilite ? ((await executeur.query(SQL_MOBILITE, [org, tripId])).rows[0]?.mobility ?? null) : null;
  const enCours = besoins.enCours ? (await executeur.query(SQL_EN_COURS, [org, tripId])).rows[0]?.en_cours === true : false;
  const debloque = besoins.debloque ? (await executeur.query(SQL_DEBLOQUE, [org, tripId])).rows[0]?.debloque === true : false;
  const checklist = besoins.checklist ? (await executeur.query(SQL_A_FAIRE, [org, tripId])).rows : [];
  const propositions =
    besoins.propositions === undefined ? [] : (await executeur.query(besoins.propositions === "deck" ? SQL_PROPOSITIONS : SQL_APERCU, [org, tripId])).rows;
  return { enTete, chaine, snapshot: courante.snapshot, sejours, mobilite, enCours, debloque, checklist, propositions };
}

// --- Recomposition --------------------------------------------------------------------------------------

/** Prédicat de 0086 § 1.7, partagé avec le voyage complet (`@/domain/jours-planifies`). */
const sansEtape = (jour: DaySnapshot) => jourSansEtape(jour);

/** Séjour de chaque nuit : un voyage dont une nuit n'a pas exactement un séjour est `stay_missing` (B6-PO-17). */
function sejoursDe(etat: Etat, contexte: ContexteEchec): readonly SejourDeNuit[] {
  const sejours = sejoursParNuit(etat.sejours, etat.enTete.start, etat.enTete.end);
  if (sejours === null) throw echec("stay_missing", contexte);
  // Champs du port seulement (ni dates, ni rien d'autre de la ligne lue).
  return sejours.map(({ placeId, ville, centre, type, logement }): SejourDeNuit => ({ placeId, ville, centre, type, logement }));
}

function logementsDe(etat: Etat, contexte: ContexteEchec): (string | null)[] {
  return sejoursDe(etat, contexte).map((sejour) => sejour.placeId);
}

function modesDe(etat: Etat, contexte: ContexteEchec): readonly ModeTrajet[] {
  const modes = mobiliteDepuisColonne(etat.mobilite);
  if (modes === null) throw echec("mobility_invalid", contexte);
  return modesAdmis(modes);
}

/** Session de la lecture et portée du cas d'usage, passées au port avec le voyage (0100 § 3.2 point 1). */
type PorteeDeSession = { readonly ctx: Pick<AdapterContext, "organizationId" | "userId">; readonly portee: PorteeLecture };

/**
 * Un appel du port (0086 § 1.2 point 3) : refus rendu ou exception levée, erreur fermée sans durée inventée. Le contexte
 * (organisation, utilisateur, voyage de la session) et la portée viennent du cas d'usage appelé, jamais de la demande
 * ni du navigateur (0100 § 3.2 point 1).
 */
async function relire(
  source: SourceRelectures,
  etat: Etat,
  sejoursParNuit: readonly SejourDeNuit[],
  session: PorteeDeSession,
  demande: DemandeRelectures,
  contexte: ContexteEchec,
): Promise<Relectures> {
  let reponse: Awaited<ReturnType<SourceRelectures["pour"]>>;
  try {
    reponse = await source.pour(
      {
        logementsParNuit: sejoursParNuit.map((sejour) => sejour.placeId),
        contexte: { organizationId: session.ctx.organizationId, userId: session.ctx.userId, tripId: etat.enTete.id },
        portee: session.portee,
        sejoursParNuit,
      },
      demande,
    );
  } catch {
    throw echec("unavailable", contexte);
  }
  if (!reponse.ok) throw echec(reponse.refus === "quota_reached" ? "quota_reached" : "unavailable", contexte);
  return reponse.relectures;
}

/** Jours d'une lecture : mesurés, sauf un jour sans étape pendant une exécution `full` ou `batch` non terminée (B6-TL-9). */
const joursALire = (etat: Etat, jours: readonly DaySnapshot[]): JourALire[] =>
  jours.map((jour) => ({ jour, mesure: !(etat.enCours && sansEtape(jour)) }));

async function recomposerJours(
  source: SourceRelectures,
  etat: Etat,
  jours: readonly DaySnapshot[],
  session: PorteeDeSession,
  chaine: ChaineApercu,
): Promise<Day[]> {
  const contexte = { tripId: etat.enTete.id, version: etat.enTete.version };
  // Séjours lus une fois : `stay_missing` même quand aucun jour n'est relu, puis passés à `relire`.
  const sejours = sejoursDe(etat, contexte);
  const modes = modesDe(etat, contexte);
  const nuits = nombreDeNuits(etat.enTete.start, etat.enTete.end);
  const aLire = joursALire(etat, jours);
  const relectures = aLire.some((j) => j.mesure)
    ? await relire(source, etat, sejours, session, demandeDeRelectures({ jours: aLire, nombreDeNuits: nuits, modes }), contexte)
    : undefined;
  const verification = datesDeVerification(etat.chaine, etat.enTete.timeZone);
  return aLire.map(({ jour, mesure }) => {
    const resultat = recomposerJour(jour, {
      nombreDeNuits: nuits,
      generating: !mesure,
      ...(relectures === undefined ? {} : { relectures }),
      modes,
      verification,
      // Badge « à confirmer » d'une étape sans lieu, sous la chaîne inversée seulement (0136 § 3.6) ; rien n'est écrit.
      ...(chaine === "inversee" ? { badgeSansLieu: true } : {}),
    });
    if (!resultat.ok) throw echec(resultat.raison, { ...contexte, dayIndex: jour.index });
    return resultat.valeur;
  });
}

function checklistDe(etat: Etat): ChecklistItem[] {
  const contexte = { tripId: etat.enTete.id, version: etat.enTete.version };
  const etapes = new Set(etat.snapshot.days.flatMap((day) => [...day.items.flatMap((item) => (item.type === "stop" ? [item.stop.id] : [])), ...day.events.map((e) => e.id)]));
  const items = etat.checklist.map((ligne) => {
    const stopId = ligne.stop_id === null ? undefined : texte(ligne.stop_id);
    if (stopId !== undefined && !etapes.has(stopId)) throw echec("checklist_orphan", contexte);
    const item = elementAFaire(ligne);
    if (item === null) throw echec("output_invalid", contexte);
    return item;
  });
  // Ordre de l'écran (0147 § 7.1 point 3) : par la position de l'étape liée dans la version courante (jour, puis heure),
  // puis les lignes sans étape (bons plans, lignes faites déliées) par `id`.
  return ordreDeLecture(items, etat.snapshot);
}

/**
 * Journées servies avant le déblocage (décision 0136 § 3.5 ; M1a-PO-2) : sous la chaîne inversée, un voyage sans droit
 * `tripUnlocked` ne sert que **J1 et les journées des cases de l'aperçu**, celles que rend `selectionApercu` avec **le même**
 * `retenir` qu'à l'écriture des cases (`retenirApercu`, `src/domain/apercu.ts`) ; `null` : tout est servi (voyage débloqué, ou
 * ancienne chaîne, dont la version 1 ne porte que J1 et J2).
 */
function lisiblesAvantDeblocage(etat: Etat, chaine: ChaineApercu): ReadonlySet<number> | null {
  if (chaine !== "inversee" || etat.debloque) return null;
  const jours = etat.snapshot.days;
  return selectionApercu(jours, retenirApercu(jours)).jours;
}

type PropositionLue = { readonly record: ProposalRecord; readonly jour: DaySnapshot };

function propositionLue(etat: Etat, ligne: Ligne): PropositionLue {
  const contexte = { tripId: etat.enTete.id, version: etat.enTete.version };
  const record = ProposalRecordSchema.safeParse(ligne.content);
  if (!record.success || record.data.day !== ligne.day || record.data.time !== ligne.time || record.data.kind !== ligne.kind) {
    throw echec("proposal_invalid", contexte);
  }
  const jour = etat.snapshot.days.find((day) => day.index === record.data.day);
  if (jour === undefined) throw echec("proposal_day_missing", { ...contexte, dayIndex: record.data.day });
  if (record.data.travelFromPrevious !== undefined && record.data.stop.placeId === undefined) throw echec("proposal_invalid", contexte);
  return { record: record.data, jour };
}

async function recomposerPropositions(
  source: SourceRelectures,
  etat: Etat,
  lues: readonly PropositionLue[],
  configuration: ConfigurationMoteur,
  session: PorteeDeSession,
): Promise<Proposal[]> {
  if (lues.length === 0) return [];
  const contexte = { tripId: etat.enTete.id, version: etat.enTete.version };
  const sejours = sejoursDe(etat, contexte);
  const nuits = nombreDeNuits(etat.enTete.start, etat.enTete.end);
  const demande = demandeDeRelectures({ jours: [], propositions: lues.map(({ record, jour }) => ({ proposition: record, jour })), nombreDeNuits: nuits, modes: [] });
  const relectures = await relire(source, etat, sejours, session, demande, contexte);
  const options = optionsDesRepas(lues.map(({ record }) => record));
  return lues.map(({ record, jour }, rang) => {
    const option = options[rang];
    const resultat = recomposerProposition(record, jour, {
      nombreDeNuits: nuits,
      generating: etat.enCours && sansEtape(jour),
      relectures,
      configuration,
      ...(option === undefined ? {} : { option }),
    });
    if (!resultat.ok) throw echec(resultat.raison, { ...contexte, dayIndex: jour.index });
    return resultat.valeur;
  });
}

/** Points de carte d'un jour stocké (B6-TL-3, B6-PO-17, B6-PO-18) : logements et étapes qui ont une position. */
function carteDuJour(etat: Etat, jour: DaySnapshot, logements: readonly (string | null)[], positions: ReadonlyMap<string, { lat: number; lng: number }>): DayMap | null {
  if (sansEtape(jour)) return null;
  const { depart, arrivee } = logementsDuJour(jour.index - 1, logements.length);
  const terminus = (role: "start" | "end"): MapPoint[] => {
    if (!jour.items.some((item) => item.type === "terminus" && item.role === role)) return [];
    const placeId = logements[role === "start" ? depart : arrivee] ?? null;
    const position = placeId === null ? undefined : positions.get(placeId);
    return position === undefined ? [] : [{ ref: { type: "terminus", role }, lat: position.lat, lng: position.lng }];
  };
  const etapes: MapPoint[] = jour.items.flatMap((item) => {
    if (item.type !== "stop" || item.stop.placeId === undefined) return [];
    const position = positions.get(item.stop.placeId);
    return position === undefined ? [] : [{ ref: { type: "stop" as const, stopId: item.stop.id }, lat: position.lat, lng: position.lng }];
  });
  const points = [...terminus("start"), ...etapes, ...terminus("end")];
  if (points.length === 0) return null;
  const contexte = { tripId: etat.enTete.id, version: etat.enTete.version, dayIndex: jour.index };
  const carte = DayMapSchema.safeParse({ tripId: etat.enTete.id, dayIndex: jour.index, points });
  // Contrôle sur le jour **stocké** (B6-TL-11 (a), 0086 § 1.8) : `validateDayMap` accepte le `DaySnapshot` tel quel.
  if (!carte.success || validateDayMap(jour, carte.data, etat.enTete.id).length > 0) throw echec("output_invalid", contexte);
  return carte.data;
}

function placeIdsDesCartes(jours: readonly DaySnapshot[], logements: readonly (string | null)[]): string[] {
  const ids = new Set<string>();
  for (const logement of logements) if (logement !== null) ids.add(logement);
  for (const jour of jours) for (const item of jour.items) if (item.type === "stop" && item.stop.placeId !== undefined) ids.add(item.stop.placeId);
  return [...ids];
}

async function positionsDe(executeur: ExecuteurLecture, placeIds: readonly string[], contexte: ContexteEchec) {
  try {
    return await lirePositions(executeur, placeIds);
  } catch (erreur) {
    if (erreur instanceof EchecPositions) throw echec("output_invalid", contexte);
    throw erreur;
  }
}

function sortie<T>(schema: z.ZodType<T>, valeur: unknown, contexte: ContexteEchec): T {
  const resultat = schema.safeParse(valeur);
  if (!resultat.success) throw echec("output_invalid", contexte);
  return resultat.data;
}

// --- Cas d'usage ------------------------------------------------------------------------------------------

/** Les sept lectures de `TripAdapter` sur la base (B6a point 1) ; l'état du tri est lu par `src/server/presentation/lecture.ts` (B10a). */
export function creerLectureVoyages(dependances: DependancesLecture): Omit<TripAdapter, "getDeckSession"> {
  const withOrg = dependances.withOrg ?? withOrgParDefaut;
  const source = dependances.relectures;
  const configuration = dependances.configuration ?? CONFIGURATION_MOTEUR;
  /** Chaîne de la lecture, lue à chaque appel (0136 § 4.2). */
  const chaine = () => chaineDeLecture(dependances);
  /**
   * Transaction de lecture d'un cas d'usage. Toute erreur autre que l'erreur fermée (base injoignable, requête en
   * échec, contexte refusé par `withOrg`) devient `unavailable` (B6-PO-10 ; revue du head 7402324, mineur 8) : ni
   * son message (texte SQL, identifiants internes) ni sa pile ne remontent ni ne sont journalisés.
   */
  const lire = async <T>(ctx: AdapterContext, fn: (executeur: ExecuteurLecture) => Promise<T>, tripId?: string): Promise<T> => {
    try {
      return await transactionDeLecture(withOrg, ctx, fn);
    } catch (erreur) {
      if (erreur instanceof LectureVoyageError) throw erreur;
      throw echec("unavailable", tripId === undefined ? {} : { tripId }, "base");
    }
  };

  return {
    async listTrips(ctx) {
      const org = ctx.organizationId;
      const { lignes, debloques, aFaire } = await lire(ctx, async (executeur) => ({
        lignes: (await executeur.query(SQL_RESUMES, [org])).rows,
        debloques: new Set((await executeur.query(SQL_DEBLOQUES, [org])).rows.map((l) => l.trip_id)),
        aFaire: (await executeur.query(SQL_A_FAIRE_TOUS, [org])).rows,
      }));
      return lignes.map((ligne): TripSummary => {
        const enTete = enTeteDe(ligne);
        if (enTete === null) throw echec("output_invalid");
        const contexte = { tripId: enTete.id, version: enTete.version };
        const jours = entier(ligne.jours);
        if (jours === undefined) throw echec("snapshot_invalid", contexte);
        return sortie(
          TripSummarySchema,
          {
            id: enTete.id,
            destination: enTete.destination,
            destinationColor: destinationColor(enTete.destination),
            start: enTete.start,
            end: enTete.end,
            timeZone: enTete.timeZone,
            travellers: enTete.travellers,
            unlocked: debloques.has(enTete.id),
            toReserveCount: countToReserve(
              aFaire
                .filter((l) => l.trip_id === enTete.id)
                // Seules les réservations comptent (décision 0147 § 6.2). Une sorte hors de `CHECKLIST_KINDS` (que le `CHECK`
                // de la base ferme déjà) n'est jamais ramenée à une autre : lecture refusée, `output_invalid` journalisé.
                .map((l) => {
                  const kind = CHECKLIST_KINDS.find((sorte) => sorte === l.kind);
                  if (kind === undefined) throw echec("output_invalid", contexte);
                  return { done: l.done === true, kind };
                }),
            ),
            dayCount: jours,
          },
          contexte,
        );
      });
    },

    async getTrip(ctx, tripId) {
      if (!identifiantLisible(tripId)) return null;
      const laChaine = chaine();
      const etat = await lire(
        ctx,
        (executeur) => lireEtat(executeur, ctx, tripId, { chaine: true, sejours: true, mobilite: true, enCours: true, debloque: true, checklist: true }),
        tripId,
      );
      if (etat === null) return null;
      // Contrôle `checklist_orphan` sur l'instantané entier, puis filtre avant le déblocage (0136 § 3.5) : journées et lignes
      // « À faire » de l'aperçu seulement, **avant** toute relecture (une journée non servie n'est jamais relue).
      const toutes = checklistDe(etat);
      const lisibles = lisiblesAvantDeblocage(etat, laChaine);
      const servis = lisibles === null ? { jours: etat.snapshot.days, aFaire: toutes } : servisAvantDeblocage(etat.snapshot.days, toutes, lisibles);
      const checklist = servis.aFaire;
      const days = await recomposerJours(source, etat, servis.jours, { ctx, portee: "voyage" }, laChaine);
      const { enTete } = etat;
      return sortie(
        TripSchema,
        {
          id: enTete.id,
          organizationId: ctx.organizationId,
          destination: enTete.destination,
          destinationColor: destinationColor(enTete.destination),
          start: enTete.start,
          end: enTete.end,
          timeZone: enTete.timeZone,
          travellers: enTete.travellers,
          days,
          checklist,
          unlocked: etat.debloque,
        },
        { tripId: enTete.id, version: enTete.version },
      );
    },

    async getDay(ctx, tripId, index) {
      if (!identifiantLisible(tripId)) return null;
      const laChaine = chaine();
      const inversee = laChaine === "inversee";
      const etat = await lire(
        ctx,
        (executeur) => lireEtat(executeur, ctx, tripId, { chaine: true, sejours: true, mobilite: true, enCours: true, ...(inversee ? { debloque: true } : {}) }),
        tripId,
      );
      const jour = etat?.snapshot.days.find((day) => day.index === index);
      if (etat === null || jour === undefined) return null;
      // Journée hors de l'aperçu d'un voyage non débloqué (chaîne inversée, 0136 § 3.5) : `null`, sans relecture.
      if (lisiblesAvantDeblocage(etat, laChaine)?.has(index) === false) return null;
      const [day] = await recomposerJours(source, etat, [jour], { ctx, portee: "jour" }, laChaine);
      const contexte = { tripId, version: etat.enTete.version, dayIndex: index };
      if (day === undefined) throw echec("output_invalid", contexte);
      // Sortie validée ici comme les autres lectures (revue du head 7402324, bloquant 1) : une durée relue invalide
      // (minutes non entières ou négatives) est l'erreur fermée `output_invalid`, journalisée, jamais une `ZodError`.
      return sortie(DaySchema, day, contexte);
    },

    async listProposals(ctx, tripId) {
      if (!identifiantLisible(tripId)) return [];
      const etat = await lire(ctx, (executeur) => lireEtat(executeur, ctx, tripId, { sejours: true, enCours: true, propositions: "deck" }), tripId);
      if (etat === null) return [];
      const lues = etat.propositions.filter((ligne) => ligne.slot_type === "proposal").map((ligne) => propositionLue(etat, ligne));
      const propositions = await recomposerPropositions(source, etat, lues, configuration, { ctx, portee: "jour" });
      return sortie(ProposalSchema.array(), propositions, { tripId, version: etat.enTete.version });
    },

    async listPreviewSlots(ctx, tripId) {
      if (!identifiantLisible(tripId)) return [];
      const etat = await lire(ctx, (executeur) => lireEtat(executeur, ctx, tripId, { sejours: true, enCours: true, propositions: "preview" }), tripId);
      if (etat === null) return [];
      const contexte = { tripId, version: etat.enTete.version };
      const lues = etat.propositions.filter((ligne) => ligne.slot_type === "proposal").map((ligne) => propositionLue(etat, ligne));
      const propositions = await recomposerPropositions(source, etat, lues, configuration, { ctx, portee: "jour" });
      let rang = 0;
      const cases = etat.propositions.map((ligne): PreviewSlot => {
        if (ligne.slot_type === "proposal") {
          const proposal = propositions[rang];
          rang += 1;
          if (proposal === undefined) throw echec("output_invalid", contexte);
          return { type: "proposal", proposal };
        }
        if (ligne.content !== null) throw echec("proposal_invalid", contexte);
        return sortie(PreviewSlotSchema, { type: "noOption", day: ligne.day, time: ligne.time, kind: ligne.kind }, contexte);
      });
      return sortie(PreviewSlotsSchema, cases, contexte);
    },

    async getDayMap(ctx, tripId, index) {
      if (!identifiantLisible(tripId)) return null;
      const laChaine = chaine();
      return lire(ctx, async (executeur) => {
        const etat = await lireEtat(executeur, ctx, tripId, { sejours: true, ...(laChaine === "inversee" ? { debloque: true } : {}) });
        const jour = etat?.snapshot.days.find((day) => day.index === index);
        if (etat === null || jour === undefined || sansEtape(jour)) return null;
        // Hors de l'aperçu d'un voyage non débloqué (chaîne inversée, 0136 § 3.5) : `null`, **avant** toute lecture de position.
        if (lisiblesAvantDeblocage(etat, laChaine)?.has(index) === false) return null;
        const contexte = { tripId, version: etat.enTete.version, dayIndex: index };
        const logements = logementsDe(etat, contexte);
        const positions = await positionsDe(executeur, placeIdsDesCartes([jour], logementsDesJours([jour], logements)), contexte);
        return carteDuJour(etat, jour, logements, positions);
      }, tripId);
    },

    async getTripMap(ctx, tripId) {
      if (!identifiantLisible(tripId)) return [];
      const laChaine = chaine();
      return lire(ctx, async (executeur) => {
        const etat = await lireEtat(executeur, ctx, tripId, { sejours: true, ...(laChaine === "inversee" ? { debloque: true } : {}) });
        if (etat === null) return [];
        const contexte = { tripId, version: etat.enTete.version };
        const logements = logementsDe(etat, contexte);
        // Journées de l'aperçu seulement pour un voyage non débloqué (chaîne inversée, 0136 § 3.5), **avant** `positionsDe`.
        const lisibles = lisiblesAvantDeblocage(etat, laChaine);
        const jours = etat.snapshot.days.filter((jour) => !sansEtape(jour) && (lisibles === null || lisibles.has(jour.index)));
        // Une seule lecture des positions pour tous les jours (0086 § 1.3 point 1).
        const positions = await positionsDe(executeur, placeIdsDesCartes(jours, logementsDesJours(jours, logements)), contexte);
        return jours.flatMap((jour) => {
          const carte = carteDuJour(etat, jour, logements, positions);
          return carte === null ? [] : [carte];
        });
      }, tripId);
    },
  };
}

/** Logements de départ et d'arrivée des jours demandés (B6-PO-17), `null` pour un logement sans lieu. */
function logementsDesJours(jours: readonly DaySnapshot[], logements: readonly (string | null)[]): (string | null)[] {
  return jours.flatMap((jour) => {
    const { depart, arrivee } = logementsDuJour(jour.index - 1, logements.length);
    return [logements[depart] ?? null, logements[arrivee] ?? null];
  });
}

// --- Révision enregistrée (M1g, PR 869 ; découpage admis par la décision 0145 § 3) ---------------------------------

/**
 * Ce qu'une révision lit comme la lecture (tâche M1g, PR 869 : `src/server/versions/remplacement.ts`) : version courante et
 * sa chaîne, séjour de chaque nuit, modes admis. Mêmes requêtes et mêmes erreurs fermées que `lireEtat` ; **aucun** appel du
 * port ici (il se fait hors de la transaction, par `relireRevision`).
 */
export type BaseDeRevision = {
  readonly tripId: string;
  readonly start: string;
  readonly end: string;
  readonly timeZone: string;
  readonly version: number;
  readonly snapshot: TripSnapshot;
  readonly chaine: readonly VersionDeChaine[];
  readonly sejours: readonly SejourDeNuit[];
  readonly modes: readonly ModeTrajet[];
  readonly nuits: number;
};

export async function lireBaseDeRevision(executeur: ExecuteurLecture, ctx: AdapterContext, tripId: string): Promise<BaseDeRevision | null> {
  const etat = await lireEtat(executeur, ctx, tripId, { chaine: true, sejours: true, mobilite: true });
  if (etat === null) return null;
  const contexte = { tripId, version: etat.enTete.version };
  return {
    tripId,
    start: etat.enTete.start,
    end: etat.enTete.end,
    timeZone: etat.enTete.timeZone,
    version: etat.enTete.version,
    snapshot: etat.snapshot,
    chaine: etat.chaine,
    sejours: sejoursDe(etat, contexte),
    modes: modesDe(etat, contexte),
    nuits: nombreDeNuits(etat.enTete.start, etat.enTete.end),
  };
}

/** Un appel du port pour une révision : même contexte de session, même portée (`jour`) et mêmes erreurs fermées que la lecture. */
export async function relireRevision(
  source: SourceRelectures,
  ctx: Pick<AdapterContext, "organizationId" | "userId">,
  base: BaseDeRevision,
  demande: DemandeRelectures,
): Promise<Relectures> {
  const contexte = { tripId: base.tripId, version: base.version };
  let reponse: Awaited<ReturnType<SourceRelectures["pour"]>>;
  try {
    reponse = await source.pour(
      {
        logementsParNuit: base.sejours.map((sejour) => sejour.placeId),
        contexte: { organizationId: ctx.organizationId, userId: ctx.userId, tripId: base.tripId },
        portee: "jour",
        sejoursParNuit: base.sejours,
      },
      demande,
    );
  } catch {
    throw echec("unavailable", contexte);
  }
  if (!reponse.ok) throw echec(reponse.refus === "quota_reached" ? "quota_reached" : "unavailable", contexte);
  return reponse.relectures;
}

/**
 * Jour d'une révision recomposé comme la lecture d'une Journée (durées, budget, `toConfirm`, `verifiedAt`), sur la chaîne
 * `chaine` (version de la révision en tête). Rien n'est écrit ; les durées ne sortent que dans la réponse.
 */
export function recomposerJourDeRevision(
  base: BaseDeRevision,
  jour: DaySnapshot,
  relectures: Relectures,
  chaine: readonly VersionDeChaine[],
  chaineDApercu: ChaineApercu = CHAINE_APERCU,
): Day {
  const resultat = recomposerJour(jour, {
    nombreDeNuits: base.nuits,
    generating: false,
    relectures,
    modes: base.modes,
    verification: datesDeVerification(chaine, base.timeZone),
    ...(chaineDApercu === "inversee" ? { badgeSansLieu: true } : {}),
  });
  if (!resultat.ok) throw echec(resultat.raison, { tripId: base.tripId, version: base.version, dayIndex: jour.index });
  return resultat.valeur;
}

// --- Signalement d'une erreur sur une étape (M5c, ticket 904 ; décision 0147 § 1 point 4) ---------------------------

/**
 * Jours de la version courante qu'un signalement peut viser (`reportStop`, `src/server/voyages/signalement.ts`) : tous les
 * jours d'un voyage débloqué (ou lu sur l'ancienne chaîne) ; **avant le déblocage** sur la chaîne inversée, les seules
 * journées servies (`servisAvantDeblocage`, même sélection que la lecture, 0136 § 3.5), pour qu'une étape d'une journée
 * cachée rende `not_found` comme une étape inconnue. Mêmes requêtes et mêmes erreurs fermées que `lireEtat`, dans la
 * transaction de l'appelant ; aucun appel du port de relectures. `null` : voyage inconnu, d'une autre organisation ou
 * sans version courante.
 */
export async function lireJoursSignalables(
  executeur: ExecuteurLecture,
  ctx: AdapterContext,
  tripId: string,
  chaine: ChaineApercu,
): Promise<readonly DaySnapshot[] | null> {
  const etat = await lireEtat(executeur, ctx, tripId, { debloque: true });
  if (etat === null) return null;
  const lisibles = lisiblesAvantDeblocage(etat, chaine);
  return lisibles === null ? etat.snapshot.days : servisAvantDeblocage(etat.snapshot.days, [], lisibles).jours;
}
