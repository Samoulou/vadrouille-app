import "server-only";

import {
  CompleteDeckRequestSchema,
  DeckDecisionSchema,
  PreferenceAnswerRequestSchema,
  UndoDecisionRequestSchema,
  type CompleteDeckResult,
  type DeckDecisionResult,
  type PreferenceAnswerResult,
  type PreferencePrompt,
  type UndoDecisionResult,
} from "@/contracts";
import { estDerniereOption, ordreDuPaquet, paquetDeReprise, questionApres, type SignalLu } from "@/domain/preferences";
import { RECALCUL_FIN_APERCU } from "@/server/config/recalcul";
import { demarrerRecalculReel } from "@/server/generation/demarrage";
import { expirerLots } from "@/server/generation/expiration";
import { demarrerLot, ouvrirLotApresCloture, signalerLotNonCree, type DemarrerRecalcul, type IssueLot } from "@/server/generation/lot";
import { executerActionVoyage, RefusAction, type DependancesAction, type ExecuteurAction } from "@/server/voyages/actions";
import { executeurSql, withOrg as withOrgParDefaut } from "@/server/with-org";

import {
  compteurs,
  lireEtatDuTri,
  questionOuverte,
  sessionDuTri,
  signauxDuTri,
  SQL_VERROU_TRI,
  triClos,
  type CarteDuTri,
  type EtatDuTri,
  type QuestionDuVoyage,
  type SignalDuVoyage,
} from "./etat";

/**
 * Cas d'usage du tri enregistré (spécification B10, B10a points 2 à 4 ; décision 0112 § 1 et § 3) : `decideCard`,
 * `undoDecision`, `answerPreferencePrompt` et la partie « clôture » de `completeDeck` (0112 § 1.4, décision du CEO), dans
 * le cadre commun des actions sur un voyage (`executerActionVoyage`, 0086 § 2.2). Ordre, dans la transaction :
 * contrôle du voyage dans l'organisation (cadre), **puis** verrou du tri du voyage (0112 § 3.6 et § 3.8 : jamais pris
 * pour un voyage d'une autre organisation), puis refus pendant un recalcul (`generation_in_progress`, 0112 § 1.6), puis
 * idempotence par `requestId`, puis contrôles et écritures. Tout refus (`RefusAction`) annule la transaction : **rien
 * n'est écrit**. Le contenu des cases est lu pour être validé, mais aucun nom de lieu n'est écrit, journalisé ni renvoyé ;
 * seul le `placeId` de la case décidée est écrit (B10a point 2). Les
 * journaux sont ceux du cadre (`voyages.action_failed` : nom de l'action, classe de l'erreur, voyage).
 *
 * B10b (décision 0119 § 1.3 point 2 et § 1.4 point 5 ; verdict 0120 S3 et S6) : sous le verrou du tri, chaque action expire
 * d'abord les seules exécutions `batch` figées du voyage (`expirerLots`, 20 minutes), **avant** le contrôle
 * `generation_in_progress` ; `completeDeck` crée la ligne `batch` du tri qu'elle clôt (voyage débloqué, ou interrupteur
 * `RECALCUL_FIN_APERCU` ouvert) quand un signal de ce tri touche un jour planifié de la version de base, et démarre le
 * workflow 5 **après** la validation de sa transaction (aucun appel externe sous le verrou).
 */

const SQL_INSERER_DECISION = `INSERT INTO public.preference_signals
  (organization_id, trip_id, request_id, candidate_id, place_id, category, signal, origin, status, proposal_id)
  VALUES ($1, $2, $3, $4, $5, $6, $7, 'gesture', 'confirmed', $8)
  ON CONFLICT DO NOTHING RETURNING id`;

const SQL_INSERER_REPONSE = `INSERT INTO public.preference_signals
  (organization_id, trip_id, request_id, category, signal, reason, origin, status)
  VALUES ($1, $2, $3, $4, $5, $6, 'question', 'confirmed')
  ON CONFLICT DO NOTHING RETURNING id`;

const SQL_ANNULER_SIGNAL = `UPDATE public.preference_signals
  SET status = 'cancelled', previous_status = status, cancelled_at = now(), cancel_request_id = $4
  WHERE organization_id = $1 AND trip_id = $2 AND id = $3 AND status <> 'cancelled'`;

const SQL_POSER_QUESTION = `INSERT INTO public.preference_prompts (organization_id, trip_id, kind, category, trigger_signal_id, state)
  VALUES ($1, $2, 'category', $3, $4, 'open')
  ON CONFLICT DO NOTHING RETURNING id`;

const SQL_ETAT_QUESTION = `UPDATE public.preference_prompts SET state = $4, answer_signal_id = $5, updated_at = now()
  WHERE organization_id = $1 AND trip_id = $2 AND id = $3`;

const SQL_FERMER_QUESTION_OUVERTE = `UPDATE public.preference_prompts SET state = 'closed', updated_at = now()
  WHERE organization_id = $1 AND trip_id = $2 AND state = 'open'`;

const SQL_CLORE = `INSERT INTO public.deck_closures (organization_id, trip_id, generation_run_id, phase, through_position, request_id)
  VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING id`;

const SQL_CLOTURE_PAR_REQUETE = "SELECT 1 AS present FROM public.deck_closures WHERE organization_id = $1 AND trip_id = $2 AND request_id = $3";

const refus = () => new RefusAction("validation_failed");

/**
 * Dépendances des cas d'usage du tri : celles du cadre, plus (**tests seulement**) le démarreur du workflow 5
 * (`demarrerRecalculReel` par défaut), la valeur simulée de l'interrupteur (`RECALCUL_FIN_APERCU` par défaut) et l'horloge.
 */
export type DependancesTri = DependancesAction & {
  readonly demarrerRecalcul?: DemarrerRecalcul;
  readonly recalculFinApercu?: boolean;
  readonly maintenant?: () => number;
};

type Contexte = { readonly executeur: ExecuteurAction; readonly org: string; readonly tripId: string; readonly maintenant: () => number };

const horloge = (dependances: DependancesTri): (() => number) => dependances.maintenant ?? Date.now;

/**
 * Verrou du tri, puis expiration des seules exécutions `batch` figées du voyage (0119 § 1.4 point 5, 0120 S6 : jamais
 * `SQL_EXPIRATION` sans filtre), puis état ; refus pendant un recalcul du voyage (B10-PO-14). La réponse n'expose rien de
 * la ligne expirée.
 */
async function ouvrir(contexte: Contexte): Promise<EtatDuTri> {
  await contexte.executeur.query(SQL_VERROU_TRI, [contexte.tripId]);
  await expirerLots(contexte.executeur, contexte.org, contexte.tripId, contexte.maintenant());
  const etat = await lireEtatDuTri(contexte.executeur, contexte.org, contexte.tripId);
  if (etat.enRecalcul) throw new RefusAction("generation_in_progress");
  return etat;
}

const relire = (contexte: Contexte) => lireEtatDuTri(contexte.executeur, contexte.org, contexte.tripId);

/** Questions posées du voyage qui comptent pour « une seule fois par catégorie » : toutes, sauf celles retirées. */
const questionsPosees = (etat: EtatDuTri): PreferencePrompt[] => etat.questions.filter((q) => q.etat !== "withdrawn").map((q) => q.prompt);

/** Décision de carte demandée → signal enregistré, selon la nature de la carte (B10-PO-2 point 1), sinon refus. */
function decisionAdmise(carte: CarteDuTri, decision: string, cartes: readonly CarteDuTri[]): boolean {
  if (carte.kind === "activity") return decision === "like" || decision === "dislike";
  const derniere = estDerniereOption(carte, ordreDuPaquet(cartes));
  if (decision === "choose") return true;
  if (decision === "nextOption") return !derniere;
  if (decision === "dislike") return derniere;
  return false;
}

/** Question ouverte par une décision, si elle l'est encore (réponse rejouée, 0112 § 1.2). */
function questionOuverteDe(etat: EtatDuTri, signal: SignalDuVoyage): PreferencePrompt | null {
  const ouverte = questionOuverte(etat);
  return ouverte !== null && ouverte.declencheur === signal.ligne ? ouverte.prompt : null;
}

function signalParRequete(etat: EtatDuTri, requestId: string): SignalDuVoyage | undefined {
  return etat.signaux.find((signal) => signal.requestId === requestId);
}

/**
 * `requestId` déjà servi à une annulation (`cancel_request_id`, 0112 § 3.1) : il ne désigne plus jamais une autre requête
 * (décision, réponse ou autre annulation), sinon `validation_failed`.
 */
function annulationParRequete(etat: EtatDuTri, requestId: string): boolean {
  return etat.signaux.some((signal) => signal.annulation === requestId);
}

export function deciderCarte(dependances: DependancesTri, entree: unknown) {
  return executerActionVoyage("decide-card", dependances, DeckDecisionSchema, entree, async (executeur, ctx, valeur): Promise<DeckDecisionResult> => {
    const contexte = { executeur, org: ctx.organizationId, tripId: valeur.tripId, maintenant: horloge(dependances) };
    const etat = await ouvrir(contexte);

    // Même `requestId` : même résultat, aucune seconde ligne ; contenu différent : refus. Une décision rejouée après son
    // annulation rend aussi `ok`, sans question (aucune n'est plus ouverte par elle) et avec les compteurs courants :
    // la réponse décrit l'état, pas une nouvelle écriture (0112 § 1.2) ; la ligne reste `cancelled`.
    const deja = signalParRequete(etat, valeur.requestId);
    if (deja !== undefined) {
      if (deja.signal !== valeur.decision || deja.proposalId !== valeur.proposalId || deja.proposition === null) throw refus();
      return { prompt: questionOuverteDe(etat, deja), counts: compteurs(etat) };
    }
    if (annulationParRequete(etat, valeur.requestId)) throw refus();

    // La carte doit être une carte du paquet de reprise du tri ouvert (B10-PO-4) : une seule case de cet identifiant,
    // non verrouillée, sans décision active, hors catégorie arrêtée et hors créneau réglé (B10-PO-2 point 4).
    const designees = etat.cartes.filter((carte) => carte.id === valeur.proposalId);
    const carte = designees[0];
    if (designees.length !== 1 || carte === undefined) throw refus();
    const paquet = paquetDeReprise(etat.cartes, signauxDuTri(etat), etat.tris);
    if (!paquet.some((c) => c.ligne === carte.ligne)) throw refus();
    if (!decisionAdmise(carte, valeur.decision, etat.cartes)) throw refus();

    // La décision suivante ferme la question ouverte (B10-PO-5 point 3).
    await executeur.query(SQL_FERMER_QUESTION_OUVERTE, [contexte.org, contexte.tripId]);
    const ecrite = await executeur.query(SQL_INSERER_DECISION, [
      contexte.org,
      contexte.tripId,
      valeur.requestId,
      carte.candidat,
      carte.lieu,
      carte.category,
      valeur.decision,
      carte.ligne,
    ]);
    const ligne = ecrite.rows[0]?.id;
    // Conflit d'unicité sous le verrou (filet, 0112 § 3.6) : jamais `internal`.
    if (typeof ligne !== "string") throw refus();

    const decision: SignalLu = {
      signal: valeur.decision,
      kind: carte.kind,
      category: carte.category,
      origin: "gesture",
      status: "confirmed",
      proposalId: carte.id,
    };
    const prompt = questionApres([...etat.signaux, decision], questionsPosees(etat), decision);
    if (prompt !== null && prompt.kind === "category") {
      const posee = await executeur.query(SQL_POSER_QUESTION, [contexte.org, contexte.tripId, prompt.category, ligne]);
      // Conflit d'unicité (question déjà posée pour la catégorie, ou déjà ouverte) : filet sous le verrou, refus sans
      // écriture, jamais `internal` (0112 § 3.6).
      if (posee.rows.length !== 1) throw refus();
    }
    return { prompt, counts: compteurs(await relire(contexte)) };
  });
}

/** Dernière décision de carte active du tri ouvert (plus grand `seq`), 0112 § 3.6. */
function derniereDecision(etat: EtatDuTri): SignalDuVoyage | undefined {
  const ouvertes = new Set(etat.cartes.filter((carte) => !etat.tris.closes.has(carte.id)).map((carte) => carte.ligne));
  return etat.signaux
    .filter((signal) => signal.status !== "cancelled" && signal.proposition !== null && ouvertes.has(signal.proposition))
    .reduce<SignalDuVoyage | undefined>((max, signal) => (max === undefined || signal.seq > max.seq ? signal : max), undefined);
}

export function annulerDecision(dependances: DependancesTri, entree: unknown) {
  return executerActionVoyage("undo-decision", dependances, UndoDecisionRequestSchema, entree, async (executeur, ctx, valeur): Promise<UndoDecisionResult> => {
    const contexte = { executeur, org: ctx.organizationId, tripId: valeur.tripId, maintenant: horloge(dependances) };
    const etat = await ouvrir(contexte);
    const decision = signalParRequete(etat, valeur.decisionRequestId);
    if (decision === undefined || decision.proposition === null) throw refus();
    if (decision.status === "cancelled") {
      // Annulation rejouée : même résultat ; annulée par une autre requête : refus.
      if (decision.annulation === valeur.requestId) return { counts: compteurs(etat) };
      throw refus();
    }
    // Seule la dernière décision du tri ouvert s'annule (B10-PO-6) ; un tri clos n'en a aucune.
    if (derniereDecision(etat)?.ligne !== decision.ligne) throw refus();
    // Le `requestId` de l'annulation ne doit désigner aucune autre requête du voyage (décision, réponse, autre annulation).
    if (signalParRequete(etat, valeur.requestId) !== undefined || annulationParRequete(etat, valeur.requestId)) throw refus();

    await executeur.query(SQL_ANNULER_SIGNAL, [contexte.org, contexte.tripId, decision.ligne, valeur.requestId]);
    // La question qu'elle a déclenchée est retirée, et sa réponse éventuelle annulée (B10-PO-5 point 4, B10-PO-6).
    const question = etat.questions.find((q: QuestionDuVoyage) => q.declencheur === decision.ligne && q.etat !== "withdrawn");
    if (question !== undefined) {
      if (question.reponse !== null) await executeur.query(SQL_ANNULER_SIGNAL, [contexte.org, contexte.tripId, question.reponse, valeur.requestId]);
      await executeur.query(SQL_ETAT_QUESTION, [contexte.org, contexte.tripId, question.ligne, "withdrawn", null]);
    }
    return { counts: compteurs(await relire(contexte)) };
  });
}

const memeQuestion = (a: PreferencePrompt, b: PreferencePrompt) =>
  a.kind === b.kind && (a.kind === "distance" || (b.kind === "category" && a.category === b.category));

export function repondreQuestion(dependances: DependancesTri, entree: unknown) {
  return executerActionVoyage(
    "answer-preference-prompt",
    dependances,
    PreferenceAnswerRequestSchema,
    entree,
    async (executeur, ctx, valeur): Promise<PreferenceAnswerResult> => {
      const contexte = { executeur, org: ctx.organizationId, tripId: valeur.tripId, maintenant: horloge(dependances) };
      const etat = await ouvrir(contexte);
      const signal = valeur.answer === "yes" ? "answerYes" : "answerNo";
      const categorie = valeur.prompt.kind === "category" ? valeur.prompt.category : null;

      const deja = signalParRequete(etat, valeur.requestId);
      if (deja !== undefined) {
        if (deja.signal !== signal || deja.category !== categorie || deja.reason !== valeur.reason || deja.proposition !== null) throw refus();
        return { next: null, counts: compteurs(etat) };
      }
      if (annulationParRequete(etat, valeur.requestId)) throw refus();

      // Seule la question ouverte du tri, posée par le serveur, accepte une réponse (B10-PO-5 point 3) ; la question de
      // distance n'est jamais posée avant B10f (B10-PO-16 point 5).
      const ouverte = questionOuverte(etat);
      if (ouverte === null || !memeQuestion(ouverte.prompt, valeur.prompt) || categorie === null) throw refus();

      const ecrite = await executeur.query(SQL_INSERER_REPONSE, [contexte.org, contexte.tripId, valeur.requestId, categorie, signal, valeur.reason ?? null]);
      const ligne = ecrite.rows[0]?.id;
      if (typeof ligne !== "string") throw refus();
      await executeur.query(SQL_ETAT_QUESTION, [contexte.org, contexte.tripId, ouverte.ligne, "answered", ligne]);
      return { next: null, counts: compteurs(await relire(contexte)) };
    },
  );
}

type LotACommencer = { readonly issue: IssueLot; readonly organizationId: string; readonly tripId: string; readonly ctx: { readonly organizationId: string; readonly userId: string } };

/**
 * `completeDeck` : clôture du tri ouvert (B10a) puis, dans la même transaction et sous le même verrou, la ligne `batch` de ce
 * tri (0119 § 1.3 point 2) si le voyage est débloqué (phase `deck`) ou si l'interrupteur est ouvert (voyage non débloqué) ;
 * interrupteur fermé sur un voyage non débloqué : la clôture seule, ni exécution ni version (`recalcul: rien avant le
 * déblocage`). Le workflow 5 n'est démarré qu'**après** la validation, pour la seule ligne que cet appel a créée (un rejeu ne
 * démarre rien).
 */
export async function cloreTri(dependances: DependancesTri, entree: unknown) {
  const recalculOuvert = dependances.recalculFinApercu ?? RECALCUL_FIN_APERCU;
  const maintenant = horloge(dependances);
  const suivi: { lot: LotACommencer | null } = { lot: null };
  const resultat = await executerActionVoyage("complete-deck", dependances, CompleteDeckRequestSchema, entree, async (executeur, ctx, valeur): Promise<CompleteDeckResult> => {
    suivi.lot = null;
    const contexte = { executeur, org: ctx.organizationId, tripId: valeur.tripId, maintenant };
    const etat = await ouvrir(contexte);
    const rejouee = (await executeur.query(SQL_CLOTURE_PAR_REQUETE, [contexte.org, contexte.tripId, valeur.requestId])).rows.length > 0;
    // Clôture rejouée, tri déjà clos (autre onglet) ou sans carte : même réponse, sans écriture (0112 § 3.4).
    if (rejouee || etat.execution === null || etat.cartes.length === 0 || triClos(etat)) return { deck: sessionDuTri(etat, valeur.tripId) };
    const close = (await executeur.query(SQL_CLORE, [contexte.org, contexte.tripId, etat.execution, etat.phase, etat.dernierePosition, valeur.requestId])).rows[0]?.id;
    await executeur.query(SQL_FERMER_QUESTION_OUVERTE, [contexte.org, contexte.tripId]);
    if (typeof close === "string" && (etat.phase === "deck" || recalculOuvert)) {
      const issue = await ouvrirLotApresCloture(executeur, { organizationId: contexte.org, tripId: contexte.tripId, clotureId: close, maintenant: maintenant() });
      suivi.lot = { issue, organizationId: contexte.org, tripId: contexte.tripId, ctx: { organizationId: ctx.organizationId, userId: ctx.userId } };
    }
    return { deck: sessionDuTri(await relire(contexte), valeur.tripId) };
  });
  const lot = suivi.lot;
  if (resultat.ok && lot !== null) {
    // Après la validation : journal d'une ligne attendue absente, puis démarrage de la ligne créée par cet appel.
    signalerLotNonCree(lot.organizationId, lot.tripId, lot.issue);
    if (lot.issue.statut === "cree") {
      const withOrg = dependances.withOrg ?? withOrgParDefaut;
      await demarrerLot(
        (travail) => withOrg(lot.ctx, (tx) => travail(executeurSql(tx))),
        dependances.demarrerRecalcul ?? demarrerRecalculReel,
        { organizationId: lot.organizationId, tripId: lot.tripId, generationRunId: lot.issue.generationRunId, maintenant },
      );
    }
  }
  return resultat;
}
