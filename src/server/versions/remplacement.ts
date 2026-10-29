import "server-only";

import { z } from "zod";

import type { AdapterContext } from "@/adapters/types";
import {
  CategorySchema,
  PaceSchema,
  PreferenceReasonSchema,
  StopFactsSchema,
  TripCommitmentSchema,
  TripPatchSchema,
  TripSnapshotSchema,
  fail,
  ok,
  type Brief,
  type Category,
  type Day,
  type DaySnapshot,
  type ReplacementOffer,
  type ReplacementWrite,
  type Result,
  type StopSnapshot,
  type TripCommitment,
  type TripPatch,
  type TripSnapshot,
} from "@/contracts";
import { WISH_MAX_LENGTH } from "@/contracts/values";
import type { ConfigurationMoteur } from "@/domain/configuration";
import type { CandidatMoteur, EntreeMoteur, Nuit } from "@/domain/entrees";
import { appliquerPatch, type ResultatPatch } from "@/domain/patch";
import { demandeDeRelectures } from "@/domain/recomposition";
import { INCONNU, type DemandeRelectures, type Relectures, type SourceRelectures } from "@/domain/relectures";
import { CONFIGURATION_CLASSEMENT } from "@/server/config/classement";
import { CONFIGURATION_IA } from "@/server/config/ia";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { errorNameOf, logEvent } from "@/server/log";
import { SQL_VERROU_TRI } from "@/server/presentation/etat";
import { executerActionVoyage, RefusAction, type DependancesAction, type ExecuteurAction } from "@/server/voyages/actions";
import { sejoursParNuit, type VersionDeChaine } from "@/server/voyages/conversion";
import { lireBaseDeRevision, recomposerJourDeRevision, relireRevision, type BaseDeRevision } from "@/server/voyages/lecture";

import { BaseDeVersionDepassee, ecrireVersion, verrouillerVersions } from "./ecrire";

/**
 * Remplacer une étape sur l'adaptateur `api` (écran 14 ; tâche M1g, ticket 869 ; plan `docs/plans/mvp-etapes-1-9.md`,
 * étape 1) : par une **autre proposition déjà vérifiée du voyage** (ligne `proposals` liée à sa ligne `candidates`), en une
 * nouvelle version calculée **par le moteur** (`appliquerPatch`, opération `replace` dont `candidateId` est `candidates.id` ;
 * décision 0037 B2-TL-3 : le patch écrit est celui que le moteur a appliqué, rejouable tel quel), annulable par une version
 * de plus (opération `revert`, PO-5). Trois cas d'usage, dans le cadre commun des actions sur un voyage :
 *
 * - `proposerRemplacement` : lecture seule (aucun aperçu gardé) ; jours touchés recomposés comme une lecture (durées du port
 *   de relectures, budget), changements du moteur ;
 * - `appliquerRemplacement` : même calcul, puis écriture de la version sous les verrous ;
 * - `annulerRemplacement` : `revert` vers la version de base du remplacement si la version courante est encore la sienne.
 *
 * Ordre d'un calcul : (1) transaction en lecture seule (version, séjours, brief, engagements, propositions) ; (2) **un** appel
 * du port de relectures, hors de toute transaction et sans verrou tenu (`ecrire.ts` : aucun appel externe sous le verrou des
 * versions) ; (3) pour l'application, transaction d'écriture : verrou du tri, verrou des versions (0119 § 1.6), idempotence
 * par `requestId`, refus pendant un recalcul, contrôle de la version de base (instantané inchangé depuis l'étape 1), moteur,
 * écriture. Les durées ne sont jamais écrites (`TripSnapshotSchema`) : seules les réponses les portent. Aucun prompt.
 * Le souhait saisi (`wish`) est reçu et ignoré : ni stocké, ni journalisé (F7-PO-3) ; la raison ne choisit pas encore la
 * proposition (question au Product Owner, PR 869).
 */

export type DependancesRemplacement = DependancesAction & {
  /** Port de relectures de la lecture (`DependancesLecture.relectures` de l'adaptateur `api`). */
  readonly relectures: SourceRelectures;
  /** **Tests seulement** : configuration du moteur (`CONFIGURATION_MOTEUR` par défaut). */
  readonly configuration?: ConfigurationMoteur;
};

/** Identifiant d'étape (`Stop.id`) reçu de l'écran : borné, jamais interprété. */
const StopIdSchema = z.string().min(1).max(200);
/** Version de base (0016 § 4.1 : entier ≥ 0) ; une version 0 n'existe jamais, elle donne `conflict`. */
const VersionSchema = z.number().int().nonnegative();

export const DemandeApercuSchema = z.strictObject({
  tripId: z.string(),
  stopId: StopIdSchema,
  reason: PreferenceReasonSchema,
  wish: z.string().trim().min(1).max(WISH_MAX_LENGTH).optional(),
  baseVersion: VersionSchema,
});

export const DemandeApplicationSchema = z.strictObject({
  tripId: z.string(),
  requestId: z.uuid(),
  stopId: StopIdSchema,
  /** Candidat de l'aperçu (`candidates.id`), revérifié à l'application. */
  candidateId: z.uuid(),
  baseVersion: VersionSchema,
});

export const DemandeAnnulationSchema = z.strictObject({
  tripId: z.string(),
  requestId: z.uuid(),
  /** Version écrite par le remplacement à annuler. */
  version: VersionSchema,
});

// --- Fonctions pures -------------------------------------------------------------------------------------------

/** Proposition déjà vérifiée du voyage et son candidat (`proposals` jointe à `candidates`). */
export type PropositionDuVoyage = { readonly proposalId: string; readonly day: number; readonly candidat: CandidatMoteur };

type Situee = { readonly jour: DaySnapshot; readonly stop: StopSnapshot };

/** Étape `stop` de la ligne d'un jour, avec son jour. */
export function etapeSituee(instantane: TripSnapshot, stopId: string): Situee | undefined {
  for (const jour of instantane.days) {
    const item = jour.items.find((i) => i.type === "stop" && i.stop.id === stopId);
    if (item?.type === "stop") return { jour, stop: item.stop };
  }
  return undefined;
}

/** `placeId` et identifiants déjà présents dans le programme (étapes, événements, idées « Surprends-moi »). */
function presents(instantane: TripSnapshot): { lieux: Set<string>; ids: Set<string> } {
  const lieux = new Set<string>();
  const ids = new Set<string>();
  const noter = (id: string, placeId: string | undefined) => {
    ids.add(id);
    if (placeId !== undefined) lieux.add(placeId);
  };
  for (const jour of instantane.days) {
    for (const item of jour.items) if (item.type === "stop") noter(item.stop.id, item.stop.placeId);
    for (const evenement of jour.events) noter(evenement.id, evenement.placeId);
    if (jour.surprise !== undefined) noter(jour.surprise.id, jour.surprise.placeId);
  }
  return { lieux, ids };
}

/** Identifiant de l'étape créée : fixé par la version de base et le candidat (le même à l'aperçu et à l'application). */
export function identifiantRemplacement(baseVersion: number, candidateId: string): string {
  return `remplacement-v${baseVersion + 1}-${candidateId.slice(0, 8)}`;
}

export type RefusDuChoix = "unknown_stop" | "locked_stop" | "no_option";

export type ChoixRetenu = { readonly ok: true; readonly situee: Situee; readonly proposition: PropositionDuVoyage };
export type ChoixRemplacement = ChoixRetenu | { readonly ok: false; readonly refus: RefusDuChoix };

/**
 * Proposition retenue pour remplacer `stopId` : la première compatible de `propositions` (dans l'ordre reçu), ou celle du
 * candidat `candidateId` (application : le candidat de l'aperçu, revérifié). Compatible : même nature (`activity` ou
 * `meal`), un `placeId`, lieu et identifiant créé absents du programme courant. Refus : étape inconnue (ou hors de la ligne
 * d'un jour), verrouillée, engagement (jamais remplacé), désignée par une ligne « À faire » (`etapesAFaire`, sinon la lecture
 * échouerait sur `checklist_orphan` ; question au Product Owner, PR 869), ou aucune proposition compatible.
 */
export function choisirRemplacement(entree: {
  readonly instantane: TripSnapshot;
  readonly baseVersion: number;
  readonly stopId: string;
  readonly propositions: readonly PropositionDuVoyage[];
  readonly etapesAFaire: ReadonlySet<string>;
  readonly candidateId?: string;
}): ChoixRemplacement {
  const situee = etapeSituee(entree.instantane, entree.stopId);
  if (situee === undefined) return { ok: false, refus: "unknown_stop" };
  const ancienne = situee.stop;
  if (ancienne.locked) return { ok: false, refus: "locked_stop" };
  if (ancienne.commitment !== undefined || entree.etapesAFaire.has(ancienne.id)) return { ok: false, refus: "no_option" };
  const { lieux, ids } = presents(entree.instantane);
  const compatible = ({ candidat }: PropositionDuVoyage) =>
    candidat.typeEtape === ancienne.kind &&
    candidat.placeId !== undefined &&
    !lieux.has(candidat.placeId) &&
    !ids.has(identifiantRemplacement(entree.baseVersion, candidat.id));
  const proposition =
    entree.candidateId === undefined
      ? entree.propositions.find(compatible)
      : entree.propositions.find((p) => p.candidat.id === entree.candidateId && compatible(p));
  return proposition === undefined ? { ok: false, refus: "no_option" } : { ok: true, situee, proposition };
}

/** Patch `replace` du choix, sur la version de base (celui que le moteur applique et que le serveur écrit). */
export function patchDuRemplacement(requestId: string, baseVersion: number, choix: ChoixRetenu): TripPatch {
  return TripPatchSchema.parse({
    requestId,
    baseVersion,
    operations: [
      {
        op: "replace",
        stopId: choix.situee.stop.id,
        candidateId: choix.proposition.candidat.id,
        newStopId: identifiantRemplacement(baseVersion, choix.proposition.candidat.id),
      },
    ],
  });
}

/**
 * Demande de relectures d'un remplacement : le jour de base, et le même jour où l'étape remplacée prend le lieu du candidat
 * (mêmes voisins, même ordre) : lieux, plages et couples de trajets dont le moteur a besoin pour replanifier et valider ce
 * jour, et la recomposition pour l'afficher.
 */
export function demandeDuRemplacement(base: Pick<BaseDeRevision, "nuits" | "modes">, choix: ChoixRetenu): DemandeRelectures {
  const { jour, stop } = choix.situee;
  const lieu = choix.proposition.candidat.placeId;
  const provisoire: DaySnapshot = {
    ...jour,
    items: jour.items.map((item) =>
      item.type === "stop" && item.stop.id === stop.id ? { type: "stop", stop: { ...item.stop, ...(lieu === undefined ? {} : { placeId: lieu }) } } : item,
    ),
  };
  return demandeDeRelectures({ jours: [{ jour, mesure: true }, { jour: provisoire, mesure: true }], nombreDeNuits: base.nuits, modes: base.modes });
}

/** Relectures sans aucune valeur : l'annulation recopie un instantané, sans replanifier ni valider. */
export const RELECTURES_INCONNUES: Relectures = { validite: () => INCONNU, plages: () => INCONNU, duree: () => INCONNU };

/** Contexte du voyage lu pour le moteur (en plus de la base de la lecture). */
export type ContexteVoyage = {
  readonly base: BaseDeRevision;
  readonly brief: Brief;
  readonly nuits: readonly Nuit[];
  readonly engagements: readonly TripCommitment[];
  readonly destination: string;
  readonly travellers: { readonly adults: number; readonly children: number };
};

/** Date du jour (AAAA-MM-JJ) dans le fuseau du voyage ; jamais lue par `appliquerPatch`, posée pour l'entrée complète. */
function dateDuJour(fuseau: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit" }).format(Date.now());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Entrée du moteur d'un patch du voyage (champs de `EntreeMoteur` sans `version`, dérivée du patch). */
export function entreeMoteurDeRevision(
  contexte: ContexteVoyage,
  candidats: readonly CandidatMoteur[],
  relectures: Relectures,
  configuration: ConfigurationMoteur = CONFIGURATION_MOTEUR,
): Omit<EntreeMoteur, "version"> {
  const { base } = contexte;
  return {
    voyage: { destination: contexte.destination, start: base.start, end: base.end, timeZone: base.timeZone, travellers: { ...contexte.travellers } },
    brief: contexte.brief,
    nuits: [...contexte.nuits],
    engagements: [...contexte.engagements],
    candidats,
    evenements: [],
    idees: [],
    choix: new Map(),
    configuration,
    // Classement et âge des sources : lus par `generer` seulement, jamais par `appliquerPatch` ; valeurs de la génération
    // (décision 0145 § 5).
    classement: { formule: CONFIGURATION_CLASSEMENT, ageSourceMaxJours: CONFIGURATION_IA.profils.apercu.ageSourceMaxJours },
    relectures,
    porteeR1: { evenementsSansLieu: "admis" },
    dateReference: dateDuJour(base.timeZone),
    budgetTrajetReduit: false,
  };
}

/** Étapes dont l'heure change ou qui apparaissent dans les jours touchés (surlignées après « Appliquer »), la cible d'abord. */
function etapesChangees(avant: TripSnapshot, apres: TripSnapshot, jours: readonly number[], cible: string): string[] {
  const ids = [cible];
  for (const index of jours) {
    const jourAvant = avant.days.find((j) => j.index === index);
    const jourApres = apres.days.find((j) => j.index === index);
    const anciennes = new Map(jourAvant?.items.flatMap((i) => (i.type === "stop" ? [[i.stop.id, i.stop] as const] : [])) ?? []);
    for (const item of jourApres?.items ?? []) {
      if (item.type !== "stop" || item.stop.id === cible) continue;
      const ancienne = anciennes.get(item.stop.id);
      if (ancienne === undefined || ancienne.start !== item.stop.start || ancienne.end !== item.stop.end) ids.push(item.stop.id);
    }
  }
  return ids;
}

/** Donnée lue incohérente : convertie en `internal` par le cadre (journalisée sans valeur). */
class RemplacementIncoherent extends Error {
  override name = "RemplacementIncoherent";
}

/**
 * Brouillon de l'aperçu depuis le résultat du moteur : jours touchés recomposés comme une lecture sur la chaîne où la
 * version du remplacement est en tête (dates de contrôle comprises), changements du moteur (trajets et budget compris),
 * étape proposée.
 */
export function brouillonDuRemplacement(
  contexte: ContexteVoyage,
  resultat: Extract<ResultatPatch, { ok: true }>,
  relectures: Relectures,
  cible: string,
  maintenant: number,
): Extract<ReplacementOffer, { status: "offer" }>["draft"] {
  const { base } = contexte;
  const chaine: VersionDeChaine[] = [{ version: base.version + 1, snapshot: resultat.instantane, createdAtMs: maintenant }, ...base.chaine];
  const jours = resultat.resultat.touchedDays;
  const days: Day[] = resultat.instantane.days.filter((j) => jours.includes(j.index)).map((jour) => recomposerJourDeRevision(base, jour, relectures, chaine));
  const proposal = days.flatMap((d) => d.items.flatMap((i) => (i.type === "stop" && i.stop.id === cible ? [i.stop] : []))).at(0);
  if (proposal === undefined) throw new RemplacementIncoherent();
  return {
    days,
    changes: resultat.resultat.changes,
    changedStopIds: etapesChangees(base.snapshot, resultat.instantane, jours, cible),
    targetStopId: cible,
    proposal,
    // Toujours une proposition déjà vérifiée du voyage (aucune recherche nouvelle) : `replace_applied.from_reserve` vrai.
    fromReserve: true,
  };
}

// --- Requêtes (constantes ; paramètres liés) ------------------------------------------------------------------

const SQL_COURANTE = "SELECT current_version FROM public.trips WHERE organization_id = $1 AND id = $2";
const SQL_VOYAGE = "SELECT destination, travellers_adults AS adults, travellers_children AS children FROM public.trips WHERE organization_id = $1 AND id = $2";
const SQL_INSTANTANE = "SELECT snapshot, patch, author_kind FROM public.trip_versions WHERE organization_id = $1 AND trip_id = $2 AND version = $3";
const SQL_PAR_DEMANDE = "SELECT version, patch, author_kind FROM public.trip_versions WHERE organization_id = $1 AND trip_id = $2 AND request_id = $3";
/** Un recalcul ou un voyage complet en cours (même règle que la lecture, `SQL_EN_COURS`) : aucune version n'est écrite. */
const SQL_EN_COURS = `SELECT EXISTS (SELECT 1 FROM public.generation_runs WHERE organization_id = $1 AND trip_id = $2
  AND finished_at IS NULL AND kind IN ('full', 'batch')) AS en_cours`;
const SQL_A_FAIRE = "SELECT stop_id FROM public.checklist_items WHERE organization_id = $1 AND trip_id = $2 AND stop_id IS NOT NULL";
const SQL_BRIEF = `SELECT pace, wishes, limit_categories, meal_budget FROM public.briefs
  WHERE organization_id = $1 AND trip_id = $2 ORDER BY version DESC LIMIT 1`;
const SQL_SEJOURS = `SELECT label, place_id, from_date::text AS "from", to_date::text AS "to" FROM public.stays
  WHERE organization_id = $1 AND trip_id = $2`;
const SQL_ENGAGEMENTS = `SELECT kind, label, to_char(date, 'YYYY-MM-DD') AS date, start_time, end_time
  FROM public.trip_commitments WHERE organization_id = $1 AND trip_id = $2 ORDER BY rank`;
/**
 * Propositions déjà vérifiées du voyage, de même nature, liées à leur candidat (même nature, ancré) : hors cases vides et
 * hors cartes écartées au tri (« Pas pour moi » non annulé) ; le jour de l'étape d'abord, puis les jours les plus proches ;
 * ordre fixe (phase, position, identifiant). Une proposition sans candidat (`candidate_id` nul, chaîne inversée) n'est pas
 * une option : `candidates` n'est écrit que par la génération (décision 0145 § 3 ; question au Product Owner, PR 869).
 */
const SQL_PROPOSITIONS = `SELECT p.id, p.day, c.id AS candidate_id, c.name, c.summary, c.category, c.facts, c.sources, c.place_id,
    c.stop_kind, c.to_reserve, c.fit, c.not_for_me_risk, c.must_see, c.slot_fit
  FROM public.proposals p
  JOIN public.candidates c ON c.organization_id = p.organization_id AND c.trip_id = p.trip_id AND c.id = p.candidate_id
  WHERE p.organization_id = $1 AND p.trip_id = $2 AND p.slot_type = 'proposal' AND p.kind = $3
    AND c.stop_kind = $3 AND c.place_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.preference_signals s WHERE s.organization_id = $1 AND s.trip_id = $2
      AND s.proposal_id = p.id AND s.signal = 'dislike' AND s.status <> 'cancelled')
  ORDER BY abs(p.day - $4::integer), p.day, p.phase, p.position, p.id`;

const entier = (valeur: unknown): number | undefined => (typeof valeur === "number" && Number.isInteger(valeur) ? valeur : undefined);
const texte = (valeur: unknown): string | undefined => (typeof valeur === "string" ? valeur : undefined);
const textes = (valeur: unknown): string[] => (Array.isArray(valeur) ? valeur.filter((v): v is string => typeof v === "string") : []);

type Session = Pick<AdapterContext, "organizationId" | "userId">;

async function versionCourante(executeur: ExecuteurAction, org: string, tripId: string): Promise<number | null> {
  const ligne = (await executeur.query(SQL_COURANTE, [org, tripId])).rows[0];
  return ligne === undefined || ligne.current_version === null ? null : (entier(ligne.current_version) ?? null);
}

async function lireVersion(executeur: ExecuteurAction, org: string, tripId: string, version: number) {
  const ligne = (await executeur.query(SQL_INSTANTANE, [org, tripId, version])).rows[0];
  const instantane = TripSnapshotSchema.safeParse(ligne?.snapshot);
  if (ligne === undefined || !instantane.success) throw new RemplacementIncoherent();
  return { instantane: instantane.data, patch: ligne.patch ?? null, auteur: ligne.author_kind };
}

const SourcesLuesSchema = z.array(z.object({ url: z.string(), checkedOn: z.string() }));
const CRENEAUX = ["activity", "meal", "evening"] as const;

/** Candidat du moteur depuis sa ligne `candidates` (champs maison, `placeId` posé par l'ancrage). */
function candidatLu(ligne: Record<string, unknown>): CandidatMoteur {
  const id = texte(ligne.candidate_id);
  const nom = texte(ligne.name);
  const placeId = texte(ligne.place_id);
  const typeEtape = ligne.stop_kind === "activity" || ligne.stop_kind === "meal" ? ligne.stop_kind : undefined;
  const categorie = CategorySchema.safeParse(ligne.category);
  const faits = StopFactsSchema.safeParse(ligne.facts ?? {});
  const sources = SourcesLuesSchema.safeParse(ligne.sources ?? []);
  if (id === undefined || nom === undefined || placeId === undefined || typeEtape === undefined || !categorie.success || !faits.success || !sources.success) {
    throw new RemplacementIncoherent();
  }
  const creneaux = CRENEAUX.filter((c) => textes(ligne.slot_fit).includes(c));
  return {
    id,
    nom,
    resume: texte(ligne.summary) ?? "",
    categorie: categorie.data,
    typeEtape,
    faits: faits.data,
    // Classe de source : lue par le classement de `generer`, jamais par `appliquerPatch` (qui ne lit que l'URL).
    sources: sources.data.map((s) => ({ url: s.url, date: s.checkedOn, classe: "generique" as const })),
    // Notes : lues par le classement de `generer`, jamais par `appliquerPatch`.
    notes: {
      matchesWishes: ligne.fit === true,
      notForMeRisk: entier(ligne.not_for_me_risk) ?? 1,
      mustSee: ligne.must_see === true,
      slotFit: creneaux.length > 0 ? creneaux : [typeEtape],
    },
    placeId,
    aReserver: ligne.to_reserve === true,
  };
}

async function propositionsDe(executeur: ExecuteurAction, org: string, tripId: string, situee: Situee): Promise<PropositionDuVoyage[]> {
  const lignes = (await executeur.query(SQL_PROPOSITIONS, [org, tripId, situee.stop.kind, situee.jour.index])).rows;
  const vus = new Set<string>();
  return lignes.flatMap((ligne) => {
    const proposalId = texte(ligne.id);
    const day = entier(ligne.day);
    if (proposalId === undefined || day === undefined) throw new RemplacementIncoherent();
    const candidat = candidatLu(ligne);
    // Un candidat présenté deux fois (aperçu et tri) n'est qu'une option.
    if (vus.has(candidat.id)) return [];
    vus.add(candidat.id);
    return [{ proposalId, day, candidat }];
  });
}

async function etapesAFaire(executeur: ExecuteurAction, org: string, tripId: string): Promise<Set<string>> {
  return new Set((await executeur.query(SQL_A_FAIRE, [org, tripId])).rows.flatMap((ligne) => (typeof ligne.stop_id === "string" ? [ligne.stop_id] : [])));
}

async function refuserPendantUnRecalcul(executeur: ExecuteurAction, org: string, tripId: string): Promise<void> {
  if ((await executeur.query(SQL_EN_COURS, [org, tripId])).rows[0]?.en_cours === true) throw new RefusAction("generation_in_progress");
}

/**
 * Brief du moteur : allure, envies, limites et budget repas de la dernière ligne `briefs` ; modes de trajet **de la lecture**
 * (`BaseDeRevision.modes`, ceux des durées affichées). Sans ligne ou sans allure : `balanced` (valeur par défaut du formulaire
 * de création, `src/features/creation/validation.ts` ; décision 0145 § 5).
 */
async function briefDe(executeur: ExecuteurAction, org: string, tripId: string, base: BaseDeRevision, travellers: Brief["travellers"]): Promise<Brief> {
  const ligne = (await executeur.query(SQL_BRIEF, [org, tripId])).rows[0];
  const pace = PaceSchema.safeParse(ligne?.pace);
  const categories = (valeur: unknown): Category[] => textes(valeur).flatMap((c) => {
    const lue = CategorySchema.safeParse(c);
    return lue.success ? [lue.data] : [];
  });
  const repas = texte(ligne?.meal_budget);
  const montant = repas === undefined ? Number.NaN : Number(repas);
  return {
    travellers,
    pace: pace.success ? pace.data : "balanced",
    wishes: categories(ligne?.wishes),
    limits: categories(ligne?.limit_categories),
    mobility: [...base.modes],
    ...(Number.isFinite(montant) ? { mealBudgetPerPerson: montant } : {}),
    inferredFields: [],
  };
}

/** Nuits du voyage : étiquette maison et `placeId` du séjour de chaque nuit (même découpage que la lecture). */
async function nuitsDe(executeur: ExecuteurAction, org: string, tripId: string, base: BaseDeRevision): Promise<Nuit[]> {
  const lignes = (await executeur.query(SQL_SEJOURS, [org, tripId])).rows.map((l) => ({ from: texte(l.from) ?? "", to: texte(l.to) ?? "", label: texte(l.label) ?? "", placeId: texte(l.place_id) }));
  const parNuit = sejoursParNuit(lignes, base.start, base.end);
  if (parNuit === null) throw new RemplacementIncoherent();
  return parNuit.map((s) => ({ etiquette: s.label, ...(s.placeId === undefined ? {} : { placeId: s.placeId }) }));
}

async function engagementsDe(executeur: ExecuteurAction, org: string, tripId: string): Promise<TripCommitment[]> {
  return (await executeur.query(SQL_ENGAGEMENTS, [org, tripId])).rows.map((ligne) => {
    const lu = TripCommitmentSchema.safeParse({
      kind: ligne.kind,
      label: ligne.label,
      date: ligne.date,
      start: ligne.start_time,
      ...(ligne.end_time === null || ligne.end_time === undefined ? {} : { end: ligne.end_time }),
    });
    if (!lu.success) throw new RemplacementIncoherent();
    return lu.data;
  });
}

async function contexteVoyage(executeur: ExecuteurAction, ctx: AdapterContext, tripId: string): Promise<ContexteVoyage | null> {
  const base = await lireBaseDeRevision(executeur, ctx, tripId);
  if (base === null) return null;
  const org = ctx.organizationId;
  const ligne = (await executeur.query(SQL_VOYAGE, [org, tripId])).rows[0];
  const destination = texte(ligne?.destination);
  const adults = entier(ligne?.adults);
  const children = entier(ligne?.children);
  if (destination === undefined || adults === undefined || children === undefined) throw new RemplacementIncoherent();
  const travellers = { adults, children };
  return {
    base,
    brief: await briefDe(executeur, org, tripId, base, travellers),
    nuits: await nuitsDe(executeur, org, tripId, base),
    engagements: await engagementsDe(executeur, org, tripId),
    destination,
    travellers,
  };
}

type RefusDeReponse = { status: "noOption" } | { status: "lockedStop" } | { status: "conflict"; currentVersion: number };

/** Refus d'un choix en réponse (aucune écriture) ; une étape absente du programme courant est `not_found`. */
function refusDuChoix(refus: RefusDuChoix): { status: "noOption" } | { status: "lockedStop" } | null {
  if (refus === "unknown_stop") return null;
  return refus === "locked_stop" ? { status: "lockedStop" } : { status: "noOption" };
}

/** Refus du moteur en réponse : verrou, conflit de version, ou aucune option (toute autre règle). */
function refusDuMoteur(resultat: Exclude<ResultatPatch, { ok: true }>): RefusDeReponse {
  if (resultat.code === "version_conflict") return { status: "conflict", currentVersion: resultat.currentVersion };
  if (resultat.code === "locked_stop") return { status: "lockedStop" };
  return { status: "noOption" };
}

/** Étape 1 : contexte du voyage et choix, ou une réponse immédiate ; `null` : `not_found`. */
type Prepare = { readonly contexte: ContexteVoyage; readonly choix: ChoixRetenu };
type Preparation = { readonly fin: RefusDeReponse } | { readonly prepare: Prepare; readonly ctx: Session };

async function preparer(
  executeur: ExecuteurAction,
  ctx: AdapterContext,
  valeur: { readonly tripId: string; readonly stopId: string; readonly baseVersion: number; readonly candidateId?: string },
): Promise<Preparation | null> {
  const contexte = await contexteVoyage(executeur, ctx, valeur.tripId);
  if (contexte === null) return null;
  if (contexte.base.version !== valeur.baseVersion) return { fin: { status: "conflict", currentVersion: contexte.base.version } };
  const situee = etapeSituee(contexte.base.snapshot, valeur.stopId);
  const choix = choisirRemplacement({
    instantane: contexte.base.snapshot,
    baseVersion: contexte.base.version,
    stopId: valeur.stopId,
    propositions: situee === undefined ? [] : await propositionsDe(executeur, ctx.organizationId, valeur.tripId, situee),
    etapesAFaire: await etapesAFaire(executeur, ctx.organizationId, valeur.tripId),
    ...(valeur.candidateId === undefined ? {} : { candidateId: valeur.candidateId }),
  });
  if (!choix.ok) {
    const refus = refusDuChoix(choix.refus);
    return refus === null ? null : { fin: refus };
  }
  return { prepare: { contexte, choix }, ctx: { organizationId: ctx.organizationId, userId: ctx.userId } };
}

function journaliser(nom: "preview-replacement" | "apply-replacement", erreur: unknown, tripId: string): void {
  const errorName = errorNameOf(erreur);
  logEvent("voyages.action_failed", { action: nom, ...(errorName === undefined ? {} : { errorName }), tripId }, "error");
}

/** Étape 2 : un appel du port, hors transaction ; un refus ou une panne du port donne `null` (`provider_error`, rien n'est écrit). */
async function relire(dependances: DependancesRemplacement, nom: "preview-replacement" | "apply-replacement", prepare: Prepare, ctx: Session): Promise<Relectures | null> {
  try {
    return await relireRevision(dependances.relectures, ctx, prepare.contexte.base, demandeDuRemplacement(prepare.contexte.base, prepare.choix));
  } catch (erreur) {
    journaliser(nom, erreur, prepare.contexte.base.tripId);
    return null;
  }
}

function moteur(dependances: DependancesRemplacement, prepare: Prepare, relectures: Relectures, patch: TripPatch): ResultatPatch {
  return appliquerPatch({
    moteur: entreeMoteurDeRevision(prepare.contexte, [prepare.choix.proposition.candidat], relectures, dependances.configuration),
    patch,
    versionCourante: prepare.contexte.base.version,
    base: prepare.contexte.base.snapshot,
  });
}

/** Rejeu d'une demande déjà écrite : la même réponse si la version est bien celle de cette action, sinon `conflict`. */
function rejeu(ligne: Record<string, unknown>, op: "replace" | "revert", courante: number): ReplacementWrite {
  const version = entier(ligne.version);
  const patch = TripPatchSchema.safeParse(ligne.patch);
  const premiere = patch.success ? patch.data.operations[0] : undefined;
  if (version === undefined || ligne.author_kind !== "user" || !patch.success || patch.data.operations.length !== 1 || premiere?.op !== op) {
    return { status: "conflict", currentVersion: courante };
  }
  return { status: op === "replace" ? "applied" : "undone", version };
}

// --- Cas d'usage -----------------------------------------------------------------------------------------------

/** `previewReplacement` : brouillon du moteur sur la version courante, sans rien écrire ni garder. */
export async function proposerRemplacement(dependances: DependancesRemplacement, entree: unknown): Promise<Result<ReplacementOffer>> {
  const lu = await executerActionVoyage("preview-replacement", dependances, DemandeApercuSchema, entree, async (executeur, ctx, valeur) => {
    await executeur.query("SET TRANSACTION READ ONLY");
    const preparation = await preparer(executeur, ctx, valeur);
    return preparation === null ? null : { preparation, valeur };
  });
  if (!lu.ok) return lu;
  const { preparation, valeur } = lu.value;
  if ("fin" in preparation) return ok(preparation.fin);
  const { prepare, ctx } = preparation;
  const relectures = await relire(dependances, "preview-replacement", prepare, ctx);
  if (relectures === null) return fail("provider_error");
  const patch = patchDuRemplacement(crypto.randomUUID(), valeur.baseVersion, prepare.choix);
  const resultat = moteur(dependances, prepare, relectures, patch);
  if (!resultat.ok) return ok(refusDuMoteur(resultat));
  try {
    const cible = identifiantRemplacement(valeur.baseVersion, prepare.choix.proposition.candidat.id);
    const draft = brouillonDuRemplacement(prepare.contexte, resultat, relectures, cible, Date.now());
    return ok({ status: "offer", version: valeur.baseVersion, candidateId: prepare.choix.proposition.candidat.id, draft });
  } catch (erreur) {
    journaliser("preview-replacement", erreur, valeur.tripId);
    return fail("internal");
  }
}

/**
 * `applyReplacement` : version `baseVersion + 1` calculée par le moteur (auteur `user`, patch `replace` avec `candidates.id`),
 * idempotente par `requestId` : un rejeu rend la version déjà écrite par cette demande si c'est bien un remplacement d'une
 * personne, sinon `conflict` ; il ne compare ni l'étape, ni le candidat, ni la version de base (un `requestId` est unique à
 * chaque « Appliquer »).
 */
export async function appliquerRemplacement(dependances: DependancesRemplacement, entree: unknown): Promise<Result<ReplacementWrite>> {
  type Lu = { readonly deja: ReplacementWrite } | { readonly preparation: Preparation };
  const lu = await executerActionVoyage("apply-replacement", dependances, DemandeApplicationSchema, entree, async (executeur, ctx, valeur): Promise<Lu | null> => {
    await executeur.query("SET TRANSACTION READ ONLY");
    const ligne = (await executeur.query(SQL_PAR_DEMANDE, [ctx.organizationId, valeur.tripId, valeur.requestId])).rows[0];
    if (ligne !== undefined) return { deja: rejeu(ligne, "replace", (await versionCourante(executeur, ctx.organizationId, valeur.tripId)) ?? 0) };
    const preparation = await preparer(executeur, ctx, valeur);
    return preparation === null ? null : { preparation };
  });
  if (!lu.ok) return lu;
  if ("deja" in lu.value) return ok(lu.value.deja);
  const { preparation } = lu.value;
  if ("fin" in preparation) return ok(preparation.fin);
  const { prepare, ctx: session } = preparation;
  const relectures = await relire(dependances, "apply-replacement", prepare, session);
  if (relectures === null) return fail("provider_error");

  // Étape 3 : écriture, sous les verrous ; la version relue doit être encore la base de l'étape 1 (instantané inchangé).
  return executerActionVoyage("apply-replacement", dependances, DemandeApplicationSchema, entree, async (executeur, ctx, valeur): Promise<ReplacementWrite | null> => {
    const org = ctx.organizationId;
    await executeur.query(SQL_VERROU_TRI, [valeur.tripId]);
    await verrouillerVersions(executeur, valeur.tripId);
    const courante = await versionCourante(executeur, org, valeur.tripId);
    if (courante === null) return null;
    const ligne = (await executeur.query(SQL_PAR_DEMANDE, [org, valeur.tripId, valeur.requestId])).rows[0];
    if (ligne !== undefined) return rejeu(ligne, "replace", courante);
    await refuserPendantUnRecalcul(executeur, org, valeur.tripId);
    if (courante !== valeur.baseVersion || courante !== prepare.contexte.base.version) return { status: "conflict", currentVersion: courante };
    // Une ligne « À faire » posée entre-temps sur l'étape la rend non remplaçable (comme à l'étape 1). Une carte écartée au
    // tri entre l'étape 1 et ici n'est pas revue : elle ne change pas la version (écart admis, décision 0145 § 6).
    if ((await etapesAFaire(executeur, org, valeur.tripId)).has(valeur.stopId)) return { status: "noOption" };
    const patch = patchDuRemplacement(valeur.requestId, courante, prepare.choix);
    const resultat = moteur(dependances, prepare, relectures, patch);
    if (!resultat.ok) return refusDuMoteur(resultat);
    try {
      const ecrite = await ecrireVersion(executeur, {
        organizationId: org,
        tripId: valeur.tripId,
        requestId: valeur.requestId,
        auteur: "user",
        auteurUserId: ctx.userId,
        instantane: resultat.instantane,
        patch,
      });
      return { status: "applied", version: ecrite.version };
    } catch (erreur) {
      if (erreur instanceof BaseDeVersionDepassee) return { status: "conflict", currentVersion: courante };
      throw erreur;
    }
  });
}

/**
 * `undoReplacement` : si la version courante est `version` et qu'elle est un remplacement écrit par une personne, une
 * version de plus recopie sa version de base (`revert` appliqué par le moteur, rien n'est supprimé) ; sinon `conflict`, rien
 * n'est écrit. La fenêtre de 5 s est tenue par le toast ; le serveur n'a pas de borne de temps (réponse du Tech Lead à la
 * revue de la PR 869, décision 0145 § 4 : la garde par la version courante suffit). Aucun appel du port : rien n'est replanifié.
 */
export function annulerRemplacement(dependances: DependancesRemplacement, entree: unknown): Promise<Result<ReplacementWrite>> {
  return executerActionVoyage("undo-replacement", dependances, DemandeAnnulationSchema, entree, async (executeur, ctx, valeur): Promise<ReplacementWrite | null> => {
    const org = ctx.organizationId;
    await executeur.query(SQL_VERROU_TRI, [valeur.tripId]);
    await verrouillerVersions(executeur, valeur.tripId);
    const courante = await versionCourante(executeur, org, valeur.tripId);
    if (courante === null) return null;
    const ligne = (await executeur.query(SQL_PAR_DEMANDE, [org, valeur.tripId, valeur.requestId])).rows[0];
    if (ligne !== undefined) return rejeu(ligne, "revert", courante);
    await refuserPendantUnRecalcul(executeur, org, valeur.tripId);
    if (courante !== valeur.version) return { status: "conflict", currentVersion: courante };
    const actuelle = await lireVersion(executeur, org, valeur.tripId, courante);
    const remplacement = TripPatchSchema.safeParse(actuelle.patch);
    const operation = remplacement.success ? remplacement.data.operations[0] : undefined;
    // Seul un remplacement d'une personne s'annule ici (la version 1, les versions du moteur et les annulations, non).
    if (!remplacement.success || actuelle.auteur !== "user" || remplacement.data.operations.length !== 1 || operation?.op !== "replace") {
      return { status: "conflict", currentVersion: courante };
    }
    const cible = remplacement.data.baseVersion;
    const anterieure = await lireVersion(executeur, org, valeur.tripId, cible);
    const contexte = await contexteVoyage(executeur, ctx, valeur.tripId);
    if (contexte === null) return null;
    const patch = TripPatchSchema.parse({ requestId: valeur.requestId, baseVersion: courante, operations: [{ op: "revert", toVersion: cible }] });
    const resultat = appliquerPatch({
      moteur: entreeMoteurDeRevision(contexte, [], RELECTURES_INCONNUES, dependances.configuration),
      patch,
      versionCourante: courante,
      base: actuelle.instantane,
      versionsAnterieures: new Map([[cible, anterieure.instantane]]),
    });
    if (!resultat.ok) return refusDuMoteur(resultat);
    try {
      const ecrite = await ecrireVersion(executeur, {
        organizationId: org,
        tripId: valeur.tripId,
        requestId: valeur.requestId,
        auteur: "user",
        auteurUserId: ctx.userId,
        instantane: resultat.instantane,
        patch,
      });
      return { status: "undone", version: ecrite.version };
    } catch (erreur) {
      if (erreur instanceof BaseDeVersionDepassee) return { status: "conflict", currentVersion: courante };
      throw erreur;
    }
  });
}

/** Version courante d'un voyage de l'organisation (base de la première demande d'aperçu), ou `null`. */
export function versionDuVoyage(dependances: DependancesAction, entree: unknown): Promise<Result<number>> {
  return executerActionVoyage("revision-version", dependances, z.strictObject({ tripId: z.string() }), entree, async (executeur, ctx, valeur) => {
    await executeur.query("SET TRANSACTION READ ONLY");
    return versionCourante(executeur, ctx.organizationId, valeur.tripId);
  });
}
