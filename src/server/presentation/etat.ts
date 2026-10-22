import "server-only";

import { ProposalRecordSchema, type DeckCounts, type DeckSession, type PreferencePrompt } from "@/contracts";
import { CATEGORIES, PREFERENCE_REASONS, PREFERENCE_SIGNAL_ORIGINS, PREFERENCE_SIGNAL_STATUSES, PREFERENCE_SIGNALS } from "@/contracts/values";
import { compteursDuTri, paquetDeReprise, type CarteTriable, type EtatDesTris, type SignalLu } from "@/domain/preferences";
import { optionsDesRepas } from "@/domain/recomposition";

/**
 * État du tri d'un voyage, lu dans la transaction d'une action ou d'une lecture (spécification B10, B10a ; décision 0112
 * § 3). Chaque requête porte `organization_id = $1`, lié au contexte de la session (double vérification avec la RLS).
 * Le contenu des cases (`proposals.content`) est lu en entier pour être validé par `ProposalRecordSchema`, mais aucun nom
 * de lieu n'est écrit, journalisé ni renvoyé : des cases, seuls l'identifiant d'étape, la nature, la catégorie, le jour,
 * l'heure, le verrou et, pour l'écriture d'une décision, le candidat et le `placeId` (seul identifiant Google stocké)
 * sont gardés.
 *
 * **Le tri courant** (0112 § 3.4) : voyage non débloqué, les cases `preview` de la dernière exécution `preview` ; voyage
 * débloqué, les propositions `deck` de la dernière exécution qui en a écrit (B10d ; aucune en B10a). Une carte est dans
 * un tri clos si une clôture de même exécution et de même phase couvre sa position. **Au déblocage**, tant qu'aucune
 * proposition `deck` n'existe, le tri courant est celui de l'aperçu, **clos à la lecture** (0112 § 3.4, B10-PO-4 point 3) :
 * `closed` vrai, sans carte, sans écriture.
 */

export type Executeur = { query(texte: string, valeurs?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }> };

/** Donnée du tri incohérente (contenu de case illisible, valeur hors liste) : `internal` dans les actions, rejet en lecture. */
export class EtatDuTriInvalide extends Error {
  override name = "EtatDuTriInvalide";
}

/** Carte du tri courant : forme lue par les règles, plus la ligne `proposals` et de quoi écrire le signal. */
export type CarteDuTri = CarteTriable & {
  readonly ligne: string;
  readonly position: number;
  readonly candidat: string | null;
  readonly lieu: string | null;
};

/** Signal du voyage : forme lue par les règles, plus la ligne et ce qu'il faut pour l'idempotence et l'annulation. */
export type SignalDuVoyage = SignalLu & {
  readonly ligne: string;
  readonly seq: number;
  readonly requestId: string;
  readonly proposition: string | null;
  readonly annulation: string | null;
};

export type QuestionDuVoyage = {
  readonly ligne: string;
  readonly prompt: PreferencePrompt;
  readonly etat: "open" | "answered" | "closed" | "withdrawn";
  readonly declencheur: string;
  readonly reponse: string | null;
};

export type EtatDuTri = {
  readonly phase: "preview" | "deck";
  readonly execution: string | null;
  /** Dernière position des cases de l'exécution et de la phase (`noOption` comprises) ; 0 sans case. */
  readonly dernierePosition: number;
  readonly cartes: readonly CarteDuTri[];
  readonly tris: EtatDesTris;
  readonly signaux: readonly SignalDuVoyage[];
  readonly questions: readonly QuestionDuVoyage[];
  readonly enRecalcul: boolean;
  /** Voyage débloqué sans proposition `deck` : le tri de l'aperçu est clos à la lecture (0112 § 3.4). */
  readonly closAuDeblocage: boolean;
};

// --- Requêtes (constantes ; paramètres liés) ------------------------------------------------------------------

/** Verrou du tri d'un voyage (0112 § 3.6), pris après le contrôle du voyage dans l'organisation. */
export const SQL_VERROU_TRI = "SELECT pg_advisory_xact_lock(hashtextextended('vadrouille:tri:' || $1::text, 0))";

/**
 * Droit `tripUnlocked` du voyage : **requête unique** du déblocage, lue par l'état du tri, par la lecture des voyages
 * (`src/server/voyages/lecture.ts`) et par la suite du déblocage (0120 S2 point 1, Q578) ; importée, jamais recopiée.
 */
export const SQL_DEBLOQUE = `SELECT EXISTS (SELECT 1 FROM public.entitlements WHERE organization_id = $1 AND trip_id = $2
  AND kind = 'tripUnlocked') AS debloque`;

/**
 * Dernière exécution `preview` du voyage, **sans condition sur les cases** (0119 § 1.3 point 3) : la même pour la lecture du
 * tri et pour la suite du déblocage qui écrit la clôture de l'aperçu (0120 S2 point 2, Q578) ; importée, jamais recopiée.
 */
export const SQL_EXECUTION_APERCU = `SELECT g.id FROM public.generation_runs g WHERE g.organization_id = $1 AND g.trip_id = $2 AND g.kind = 'preview'
  ORDER BY g.started_at DESC, g.id DESC LIMIT 1`;

const SQL_EXECUTION_DECK = `SELECT q.generation_run_id AS id FROM public.proposals q
  JOIN public.generation_runs g ON g.organization_id = q.organization_id AND g.id = q.generation_run_id
  WHERE q.organization_id = $1 AND q.trip_id = $2 AND q.phase = 'deck'
  ORDER BY g.started_at DESC, g.id DESC LIMIT 1`;

/** Cases d'une exécution et d'une phase, par position (`noOption` comprises) ; lues aussi par la suite du déblocage (0120 S2 point 2). */
export const SQL_CASES = `SELECT p.id, p.position, p.slot_type, p.day, p.time, p.kind, p.candidate_id, p.content FROM public.proposals p
  WHERE p.organization_id = $1 AND p.trip_id = $2 AND p.generation_run_id = $3 AND p.phase = $4 ORDER BY p.position`;

const SQL_CLOTURE = `SELECT COALESCE(max(through_position), 0)::int AS jusqua FROM public.deck_closures
  WHERE organization_id = $1 AND trip_id = $2 AND generation_run_id = $3 AND phase = $4`;

const SQL_SIGNAUX = `SELECT s.id, s.seq, s.request_id, s.signal, s.category, s.origin, s.status, s.reason, s.proposal_id,
  s.cancel_request_id, p.kind AS proposal_kind, p.content ->> 'id' AS proposal_ref
  FROM public.preference_signals s
  LEFT JOIN public.proposals p ON p.organization_id = s.organization_id AND p.id = s.proposal_id
  WHERE s.organization_id = $1 AND s.trip_id = $2 ORDER BY s.seq`;

const SQL_QUESTIONS = `SELECT id, kind, category, state, trigger_signal_id, answer_signal_id FROM public.preference_prompts
  WHERE organization_id = $1 AND trip_id = $2 ORDER BY created_at, id`;

const SQL_EN_RECALCUL = `SELECT EXISTS (SELECT 1 FROM public.generation_runs WHERE organization_id = $1 AND trip_id = $2
  AND kind = 'batch' AND finished_at IS NULL) AS en_recalcul`;

// --- Lecture ---------------------------------------------------------------------------------------------

const texte = (valeur: unknown): string => {
  if (typeof valeur !== "string") throw new EtatDuTriInvalide();
  return valeur;
};
const texteOuNul = (valeur: unknown): string | null => (valeur === null ? null : texte(valeur));
const entier = (valeur: unknown): number => {
  const n = typeof valeur === "string" ? Number(valeur) : valeur;
  if (typeof n !== "number" || !Number.isSafeInteger(n)) throw new EtatDuTriInvalide();
  return n;
};
function dansListe<T extends string>(liste: readonly T[], valeur: unknown): T {
  const trouve = liste.find((element) => element === valeur);
  if (trouve === undefined) throw new EtatDuTriInvalide();
  return trouve;
}
function dansListeOuNul<T extends string>(liste: readonly T[], valeur: unknown): T | null {
  return valeur === null ? null : dansListe(liste, valeur);
}

async function cartesDe(executeur: Executeur, org: string, tripId: string, execution: string, phase: string) {
  const lignes = (await executeur.query(SQL_CASES, [org, tripId, execution, phase])).rows;
  const dernierePosition = lignes.reduce((max, ligne) => Math.max(max, entier(ligne.position)), 0);
  const cases = lignes
    .filter((ligne) => ligne.slot_type === "proposal")
    .map((ligne) => {
      const record = ProposalRecordSchema.safeParse(ligne.content);
      if (!record.success || record.data.day !== ligne.day || record.data.time !== ligne.time || record.data.kind !== ligne.kind) {
        throw new EtatDuTriInvalide();
      }
      return { ligne, record: record.data };
    });
  const options = optionsDesRepas(cases.map(({ record }) => record));
  const cartes = cases.map(({ ligne, record }, rang): CarteDuTri => {
    const option = options[rang];
    return {
      id: record.id,
      kind: record.kind,
      category: record.category,
      day: record.day,
      time: record.time,
      ...(option === undefined ? {} : { option: { index: option.index } }),
      stop: { locked: record.stop.locked },
      ligne: texte(ligne.id),
      position: entier(ligne.position),
      candidat: texteOuNul(ligne.candidate_id),
      lieu: record.stop.placeId ?? null,
    };
  });
  return { dernierePosition, cartes };
}

function signalDe(ligne: Record<string, unknown>): SignalDuVoyage {
  const signal = dansListe(PREFERENCE_SIGNALS, ligne.signal);
  const reason = dansListeOuNul(PREFERENCE_REASONS, ligne.reason);
  const ref = texteOuNul(ligne.proposal_ref);
  const kind = ligne.proposal_kind === null ? undefined : dansListe(["activity", "meal"] as const, ligne.proposal_kind);
  return {
    signal,
    category: dansListeOuNul(CATEGORIES, ligne.category),
    origin: dansListe(PREFERENCE_SIGNAL_ORIGINS, ligne.origin),
    status: dansListe(PREFERENCE_SIGNAL_STATUSES, ligne.status),
    ...(reason === null ? {} : { reason }),
    ...(ref === null ? {} : { proposalId: ref }),
    ...(kind === undefined ? {} : { kind }),
    ligne: texte(ligne.id),
    seq: entier(ligne.seq),
    requestId: texte(ligne.request_id),
    proposition: texteOuNul(ligne.proposal_id),
    annulation: texteOuNul(ligne.cancel_request_id),
  };
}

function questionDe(ligne: Record<string, unknown>): QuestionDuVoyage {
  const kind = dansListe(["category", "distance"] as const, ligne.kind);
  const prompt: PreferencePrompt = kind === "distance" ? { kind } : { kind, category: dansListe(CATEGORIES, ligne.category) };
  return {
    ligne: texte(ligne.id),
    prompt,
    etat: dansListe(["open", "answered", "closed", "withdrawn"] as const, ligne.state),
    declencheur: texte(ligne.trigger_signal_id),
    reponse: texteOuNul(ligne.answer_signal_id),
  };
}

/** Lit l'état du tri du voyage (voyage déjà contrôlé dans l'organisation par l'appelant). */
export async function lireEtatDuTri(executeur: Executeur, org: string, tripId: string): Promise<EtatDuTri> {
  const debloque = (await executeur.query(SQL_DEBLOQUE, [org, tripId])).rows[0]?.debloque === true;
  const phase = debloque ? "deck" : "preview";
  const execution = texteOuNul((await executeur.query(debloque ? SQL_EXECUTION_DECK : SQL_EXECUTION_APERCU, [org, tripId])).rows[0]?.id ?? null);
  const { dernierePosition, cartes } = execution === null ? { dernierePosition: 0, cartes: [] } : await cartesDe(executeur, org, tripId, execution, phase);
  const jusqua = execution === null ? 0 : entier((await executeur.query(SQL_CLOTURE, [org, tripId, execution, phase])).rows[0]?.jusqua ?? 0);
  const closes = new Set(cartes.filter((carte) => carte.position <= jusqua).map((carte) => carte.id));
  const signaux = (await executeur.query(SQL_SIGNAUX, [org, tripId])).rows.map(signalDe);
  const questions = (await executeur.query(SQL_QUESTIONS, [org, tripId])).rows.map(questionDe);
  const enRecalcul = (await executeur.query(SQL_EN_RECALCUL, [org, tripId])).rows[0]?.en_recalcul === true;
  return { phase, execution, dernierePosition, cartes, tris: { closes }, signaux, questions, enRecalcul, closAuDeblocage: debloque && execution === null };
}

// --- Vues du tri -----------------------------------------------------------------------------------------

/**
 * Signaux du tri courant, sous la forme des règles : les décisions de carte n'y entrent que si leur case est une carte
 * du tri courant (`proposalId` = identifiant d'étape de cette case) ; les réponses y entrent toutes (une catégorie
 * arrêtée vaut pour tout le voyage).
 */
export function signauxDuTri(etat: EtatDuTri): SignalLu[] {
  const lignes = new Set(etat.cartes.map((carte) => carte.ligne));
  return etat.signaux.filter((signal) => signal.proposition === null || lignes.has(signal.proposition));
}

/**
 * Le tri courant est clos : tri de l'aperçu d'un voyage débloqué sans proposition `deck` (clos à la lecture, 0112 § 3.4),
 * ou tri qui a des cartes, toutes dans un tri clos.
 */
export function triClos(etat: EtatDuTri): boolean {
  if (etat.closAuDeblocage) return true;
  return etat.cartes.length > 0 && etat.cartes.every((carte) => etat.tris.closes.has(carte.id));
}

/** Question ouverte du tri courant : posée par une décision d'une carte ouverte du tri, ni répondue, ni fermée. */
export function questionOuverte(etat: EtatDuTri): QuestionDuVoyage | null {
  const question = etat.questions.find((q) => q.etat === "open");
  if (question === undefined) return null;
  const declencheur = etat.signaux.find((signal) => signal.ligne === question.declencheur);
  const carte = etat.cartes.find((c) => c.ligne === declencheur?.proposition);
  return carte !== undefined && !etat.tris.closes.has(carte.id) ? question : null;
}

export function compteurs(etat: EtatDuTri): DeckCounts {
  return compteursDuTri(etat.cartes, signauxDuTri(etat), etat.tris);
}

/** État du tri tel que l'écran le reçoit (`DeckSession`, 0112 § 1.5). */
export function sessionDuTri(etat: EtatDuTri, tripId: string): DeckSession {
  if (triClos(etat)) return { tripId, proposalIds: [], openPrompt: null, closed: true, counts: compteurs(etat) };
  const paquet = paquetDeReprise(etat.cartes, signauxDuTri(etat), etat.tris);
  return { tripId, proposalIds: paquet.map((carte) => carte.id), openPrompt: questionOuverte(etat)?.prompt ?? null, closed: false, counts: compteurs(etat) };
}
