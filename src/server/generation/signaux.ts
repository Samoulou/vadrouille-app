import "server-only";

import { ProposalRecordSchema, type Category } from "@/contracts";
import { CATEGORIES, PREFERENCE_REASONS, PREFERENCE_SIGNAL_ORIGINS, PREFERENCE_SIGNAL_STATUSES, PREFERENCE_SIGNALS } from "@/contracts/values";
import type { PropositionDuRecalcul, SignalDuRecalcul, TriDuRecalcul } from "@/domain/recalcul";
import { optionsDesRepas } from "@/domain/recomposition";
import { SQL_CASES } from "@/server/presentation/etat";

import { LectureIllisible } from "./illisible";
import type { ExecuteurLecture } from "./lecture";

/**
 * Lecture des signaux de préférence par la génération (spécification B10, B10b points 3 et 4 ; décision 0119 § 1.1 point 3,
 * § 2.2 point 4 et § 3 point 2) : **module unique**, lu par le voyage complet (workflow 4 : réserve filtrée de chaque jour) et
 * par le recalcul d'un tri (workflow 5, `completeDeck` et la suite du déblocage : jours touchés, plan de chaque jour). Les
 * signaux arrivent au domaine sous ses types locaux (`SignalDuRecalcul`, `PropositionDuRecalcul`), construits ici depuis les
 * colonnes de `preference_signals`, `preference_prompts`, `proposals` et `deck_closures` ; `PreferenceSignalSchema` n'est pas
 * étendu (B10b n'a pas de PR de contrat).
 *
 * Chaque requête porte `organization_id = $1` (en plus de la RLS). Des cases, seuls l'identifiant de ligne, la nature, la
 * catégorie, le jour, l'heure, l'identifiant d'étape, le candidat et le `placeId` (seul identifiant Google stocké) sont gardés :
 * aucun nom de lieu ne sort de ce module. Rien n'est écrit.
 */

const SQL_SIGNAUX_ACTIFS = `SELECT id, signal, category, origin, status, reason, candidate_id, place_id, proposal_id
  FROM public.preference_signals WHERE organization_id = $1 AND trip_id = $2 AND status <> 'cancelled' ORDER BY seq`;

const SQL_QUESTIONS = `SELECT trigger_signal_id, answer_signal_id FROM public.preference_prompts
  WHERE organization_id = $1 AND trip_id = $2 AND answer_signal_id IS NOT NULL`;

/** Clôture d'un tri et la position couverte par la clôture précédente de la même exécution et de la même phase (lots de B10d). */
const SQL_CLOTURE = `SELECT c.generation_run_id, c.phase, c.through_position,
    (SELECT max(p.through_position) FROM public.deck_closures p
      WHERE p.organization_id = c.organization_id AND p.trip_id = c.trip_id AND p.generation_run_id = c.generation_run_id
        AND p.phase = c.phase AND p.through_position < c.through_position) AS precedente
  FROM public.deck_closures c WHERE c.organization_id = $1 AND c.trip_id = $2 AND c.id = $3`;

/** Catégorie de chaque lieu ancré du voyage (étape d'un jour sans case : catégorie arrêtée, `TriDuRecalcul.categories`). */
const SQL_CATEGORIES = `SELECT DISTINCT ON (place_id) place_id, category FROM public.candidates
  WHERE organization_id = $1 AND trip_id = $2 AND place_id IS NOT NULL ORDER BY place_id, created_at, id`;

const invalide = () => new LectureIllisible();
const texte = (valeur: unknown): string => {
  if (typeof valeur !== "string") throw invalide();
  return valeur;
};
const texteOuRien = (valeur: unknown): string | undefined => (valeur === null || valeur === undefined ? undefined : texte(valeur));
function dansListe<T extends string>(liste: readonly T[], valeur: unknown): T {
  const trouve = liste.find((element) => element === valeur);
  if (trouve === undefined) throw invalide();
  return trouve;
}

/** Signal lu : forme du domaine, plus l'identifiant de sa ligne. `proposalId` : identifiant de la ligne `proposals`. */
export type SignalLuDuRecalcul = SignalDuRecalcul & { readonly ligne: string };

function signalDe(ligne: Record<string, unknown>): SignalLuDuRecalcul {
  const reason = ligne.reason === null ? undefined : dansListe(PREFERENCE_REASONS, ligne.reason);
  const candidatId = texteOuRien(ligne.candidate_id);
  const placeId = texteOuRien(ligne.place_id);
  const proposalId = texteOuRien(ligne.proposal_id);
  return {
    signal: dansListe(PREFERENCE_SIGNALS, ligne.signal),
    category: ligne.category === null ? null : dansListe(CATEGORIES, ligne.category),
    origin: dansListe(PREFERENCE_SIGNAL_ORIGINS, ligne.origin),
    status: dansListe(PREFERENCE_SIGNAL_STATUSES, ligne.status),
    ...(reason === undefined ? {} : { reason }),
    ...(proposalId === undefined ? {} : { proposalId }),
    ...(candidatId === undefined ? {} : { candidatId }),
    ...(placeId === undefined ? {} : { placeId }),
    ligne: texte(ligne.id),
  };
}

/**
 * Signaux **actifs** du voyage (`status <> 'cancelled'`), dans l'ordre d'écriture : filtre de la réserve (B10-PO-10 point 1).
 * Le workflow 4 les lit dans la même transaction que ses candidats, avant la planification du jour (B10-PO-12).
 */
export async function lireSignauxActifs(x: ExecuteurLecture, organizationId: string, tripId: string): Promise<SignalLuDuRecalcul[]> {
  return (await x.query(SQL_SIGNAUX_ACTIFS, [organizationId, tripId])).rows.map(signalDe);
}

/** Tri clos lu pour le recalcul : signaux et cases de ce tri, et le candidat de chaque case (repas choisis, B10-PO-10 point 3). */
export type TriClosLu = TriDuRecalcul & {
  /** Candidat (`proposals.candidate_id`) de chaque case de ce tri, par identifiant de ligne. */
  readonly candidats: ReadonlyMap<string, string>;
};

/**
 * Tri clos par la clôture `clotureId` (0119 § 1.1 point 3, 0112 § 3.4) : cases de même exécution et de même phase que la
 * clôture, de position au plus égale à la sienne et strictement supérieure à celle de la clôture précédente ; signaux de ce tri :
 * décisions actives sur ces cases, et réponses actives aux questions qu'une de ces décisions a déclenchées. Clôture absente dans
 * l'organisation : `invalid_input`.
 *
 * **Nombre réel d'options** d'un créneau de repas (Q582) : compté sur **toutes** les cases de l'exécution et de la phase (pas
 * seulement celles de ce tri ni le plus grand rang observé), et passé au domaine dans `option.total`.
 */
export async function lireTriClos(x: ExecuteurLecture, organizationId: string, tripId: string, clotureId: string): Promise<TriClosLu> {
  const cloture = (await x.query(SQL_CLOTURE, [organizationId, tripId, clotureId])).rows[0];
  if (cloture === undefined) throw invalide();
  const jusqua = Number(cloture.through_position);
  const depuis = cloture.precedente === null || cloture.precedente === undefined ? 0 : Number(cloture.precedente);
  const lignes = (await x.query(SQL_CASES, [organizationId, tripId, texte(cloture.generation_run_id), texte(cloture.phase)])).rows.filter(
    (ligne) => ligne.slot_type === "proposal",
  );
  const records = lignes.map((ligne) => {
    const lu = ProposalRecordSchema.safeParse(ligne.content);
    if (!lu.success || lu.data.day !== ligne.day || lu.data.time !== ligne.time || lu.data.kind !== ligne.kind) throw invalide();
    return lu.data;
  });
  const options = optionsDesRepas(records);
  const totaux = new Map<string, number>();
  for (const record of records) if (record.kind === "meal") totaux.set(`${record.day}|${record.time}`, (totaux.get(`${record.day}|${record.time}`) ?? 0) + 1);

  const propositions: PropositionDuRecalcul[] = [];
  const candidats = new Map<string, string>();
  lignes.forEach((ligne, rang) => {
    const position = Number(ligne.position);
    if (position <= depuis || position > jusqua) return;
    const record = records[rang];
    if (record === undefined) return;
    const option = options[rang];
    const id = texte(ligne.id);
    propositions.push({
      id,
      kind: record.kind,
      category: record.category,
      day: record.day,
      time: record.time,
      ...(option === undefined ? {} : { option: { index: option.index, total: totaux.get(`${record.day}|${record.time}`) ?? option.index } }),
      stopId: record.stop.id,
      ...(record.stop.placeId === undefined ? {} : { placeId: record.stop.placeId }),
    });
    const candidat = texteOuRien(ligne.candidate_id);
    if (candidat !== undefined) candidats.set(id, candidat);
  });

  const duTri = new Set(propositions.map((p) => p.id));
  const actifs = await lireSignauxActifs(x, organizationId, tripId);
  const decisions = actifs.filter((s) => s.proposalId !== undefined && duTri.has(s.proposalId));
  const declencheurs = new Set(decisions.map((s) => s.ligne));
  const reponses = new Set(
    (await x.query(SQL_QUESTIONS, [organizationId, tripId])).rows.flatMap((q) => (declencheurs.has(String(q.trigger_signal_id)) ? [String(q.answer_signal_id)] : [])),
  );
  const signaux = actifs.filter((s) => declencheurs.has(s.ligne) || reponses.has(s.ligne));
  const categories = new Map<string, Category>((await x.query(SQL_CATEGORIES, [organizationId, tripId])).rows.map((l) => [texte(l.place_id), dansListe(CATEGORIES, l.category)] as const));
  return { signaux, propositions, categories, candidats };
}
