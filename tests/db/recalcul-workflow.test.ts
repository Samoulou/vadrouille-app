import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createApiCreationAdapter } from "@/adapters/api-creation";
import type { Category } from "@/contracts";
import { composerSimuleeAvec, type FabriqueGeneration } from "@/server/composition/generation";
import { EXPIRATION_EXECUTION_MS } from "@/server/config/generation";
import type { PlafondsUsage } from "@/server/config/usage";
import type { DependancesGeneration } from "@/server/generation/dependances";
import {
  etapeCompletAncrage,
  etapeCompletDebut,
  etapeCompletLogement,
  etapeCompletNotation,
  etapeCompletPlanification,
  etapeCompletRecherche,
} from "@/server/generation/etapes-complet";
import { etapeLotDebut, etapeLotPlanification } from "@/server/generation/etapes-lot";
import { EtatLotSchema, type EtatComplet, type EtatLot } from "@/server/generation/etat";
import { requestIdDuLot } from "@/server/generation/lot";
import { creerSuiteVoyageComplet, DemarrageVoyageCompletError } from "@/server/payment/suite-voyage-complet";
import { SQL_VERROU_TRI } from "@/server/presentation/etat";
import { cloreTri, deciderCarte, repondreQuestion, type DependancesTri } from "@/server/presentation/tri";
import { SQL_VERROU_VERSIONS } from "@/server/versions/ecrire";
import type { OrgTransaction } from "@/server/with-org";

import { ETAPES, MAINTENANT, PLAFONDS_LARGES, contexteDe, creerHorlogeManuelle, creerWithOrg, creerWithSystemOrgPourTests, demandeEdimbourg, derouler, doublesEdimbourg } from "../support/banc-apercu";
import { journalDePrompts } from "../support/journal-prompts";
import { avecSentinellesGoogle, sentinellesPresentes } from "../support/sentinelles-google";
import { creerBaseApercu, type BaseApercu } from "./base-apercu";
import { closeAll, connectBaseJetable, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * B10b-serveur (ticket #662 ; spécification B10, critères « B10b » ; décision 0119 § 1 à § 4 ; verdict 0120 S1 à S7) : workflow 5
 * `batchRecompute` sur une base réelle jetable, doubles de fournisseurs (variante simulée, fixtures d'Édimbourg, valeurs
 * sentinelles). Aucune clé, aucun appel réel : les démarreurs des workflows 4 et 5 sont des espions, et les étapes sont déroulées
 * comme `batchRecompute` et `generateFullTrip`.
 *
 * Aperçu des fixtures (six jours, une ville, logement connu) : jour 1 `v1-j1-1` (walk), `v1-j1-2` (walk), `v1-j1-3` (nature) ;
 * jour 2 `v1-j2-1` (walk), `v1-j2-2` (museum), `v1-j2-3` (nature) ; aucun repas placé (créneaux `openMeal`) : les critères des
 * repas choisis ou refusés sont tenus par le domaine (`src/domain/recalcul.test.ts`), sur des jours construits.
 */

let base: BaseApercu;
let withOrg: ReturnType<typeof creerWithOrg>;
let app: DbClient;
let auth: DbClient;
let admin: DbClient;

beforeAll(async () => {
  base = await creerBaseApercu("lot5");
  ({ app, auth, admin } = base);
  withOrg = creerWithOrg(base.db);
}, 120_000);
afterAll(async () => {
  await base.supprimer();
  await closeAll();
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Plafonds de test (valeurs de test, sans lien avec les montants réels, réservés à Samuel) : ceux des bancs, cumul élargi. */
const PLAFONDS: PlafondsUsage = { ...PLAFONDS_LARGES, parOrganisationJourMicros: 500_000_000 };

const dependances = (fabrique?: () => FabriqueGeneration, plafonds: PlafondsUsage = PLAFONDS): DependancesGeneration => ({
  transaction: creerWithSystemOrgPourTests(base.db),
  horloge: creerHorlogeManuelle(MAINTENANT),
  plafonds,
  barriere: { env: { VADROUILLE_ENV: "ci" } },
  reserverEnSimulee: true,
  ...(fabrique === undefined ? {} : { composition: fabrique }),
});

/** Déroule le workflow 5 comme `batchRecompute` : arrêt sur un code, ou sur une étape qui rend son entrée inchangée. */
async function deroulerLot(entree: EtatLot, deps: DependancesGeneration): Promise<{ readonly fin: EtatLot; readonly sorties: EtatLot[] }> {
  const sorties: EtatLot[] = [];
  let etat = entree;
  for (const etape of [etapeLotDebut, etapeLotPlanification]) {
    const suivant = await etape(etat, deps);
    sorties.push(suivant);
    if (suivant.arret !== undefined || suivant.rang === etat.rang) return { fin: suivant, sorties };
    etat = suivant;
  }
  return { fin: etat, sorties };
}

const ETAPES_JOUR = [etapeCompletRecherche, etapeCompletAncrage, etapeCompletNotation, etapeCompletPlanification] as const;
async function deroulerComplet(entree: EtatComplet, deps: DependancesGeneration): Promise<EtatComplet> {
  let etat = entree;
  for (const etape of [etapeCompletDebut, etapeCompletLogement, ...Array.from({ length: 30 }, () => ETAPES_JOUR).flat()]) {
    const suivant = await etape(etat, deps);
    if (suivant.arret !== undefined || suivant.rang === etat.rang) return suivant;
    etat = suivant;
  }
  return etat;
}

// --- Voyage, tri, déblocage ------------------------------------------------------------------------------------------------

type Demarreur = (generationRunId: string, organizationId: string) => Promise<string | null>;
const espionLot = () => vi.fn<Demarreur>(async () => `wrun_lot_${crypto.randomUUID()}`);
const espionComplet = () => vi.fn<Demarreur>(async () => `wrun_complet_${crypto.randomUUID()}`);

const triDe = (org: Org, options: { demarrer?: Demarreur; ouvert?: boolean; maintenant?: number } = {}): DependancesTri => ({
  contexte: async () => contexteDe(org),
  withOrg,
  maintenant: () => options.maintenant ?? MAINTENANT,
  demarrerRecalcul: options.demarrer ?? espionLot(),
  recalculFinApercu: options.ouvert ?? false,
});

/**
 * Aperçu publié d'un voyage de six jours (non débloqué). `avantPlanification` : appelé entre la notation et la planification de
 * l'aperçu (étape `e`), sur le voyage, pour un test qui doit fixer ses candidats avant tout classement.
 */
async function apercuPublie(org: Org, avantPlanification?: (tripId: string) => Promise<void>): Promise<string> {
  const adapter = createApiCreationAdapter({ withOrg, maintenant: () => MAINTENANT, demarrerApercu: vi.fn(async () => null), demarrerVoyageComplet: vi.fn(async () => null) });
  const r = await adapter.createTrip(contexteDe(org), demandeEdimbourg());
  expect(r).toMatchObject({ ok: true });
  const tripId = (r as { value: { tripId: string } }).value.tripId;
  const apercu = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT id FROM public.generation_runs WHERE trip_id = $1 AND kind = 'preview'", [tripId])).rows[0].id as string);
  const entree = { generationRunId: apercu, organizationId: org.org, rang: 0 };
  if (avantPlanification === undefined) {
    expect((await derouler(entree, dependances())).arret).toBeUndefined();
    return tripId;
  }
  const notee = await derouler(entree, dependances(), ETAPES.length - 1);
  expect(notee.arret).toBeUndefined();
  await avantPlanification(tripId);
  expect((await ETAPES[ETAPES.length - 1](notee, dependances())).arret).toBeUndefined();
  return tripId;
}

const decider = (org: Org, tripId: string, proposalId: string, decision: "like" | "dislike" | "choose" | "nextOption", dep: DependancesTri = triDe(org)) =>
  deciderCarte(dep, { tripId, requestId: crypto.randomUUID(), proposalId, decision });
const repondre = (org: Org, tripId: string, category: Category, answer: "yes" | "no", reason?: "tooFar" | "notMyStyle") =>
  repondreQuestion(triDe(org), { tripId, requestId: crypto.randomUUID(), prompt: { kind: "category", category }, answer, ...(reason === undefined ? {} : { reason }) });
const clore = (dep: DependancesTri, tripId: string, requestId: string = crypto.randomUUID()) => cloreTri(dep, { tripId, requestId });

async function debloquer(org: Org, tripId: string): Promise<string> {
  return (await admin.query("INSERT INTO public.entitlements (organization_id, trip_id, kind) VALUES ($1, $2, 'tripUnlocked') RETURNING id", [org.org, tripId])).rows[0].id as string;
}

type Transaction = <T>(organizationId: string, fn: (tx: OrgTransaction) => Promise<T>) => Promise<T>;
const suite = (options: { demarrer?: Demarreur; demarrerRecalcul?: Demarreur; transaction?: Transaction } = {}) =>
  creerSuiteVoyageComplet({
    transaction: options.transaction ?? creerWithSystemOrgPourTests(base.db),
    demarrer: options.demarrer ?? espionComplet(),
    demarrerRecalcul: options.demarrerRecalcul ?? espionLot(),
    maintenant: () => MAINTENANT,
  });

type Etape = { id: string; placeId?: string; kind: string; reason?: string };
type Instantane = { days: { index: number; items: { type: string; stop?: Etape }[] }[] };
type LigneLot = { id: string; trip_id: string; phase: string; stop_reason: string | null; base_version: number; deck_closure_id: string; request_id: string; last_version: number | null };
type Lignes = {
  readonly lots: LigneLot[];
  readonly executions: { id: string; kind: string; phase: string; stop_reason: string | null }[];
  readonly versions: { version: number; request_id: string | null; author_kind: string; snapshot: Instantane }[];
  readonly clotures: { id: string; phase: string; through_position: number }[];
  readonly courante: number;
  readonly signaux: Record<string, unknown>[];
  readonly droits: number;
};

async function lignes(org: Org, tripId: string): Promise<Lignes> {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => ({
    lots: (
      await c.query(
        `SELECT id, kind, organization_id, trip_id, phase, stop_reason, base_version, deck_closure_id, request_id, last_version, workflow_run_id, step, step_seq
         FROM public.generation_runs WHERE trip_id = $1 AND kind = 'batch' ORDER BY started_at`,
        [tripId],
      )
    ).rows,
    executions: (await c.query("SELECT id, kind, phase, stop_reason, updated_at FROM public.generation_runs WHERE trip_id = $1 ORDER BY started_at, id", [tripId])).rows,
    versions: (await c.query("SELECT version, request_id, author_kind, snapshot FROM public.trip_versions WHERE trip_id = $1 ORDER BY version", [tripId])).rows,
    clotures: (await c.query("SELECT id, generation_run_id, phase, through_position, request_id FROM public.deck_closures WHERE trip_id = $1 ORDER BY through_position", [tripId])).rows,
    courante: (await c.query("SELECT current_version FROM public.trips WHERE id = $1", [tripId])).rows[0]?.current_version as number,
    signaux: (await c.query("SELECT * FROM public.preference_signals WHERE trip_id = $1 ORDER BY seq", [tripId])).rows,
    droits: (await c.query("SELECT count(*)::int AS n FROM public.entitlements WHERE trip_id = $1", [tripId])).rows[0].n as number,
  }));
}

const etapes = (instantane: Instantane, index: number): Etape[] =>
  instantane.days.find((d) => d.index === index)?.items.flatMap((i) => (i.type === "stop" && i.stop !== undefined ? [i.stop] : [])) ?? [];
const lieux = (instantane: Instantane, index?: number): string[] =>
  instantane.days.filter((d) => index === undefined || d.index === index).flatMap((d) => etapes(instantane, d.index).flatMap((s) => (s.placeId === undefined ? [] : [s.placeId])));
const jour = (instantane: Instantane, index: number) => instantane.days.find((d) => d.index === index);
const lot = (l: Lignes): LigneLot => {
  const ligne = l.lots[0];
  if (ligne === undefined) throw new Error("aucune ligne batch");
  return ligne;
};
const entreeDuLot = (org: Org, l: Lignes): EtatLot => ({ generationRunId: lot(l).id, organizationId: org.org, rang: 0 });
const complet = (l: Lignes) => {
  const ligne = l.executions.find((e) => e.kind === "full");
  if (ligne === undefined) throw new Error("aucune ligne full");
  return ligne;
};
const journalTexte = (...espions: { mock: { calls: unknown[][] } }[]) => JSON.stringify(espions.flatMap((e) => e.mock.calls));

/**
 * Voyage débloqué après un tri de l'aperçu : décisions (`trier`), droit, suite du déblocage (clôture de l'aperçu, ligne `batch`
 * démarrée par l'espion, ligne `full` démarrée par l'espion).
 */
async function trieEtDebloque(org: Org, trier: (tripId: string) => Promise<void>, avantPlanification?: (tripId: string) => Promise<void>) {
  const tripId = await apercuPublie(org, avantPlanification);
  await trier(tripId);
  const entitlementId = await debloquer(org, tripId);
  const demarrerRecalcul = espionLot();
  const demarrer = espionComplet();
  await suite({ demarrer, demarrerRecalcul })({ entitlementId, tripId, organizationId: org.org });
  return { tripId, entitlementId, demarrerRecalcul, demarrer, avant: await lignes(org, tripId) };
}

const ecarter003 = (org: Org) => async (tripId: string) => {
  expect((await decider(org, tripId, "v1-j1-1", "dislike")).ok).toBe(true);
};

// --- Critères de la spécification ------------------------------------------------------------------------------------------

describe("recalcul (B10b) : le programme suit le tri", () => {
  it("recalcul: un lieu écarté ne revient pas dans le voyage (version du lot, puis jours du workflow 4)", async () => {
    const org = await createOrg(auth);
    const { tripId, demarrerRecalcul, avant } = await trieEtDebloque(org, ecarter003(org));
    // Suite du déblocage : clôture du tri de l'aperçu (positions 1 à 8), ligne `batch` sur la version 1, démarrée une fois.
    expect(avant.clotures).toEqual([expect.objectContaining({ phase: "preview", through_position: 8 })]);
    expect(avant.lots).toHaveLength(1);
    const ligne = lot(avant);
    const cloture = avant.clotures[0]!.id;
    expect(ligne).toMatchObject({ phase: "queued", base_version: 1, deck_closure_id: cloture, request_id: requestIdDuLot(cloture) });
    expect(demarrerRecalcul).toHaveBeenCalledTimes(1);
    expect(demarrerRecalcul).toHaveBeenCalledWith(ligne.id, org.org);

    const { fin, sorties } = await deroulerLot(entreeDuLot(org, avant), dependances());
    expect(fin.arret).toBeUndefined();
    for (const s of sorties) expect(EtatLotSchema.safeParse(s).success).toBe(true);
    const apres = await lignes(org, tripId);
    expect(apres.versions).toHaveLength(2);
    const publiee = apres.versions[1]!;
    expect(publiee).toMatchObject({ version: 2, request_id: ligne.request_id, author_kind: "workflow" });
    expect(apres.courante).toBe(2);
    // 0120 S1 point 4 : base_version, deck_closure_id et request_id inchangés à la fin de l'exécution.
    expect(lot(apres)).toMatchObject({ phase: "ready", stop_reason: null, last_version: 2, base_version: 1, deck_closure_id: cloture, request_id: ligne.request_id });
    expect(lieux(publiee.snapshot)).not.toContain("SENTINELLE_PLACE_ID_003");
    // Ce qui est gardé ne bouge pas : 004 et 001 (gardés par défaut) restent au jour 1 ; le jour 2, non touché, est identique.
    expect(lieux(publiee.snapshot, 1)).toEqual(expect.arrayContaining(["SENTINELLE_PLACE_ID_004", "SENTINELLE_PLACE_ID_001"]));
    expect(jour(publiee.snapshot, 2)).toEqual(jour(apres.versions[0]!.snapshot, 2));
    expect(new Set(lieux(publiee.snapshot)).size).toBe(lieux(publiee.snapshot).length);

    // Workflow 4 ensuite : aucun jour planifié n'a le lieu écarté ; les jours du lot ne changent plus.
    expect((await deroulerComplet({ generationRunId: complet(apres).id, organizationId: org.org, rang: 0 }, dependances())).arret).toBeUndefined();
    const finale = (await lignes(org, tripId)).versions.at(-1)!.snapshot;
    expect([3, 4, 5, 6].reduce((n, index) => n + lieux(finale, index).length, 0)).toBeGreaterThan(0);
    expect(lieux(finale)).not.toContain("SENTINELLE_PLACE_ID_003");
    expect(jour(finale, 1)).toEqual(jour(publiee.snapshot, 1));
  }, 180_000);

  it("recalcul: une catégorie arrêtée n'est plus proposée (jours recalculés et jours du workflow 4)", async () => {
    const org = await createOrg(auth);
    const { tripId, avant } = await trieEtDebloque(org, async (id) => {
      expect((await decider(org, id, "v1-j1-1", "dislike")).ok).toBe(true);
      expect((await decider(org, id, "v1-j1-2", "dislike")).ok).toBe(true);
      expect((await repondre(org, id, "walk", "yes")).ok).toBe(true);
    });
    expect(avant.lots).toHaveLength(1);
    expect((await deroulerLot(entreeDuLot(org, avant), dependances())).fin.arret).toBeUndefined();
    const apres = await lignes(org, tripId);
    expect(apres.versions).toHaveLength(2);
    const publiee = apres.versions[1]!.snapshot;
    for (const lieu of ["SENTINELLE_PLACE_ID_003", "SENTINELLE_PLACE_ID_004", "SENTINELLE_PLACE_ID_007"]) expect(lieux(publiee)).not.toContain(lieu);
    expect((await deroulerComplet({ generationRunId: complet(apres).id, organizationId: org.org, rang: 0 }, dependances())).arret).toBeUndefined();
    const finale = (await lignes(org, tripId)).versions.at(-1)!.snapshot;
    const categories = await inTx(app, { org: org.org, user: org.owner }, async (c) =>
      new Map((await c.query("SELECT DISTINCT place_id, category FROM public.candidates WHERE trip_id = $1 AND place_id IS NOT NULL", [tripId])).rows.map((r) => [r.place_id as string, r.category as string])),
    );
    expect(lieux(finale).length).toBeGreaterThan(0);
    for (const lieu of lieux(finale)) expect(categories.get(lieu), lieu).not.toBe("walk");
  }, 180_000);

  it("recalcul: ce qui est gardé ne bouge pas (« J'aime » et gardé par défaut au jour touché, jours non touchés identiques)", async () => {
    const org = await createOrg(auth);
    const { tripId, avant } = await trieEtDebloque(org, async (id) => {
      expect((await decider(org, id, "v1-j1-1", "dislike")).ok).toBe(true);
      expect((await decider(org, id, "v1-j1-2", "like")).ok).toBe(true);
    });
    expect((await deroulerLot(entreeDuLot(org, avant), dependances())).fin.arret).toBeUndefined();
    const apres = await lignes(org, tripId);
    expect(apres.versions).toHaveLength(2);
    const [v1, v2] = [apres.versions[0]!.snapshot, apres.versions[1]!.snapshot];
    const garde = (instantane: Instantane, id: string) => etapes(instantane, 1).find((s) => s.id === id);
    expect(garde(v2, "v1-j1-2")?.placeId).toBe("SENTINELLE_PLACE_ID_004");
    expect(garde(v2, "v1-j1-3")?.placeId).toBe("SENTINELLE_PLACE_ID_001");
    // Une étape gardée n'est pas un remplaçant : sa raison est celle de l'aperçu.
    expect(garde(v2, "v1-j1-2")?.reason).toBe(garde(v1, "v1-j1-2")?.reason);
    for (const index of [2, 3, 4, 5, 6]) expect(jour(v2, index)).toEqual(jour(v1, index));
  }, 180_000);

  it("recalcul: réserve épuisée, aucun lieu inventé ; recalcul: aucun appel de modèle hors des raisons", async () => {
    const org = await createOrg(auth);
    const { tripId, avant } = await trieEtDebloque(org, ecarter003(org));
    const journaux: ReturnType<typeof journalDePrompts>[] = [];
    const recherches: unknown[] = [];
    const fabrique = () =>
      composerSimuleeAvec({
        doubles: () => {
          const d = doublesEdimbourg();
          const j = journalDePrompts(d.modeles);
          journaux.push(j);
          const rechercheWeb = Object.fromEntries(
            Object.entries(d.rechercheWeb).map(([nom, f]) => [nom, typeof f === "function" ? (...args: unknown[]) => (recherches.push(args[0]), (f as (...a: unknown[]) => unknown).apply(d.rechercheWeb, args)) : f]),
          ) as typeof d.rechercheWeb;
          return { ...d, modeles: j.client, rechercheWeb };
        },
      });
    expect((await deroulerLot(entreeDuLot(org, avant), dependances(fabrique))).fin.arret).toBeUndefined();
    const requetes = journaux.flatMap((j) => j.requetes);
    expect(requetes.length).toBeLessThanOrEqual(1);
    for (const r of requetes) expect(r.etape).toBe("raisons");
    expect(recherches).toEqual([]);
    // Chaque lieu publié est un candidat ancré du voyage (aucun lieu non ancré, aucun lieu inventé).
    const publiee = (await lignes(org, tripId)).versions.at(-1)!.snapshot;
    const ancres = await inTx(app, { org: org.org, user: org.owner }, async (c) => new Set((await c.query("SELECT place_id FROM public.candidates WHERE trip_id = $1 AND place_id IS NOT NULL", [tripId])).rows.map((r) => r.place_id as string)));
    for (const lieu of lieux(publiee)) expect(ancres.has(lieu), lieu).toBe(true);
  }, 180_000);

  /**
   * Le classement départage deux candidats de même score par leur identifiant (`classer`, ordre total) : tiré au hasard par la
   * base, il ferait varier les remplaçants d'un voyage à l'autre. Pour comparer deux voyages octet pour octet, les identifiants
   * des candidats sont réécrits (superutilisateur du banc, avant la planification de l'aperçu) dans l'ordre de leur nom, propre à chaque
   * organisation ; les références (`proposals`, `event_occurrences`) suivent. Jeu de test seulement.
   */
  const idsOrdonnesParNom = async (tripId: string) => {
    await admin.query("BEGIN");
    try {
      await admin.query("SET LOCAL session_replication_role = replica");
      await admin.query(
        `CREATE TEMP TABLE correspondance ON COMMIT DROP AS
           SELECT id AS ancien, (lpad(to_hex(row_number() OVER (ORDER BY name, place_id)::int), 8, '0') || '-' || substr(md5(organization_id::text || name), 1, 4) || '-4' ||
             substr(md5(organization_id::text || name), 5, 3) || '-8' || substr(md5(organization_id::text || name), 8, 3) || '-' || substr(md5(organization_id::text || name), 11, 12))::uuid AS nouveau
           FROM public.candidates WHERE trip_id = $1`,
        [tripId],
      );
      await admin.query("UPDATE public.candidates c SET id = m.nouveau FROM correspondance m WHERE c.id = m.ancien");
      await admin.query("UPDATE public.proposals p SET candidate_id = m.nouveau FROM correspondance m WHERE p.candidate_id = m.ancien");
      await admin.query("UPDATE public.event_occurrences o SET candidate_id = m.nouveau FROM correspondance m WHERE o.candidate_id = m.ancien");
      await admin.query("COMMIT");
    } catch (erreur) {
      await admin.query("ROLLBACK");
      throw erreur;
    }
  };

  it("recalcul: aucune préférence dans un prompt (octet pour octet) ; prompts: aucune donnée Google dans la requête raisons du lot (canari)", async () => {
    // Mêmes remplaçants des deux côtés : deux refus walk au jour 1 ; le second voyage y ajoute une réponse « Non » avec sa raison
    // et un « J'aime » au jour 2 (aucun ne touche de jour).
    const journal = async (avecPreferences: boolean) => {
      const org = await createOrg(auth);
      const { tripId, avant } = await trieEtDebloque(org, async (id) => {
        expect((await decider(org, id, "v1-j1-1", "dislike")).ok).toBe(true);
        expect((await decider(org, id, "v1-j1-2", "dislike")).ok).toBe(true);
        if (avecPreferences) {
          expect((await repondre(org, id, "walk", "no", "notMyStyle")).ok).toBe(true);
          expect((await decider(org, id, "v1-j2-2", "like")).ok).toBe(true);
        }
      }, idsOrdonnesParNom);
      const decores: ReturnType<typeof avecSentinellesGoogle>[] = [];
      const journaux: ReturnType<typeof journalDePrompts>[] = [];
      const fabrique = () =>
        composerSimuleeAvec({
          doubles: () => {
            const d = doublesEdimbourg();
            const s = avecSentinellesGoogle(d);
            decores.push(s);
            const j = journalDePrompts(d.modeles);
            journaux.push(j);
            // Même décor que `apercu-revue.test.ts` : le niveau de prix reste celui du double (il décide de l'admission d'un repas ou
            // d'une dégustation au budget du brief) ; toutes les autres valeurs de la fiche sont des sentinelles.
            const places = {
              ...d.places,
              textSearch: s.places.textSearch,
              async details(placeId: string) {
                const [decore, brut] = await Promise.all([s.places.details(placeId), d.places.details(placeId)]);
                return { ...decore, niveauPrix: brut.niveauPrix };
              },
            };
            return { ...d, places, routes: s.routes, modeles: j.client };
          },
        });
      expect((await deroulerLot(entreeDuLot(org, avant), dependances(fabrique))).fin.arret).toBeUndefined();
      return { requetes: journaux.flatMap((j) => j.requetes), valeurs: new Set(decores.flatMap((d) => [...d.valeurs])), signaux: (await lignes(org, tripId)).signaux };
    };
    const a = await journal(false);
    const b = await journal(true);
    expect(b.signaux.some((s) => s.reason === "notMyStyle")).toBe(true);
    expect(a.requetes).toHaveLength(1);
    expect(a.requetes[0]!.etape).toBe("raisons");
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
    const texte = (r: typeof a) => JSON.stringify(r.requetes).replace(uuid, "<uuid>");
    expect(texte(b)).toBe(texte(a));
    for (const interdit of ["notMyStyle", "tooFar", "dislike", "answerNo", "answerYes", "SENTINELLE_PLACE_ID"]) expect(texte(b)).not.toContain(interdit);
    // Canari : les doubles Google ont rendu leurs valeurs sentinelles (relectures du lot) ; aucune n'entre dans la requête.
    expect(a.valeurs.size).toBeGreaterThan(5);
    expect(sentinellesPresentes(texte(a), { valeurs: a.valeurs })).toEqual([]);
    expect(sentinellesPresentes(texte(b), { valeurs: b.valeurs })).toEqual([]);
  }, 240_000);
});

describe("recalcul (B10b) : une exécution par tri clos, rien avant le déblocage", () => {
  it("recalcul: une seule exécution par version de base (suite rejouée, completeDeck rejoué et concurrent, interrupteur ouvert)", async () => {
    const org = await createOrg(auth);
    // Déblocage rejoué trois fois : une ligne, un démarrage.
    const { tripId, entitlementId, avant } = await trieEtDebloque(org, ecarter003(org));
    const demarrerRecalcul = espionLot();
    for (let i = 0; i < 3; i += 1) await suite({ demarrerRecalcul })({ entitlementId, tripId, organizationId: org.org });
    const apres = await lignes(org, tripId);
    expect(apres.lots).toEqual(avant.lots);
    expect(apres.clotures).toEqual(avant.clotures);
    expect(demarrerRecalcul).not.toHaveBeenCalled();

    // Interrupteur ouvert (valeur simulée) : deux completeDeck simultanés de requestId distincts, puis le premier rejoué.
    const autre = await createOrg(auth);
    const voyage = await apercuPublie(autre);
    expect((await decider(autre, voyage, "v1-j1-1", "dislike")).ok).toBe(true);
    const demarrer = espionLot();
    const dep = triDe(autre, { ouvert: true, demarrer });
    const requestId = crypto.randomUUID();
    const [un, deux] = await Promise.all([clore(dep, voyage, requestId), clore(dep, voyage)]);
    expect(un.ok).toBe(true);
    const ouvert = await lignes(autre, voyage);
    expect(ouvert.clotures).toHaveLength(1);
    expect(ouvert.lots).toHaveLength(1);
    expect(lot(ouvert)).toMatchObject({ phase: "queued", base_version: 1, deck_closure_id: ouvert.clotures[0]!.id });
    expect(demarrer).toHaveBeenCalledTimes(1);
    // Le second, sérialisé par le verrou du tri, voit le lot en cours : generation_in_progress, ou la même session close.
    expect(deux.ok ? "clos" : (deux.error as { code: string }).code).toMatch(/^(clos|generation_in_progress)$/);
    // Rejouée pendant le recalcul : refusée sans écriture ; une décision aussi.
    expect(await clore(dep, voyage, requestId)).toEqual({ ok: false, error: expect.objectContaining({ code: "generation_in_progress", retryable: true }) });
    expect(await decider(autre, voyage, "v1-j1-2", "like")).toEqual({ ok: false, error: expect.objectContaining({ code: "generation_in_progress", retryable: true }) });
    expect(await lignes(autre, voyage)).toEqual(ouvert);
    expect(demarrer).toHaveBeenCalledTimes(1);
    // Déblocage ensuite : la clôture et la ligne de completeDeck sont reprises telles quelles (aucune seconde ligne).
    const droit = await debloquer(autre, voyage);
    const relance = espionLot();
    await suite({ demarrerRecalcul: relance })({ entitlementId: droit, tripId: voyage, organizationId: autre.org });
    const debloque = await lignes(autre, voyage);
    expect(debloque.clotures).toEqual(ouvert.clotures);
    expect(debloque.lots).toEqual(ouvert.lots);
    expect(relance).not.toHaveBeenCalled();
  }, 240_000);

  it("completeDeck sans signal qui touche un jour planifié (« J'aime » seul) : aucune exécution, au déblocage comme interrupteur ouvert", async () => {
    const org = await createOrg(auth);
    const { demarrerRecalcul, avant } = await trieEtDebloque(org, async (id) => {
      expect((await decider(org, id, "v1-j1-1", "like")).ok).toBe(true);
    });
    expect(avant.clotures).toHaveLength(1);
    expect(avant.lots).toEqual([]);
    expect(avant.versions).toHaveLength(1);
    expect(demarrerRecalcul).not.toHaveBeenCalled();

    const autre = await createOrg(auth);
    const voyage = await apercuPublie(autre);
    expect((await decider(autre, voyage, "v1-j1-1", "like")).ok).toBe(true);
    const demarrer = espionLot();
    expect((await clore(triDe(autre, { ouvert: true, demarrer }), voyage)).ok).toBe(true);
    expect((await lignes(autre, voyage)).lots).toEqual([]);
    expect(demarrer).not.toHaveBeenCalled();
  }, 180_000);

  it("recalcul: rien avant le déblocage (interrupteur fermé : clôture seule) ; le déblocage reprend la clôture de completeDeck", async () => {
    const org = await createOrg(auth);
    const tripId = await apercuPublie(org);
    expect((await decider(org, tripId, "v1-j1-1", "dislike")).ok).toBe(true);
    const demarrer = espionLot();
    expect((await clore(triDe(org, { demarrer }), tripId)).ok).toBe(true);
    const clos = await lignes(org, tripId);
    expect(clos.clotures).toHaveLength(1);
    expect(clos.lots).toEqual([]);
    expect(clos.versions).toHaveLength(1);
    expect(demarrer).not.toHaveBeenCalled();
    const entitlementId = await debloquer(org, tripId);
    const demarrerRecalcul = espionLot();
    await suite({ demarrerRecalcul })({ entitlementId, tripId, organizationId: org.org });
    const apres = await lignes(org, tripId);
    expect(apres.clotures).toEqual(clos.clotures);
    expect(apres.lots).toHaveLength(1);
    const cloture = clos.clotures[0]!.id;
    expect(lot(apres)).toMatchObject({ deck_closure_id: cloture, base_version: 1, request_id: requestIdDuLot(cloture) });
    expect(demarrerRecalcul).toHaveBeenCalledTimes(1);
  }, 180_000);
  it("suite du déblocage, aperçu sans proposition (0119 § 1.3 point 3, 0120 S2 point 5) : ni clôture ni exécution, sans case ou quand la dernière exécution preview n'en a écrit aucune", async () => {
    // 1. Exécution `preview` sans aucune case.
    const org = await createOrg(auth);
    const tripId = await apercuPublie(org);
    await admin.query("DELETE FROM public.proposals WHERE organization_id = $1 AND trip_id = $2", [org.org, tripId]);
    const entitlementId = await debloquer(org, tripId);
    const demarrerRecalcul = espionLot();
    const demarrer = espionComplet();
    await suite({ demarrer, demarrerRecalcul })({ entitlementId, tripId, organizationId: org.org });
    const sans = await lignes(org, tripId);
    expect(sans.clotures).toEqual([]);
    expect(sans.lots).toEqual([]);
    expect(demarrerRecalcul).not.toHaveBeenCalled();
    // Le voyage complet démarre quand même.
    expect(demarrer).toHaveBeenCalledTimes(1);

    // 2. Une exécution plus ancienne a écrit des cases (et une décision), la dernière `preview` aucune : même règle que la lecture.
    const autre = await createOrg(auth);
    const voyage = await apercuPublie(autre);
    expect((await decider(autre, voyage, "v1-j1-1", "dislike")).ok).toBe(true);
    await admin.query(
      `INSERT INTO public.generation_runs (organization_id, trip_id, kind, phase, started_at, updated_at, finished_at)
       VALUES ($1, $2, 'preview', 'failed', now() + interval '1 hour', now() + interval '1 hour', now() + interval '1 hour')`,
      [autre.org, voyage],
    );
    const droit = await debloquer(autre, voyage);
    const relance = espionLot();
    await suite({ demarrerRecalcul: relance })({ entitlementId: droit, tripId: voyage, organizationId: autre.org });
    const recente = await lignes(autre, voyage);
    expect(recente.clotures).toEqual([]);
    expect(recente.lots).toEqual([]);
    expect(relance).not.toHaveBeenCalled();
  }, 180_000);
});

describe("recalcul (B10b) : déblocage sans perte, collision et organisation (0120 S1 à S3)", () => {
  it("recalcul: déblocage sans perte du voyage complet (démarrage du lot perdu, second travail en erreur, premier travail en erreur)", async () => {
    const journal = vi.spyOn(console, "log");
    const avertissements = vi.spyOn(console, "warn");
    // 1. Démarrage du lot perdu : la ligne `batch` est close aussitôt en `failed` (upstream_unavailable) ; le complet démarre.
    const org = await createOrg(auth);
    const tripId = await apercuPublie(org);
    expect((await decider(org, tripId, "v1-j1-1", "dislike")).ok).toBe(true);
    const entitlementId = await debloquer(org, tripId);
    const demarrer = espionComplet();
    await suite({ demarrer, demarrerRecalcul: async () => null })({ entitlementId, tripId, organizationId: org.org });
    const apres = await lignes(org, tripId);
    expect(lot(apres)).toMatchObject({ phase: "failed", stop_reason: "upstream_unavailable", base_version: 1, deck_closure_id: apres.clotures[0]!.id });
    expect(apres.executions.filter((e) => e.kind === "full")).toEqual([expect.objectContaining({ phase: "queued" })]);
    expect(demarrer).toHaveBeenCalledTimes(1);
    expect(apres.droits).toBe(1);
    expect(apres.versions).toHaveLength(1);
    expect(journalTexte(journal, avertissements)).toContain("recalcul.start_failed");

    // 2. Second travail en erreur (transactions refusées après le premier) : attrapé, journalisé, la suite se résout.
    const org2 = await createOrg(auth);
    const voyage2 = await apercuPublie(org2);
    expect((await decider(org2, voyage2, "v1-j1-1", "dislike")).ok).toBe(true);
    const droit2 = await debloquer(org2, voyage2);
    const reelle = creerWithSystemOrgPourTests(base.db);
    let apresDemarrage: number | null = null;
    const transaction: Transaction = async (organizationId, fn) => {
      if (apresDemarrage !== null) {
        apresDemarrage += 1;
        // La première transaction après le démarrage est celle de l'identifiant du complet (premier travail).
        if (apresDemarrage > 1) throw new Error("transaction refusée (test)");
      }
      return reelle(organizationId, fn);
    };
    const demarrer2 = vi.fn<Demarreur>(async () => {
      apresDemarrage = 0;
      return "wrun_complet_2";
    });
    const lot2 = espionLot();
    await expect(suite({ demarrer: demarrer2, demarrerRecalcul: lot2, transaction })({ entitlementId: droit2, tripId: voyage2, organizationId: org2.org })).resolves.toBeUndefined();
    const apres2 = await lignes(org2, voyage2);
    expect(apres2.executions.filter((e) => e.kind === "full")).toEqual([expect.objectContaining({ phase: "queued" })]);
    expect(apres2.lots).toEqual([]);
    expect(apres2.droits).toBe(1);
    expect(lot2).not.toHaveBeenCalled();
    const texte2 = journalTexte(journal, avertissements);
    expect(texte2).toContain("recalcul.unlock_failed");
    expect(texte2).not.toContain("transaction refusée");

    // 3. Premier travail en erreur (démarrage du complet perdu) : la suite lève toujours, après le second travail.
    const org3 = await createOrg(auth);
    const voyage3 = await apercuPublie(org3);
    expect((await decider(org3, voyage3, "v1-j1-1", "dislike")).ok).toBe(true);
    const droit3 = await debloquer(org3, voyage3);
    const lot3 = espionLot();
    await expect(suite({ demarrer: async () => null, demarrerRecalcul: lot3 })({ entitlementId: droit3, tripId: voyage3, organizationId: org3.org })).rejects.toBeInstanceOf(DemarrageVoyageCompletError);
    expect((await lignes(org3, voyage3)).lots).toHaveLength(1);
    expect(lot3).toHaveBeenCalledTimes(1);
  }, 240_000);

  it("recalcul: collision de request_id sans démarrage (une ligne preview du voyage porte déjà le request_id du lot)", async () => {
    const org = await createOrg(auth);
    const tripId = await apercuPublie(org);
    expect((await decider(org, tripId, "v1-j1-1", "dislike")).ok).toBe(true);
    expect((await clore(triDe(org), tripId)).ok).toBe(true);
    const cloture = (await lignes(org, tripId)).clotures[0]!.id;
    // Ligne `preview` forgée (plus ancienne que l'aperçu : la lecture du tri reste sur l'aperçu publié).
    await admin.query(
      `INSERT INTO public.generation_runs (organization_id, trip_id, kind, phase, stop_reason, request_id, started_at, updated_at, finished_at)
       VALUES ($1, $2, 'preview', 'failed', 'upstream_unavailable', $3, $4::timestamptz, $4::timestamptz, $4::timestamptz)`,
      [org.org, tripId, requestIdDuLot(cloture), new Date(MAINTENANT - 3_600_000).toISOString()],
    );
    const journal = vi.spyOn(console, "log");
    const avertissements = vi.spyOn(console, "warn");
    const entitlementId = await debloquer(org, tripId);
    const demarrerRecalcul = espionLot();
    await suite({ demarrerRecalcul })({ entitlementId, tripId, organizationId: org.org });
    const apres = await lignes(org, tripId);
    expect(apres.lots).toEqual([]);
    expect(apres.clotures.map((c) => c.id)).toEqual([cloture]);
    expect(demarrerRecalcul).not.toHaveBeenCalled();
    expect(journalTexte(journal, avertissements)).toContain("recalcul.not_created");
  }, 180_000);

  it("recalcul: verrou pris après le contrôle d'organisation (entrées forgées : suite et étapes d'une autre organisation)", async () => {
    const org = await createOrg(auth);
    const { tripId, entitlementId, avant } = await trieEtDebloque(org, ecarter003(org));
    const intrus = await createOrg(auth);
    // Les verrous du tri et des versions du voyage visé sont tenus par une autre transaction pendant les appels forgés.
    const tenant = await connectBaseJetable("admin", base.nom);
    await tenant.query("BEGIN");
    await tenant.query(SQL_VERROU_TRI, [tripId]);
    await tenant.query(SQL_VERROU_VERSIONS, [tripId]);
    const borne = <T>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, refuse) => setTimeout(() => refuse(new Error("bloqué par un verrou")), 10_000))]);
    try {
      const demarrerRecalcul = espionLot();
      const demarrer = espionComplet();
      await borne(suite({ demarrer, demarrerRecalcul })({ entitlementId, tripId, organizationId: intrus.org }));
      expect(demarrerRecalcul).not.toHaveBeenCalled();
      expect(demarrer).not.toHaveBeenCalled();
      const forgee: EtatLot = { generationRunId: lot(avant).id, organizationId: intrus.org, rang: 0 };
      expect((await borne(etapeLotDebut(forgee, dependances()))).arret).toBe("step_expired");
      expect((await borne(etapeLotPlanification({ ...forgee, rang: 1 }, dependances()))).arret).toBe("step_expired");
    } finally {
      await tenant.query("ROLLBACK");
      await tenant.end();
    }
    expect(await lignes(org, tripId)).toEqual(avant);
    expect((await lignes(intrus, tripId)).lots).toEqual([]);
  }, 180_000);
});

describe("recalcul (B10b) : arrêts, expiration et rejeu (critères communs rejoués sur le workflow 5)", () => {
  it("workflows: plafond ou quota atteint conserve le dernier programme valide (étapes a et e)", async () => {
    const FICHES_COMPTEES: PlafondsUsage = { ...PLAFONDS, generations: { ...PLAFONDS.generations, lot: { ...PLAFONDS.generations.lot, placesDetails: 1 } } };
    const cas: { readonly nom: string; readonly a: PlafondsUsage; readonly e: PlafondsUsage; readonly rang: number }[] = [
      { nom: "plafond de l'organisation à l'étape a", a: { ...PLAFONDS, parOrganisationJourMicros: 1 }, e: PLAFONDS, rang: 1 },
      { nom: "quota à l'étape a", a: { ...PLAFONDS, limites: { ...PLAFONDS.limites, quotaJourParMethode: 1 } }, e: PLAFONDS, rang: 1 },
      // Même forfait réservé à `a` et retrouvé à `e` (réservation idempotente par exécution) : la part de fiches s'épuise à `e`.
      { nom: "plafond du lot à l'étape e", a: FICHES_COMPTEES, e: FICHES_COMPTEES, rang: 2 },
    ];
    const codes: string[] = [];
    for (const c of cas) {
      const org = await createOrg(auth);
      const { tripId, avant } = await trieEtDebloque(org, ecarter003(org));
      let etat = await etapeLotDebut(entreeDuLot(org, avant), dependances(undefined, c.a));
      if (etat.arret === undefined) etat = await etapeLotPlanification(etat, dependances(undefined, c.e));
      expect(etat.rang, c.nom).toBe(c.rang);
      expect(etat.arret, c.nom).toBeDefined();
      codes.push(String(etat.arret));
      const apres = await lignes(org, tripId);
      expect(lot(apres), c.nom).toMatchObject({ phase: "failed", stop_reason: etat.arret, base_version: 1, deck_closure_id: lot(avant).deck_closure_id, last_version: null });
      expect(apres.versions, c.nom).toEqual(avant.versions);
      expect(apres.courante, c.nom).toBe(1);
      expect(apres.signaux, c.nom).toEqual(avant.signaux);
    }
    expect(codes).toEqual(["cap_reached", "daily_quota_insufficient", "cap_reached"]);
  }, 300_000);

  it("workflows: une relance ne double aucune écriture (étapes a et e rejouées)", async () => {
    const org = await createOrg(auth);
    const { tripId, avant } = await trieEtDebloque(org, ecarter003(org));
    const deps = dependances();
    const registre = async () => (await admin.query("SELECT count(*)::int AS n FROM public.usage_ledger WHERE organization_id = $1", [org.org])).rows[0].n as number;
    const a = await etapeLotDebut(entreeDuLot(org, avant), deps);
    expect(a.arret).toBeUndefined();
    const apresA = await registre();
    expect(apresA).toBeGreaterThan(0);
    // `a` rejouée (reprise de la file) : même rang, aucune seconde réservation.
    expect(await etapeLotDebut(entreeDuLot(org, avant), deps)).toMatchObject({ rang: 1 });
    expect(await registre()).toBe(apresA);
    const e = await etapeLotPlanification(a, deps);
    expect(e.arret).toBeUndefined();
    const une = await lignes(org, tripId);
    expect(une.versions).toHaveLength(2);
    // Ligne finie : les étapes rendent leur entrée inchangée, sans écriture.
    expect(await etapeLotPlanification(a, deps)).toEqual(a);
    expect(await etapeLotDebut(entreeDuLot(org, avant), deps)).toEqual(entreeDuLot(org, avant));
    expect(await lignes(org, tripId)).toEqual(une);
  }, 180_000);

  it("expiration d'un lot figé par une action du tri (0120 S6) : 19 minutes, refus ; 21 minutes, step_expired ; full et preview intactes", async () => {
    const org = await createOrg(auth);
    const tripId = await apercuPublie(org);
    expect((await decider(org, tripId, "v1-j1-1", "dislike")).ok).toBe(true);
    expect((await clore(triDe(org, { ouvert: true }), tripId)).ok).toBe(true);
    // Une ligne `preview` et une ligne `full` figées (forgées par l'administrateur), plus anciennes que l'aperçu.
    const vieux = new Date(MAINTENANT - 2 * EXPIRATION_EXECUTION_MS - 3_600_000).toISOString();
    await admin.query(
      `INSERT INTO public.generation_runs (organization_id, trip_id, kind, phase, started_at, updated_at)
       VALUES ($1, $2, 'preview', 'preparing', $3::timestamptz, $3::timestamptz), ($1, $2, 'full', 'preparing', $3::timestamptz, $3::timestamptz)`,
      [org.org, tripId, vieux],
    );
    const avant = await lignes(org, tripId);
    expect(lot(avant).phase).toBe("queued");
    const refus = await clore(triDe(org, { maintenant: MAINTENANT + 19 * 60_000 }), tripId);
    expect(refus).toEqual({ ok: false, error: expect.objectContaining({ code: "generation_in_progress" }) });
    expect(await lignes(org, tripId)).toEqual(avant);
    const accepte = await clore(triDe(org, { maintenant: MAINTENANT + 21 * 60_000 }), tripId);
    expect(accepte.ok).toBe(true);
    expect(JSON.stringify(accepte)).not.toContain(lot(avant).id);
    expect(JSON.stringify(accepte)).not.toContain("step_expired");
    const apres = await lignes(org, tripId);
    expect(lot(apres)).toMatchObject({ phase: "failed", stop_reason: "step_expired", base_version: 1, deck_closure_id: lot(avant).deck_closure_id });
    expect(apres.executions.filter((e) => e.kind !== "batch")).toEqual(avant.executions.filter((e) => e.kind !== "batch"));
  }, 180_000);
});

describe("recalcul (B10b) : publication sérialisée avec le workflow 4 (0119 § 1.6)", () => {
  it("workflows 4 et 5 en même temps : chaque version sous le verrou des versions, aucun lieu deux fois, le lieu écarté nulle part", async () => {
    const org = await createOrg(auth);
    const { tripId, avant } = await trieEtDebloque(org, ecarter003(org));
    const [finLot, finComplet] = await Promise.all([
      deroulerLot(entreeDuLot(org, avant), dependances()),
      deroulerComplet({ generationRunId: complet(avant).id, organizationId: org.org, rang: 0 }, dependances()),
    ]);
    expect(finLot.fin.arret).toBeUndefined();
    expect(finComplet.arret).toBeUndefined();
    const apres = await lignes(org, tripId);
    expect(apres.versions.map((v) => v.version)).toEqual(apres.versions.map((_, i) => i + 1));
    expect(lot(apres)).toMatchObject({ phase: "ready" });
    const derniere = apres.versions.at(-1)!.snapshot;
    expect(lieux(derniere)).not.toContain("SENTINELLE_PLACE_ID_003");
    expect(new Set(lieux(derniere)).size).toBe(lieux(derniere).length);
    // Le jour 1 du lot reste dans la dernière version (le workflow 4 copie les jours qu'il ne planifie pas de la dernière version).
    const duLot = apres.versions.find((v) => v.request_id === lot(apres).request_id)!;
    expect(jour(derniere, 1)).toEqual(jour(duLot.snapshot, 1));
  }, 240_000);
});

describe("recalcul (B10b) : durée en simulé (mesure, pas de seuil bloquant)", () => {
  it("recalcul: durée en simulé, deux jours touchés, doubles à latence fixe (50 ms par appel)", async () => {
    const org = await createOrg(auth);
    const { avant } = await trieEtDebloque(org, async (id) => {
      expect((await decider(org, id, "v1-j1-1", "dislike")).ok).toBe(true);
      expect((await decider(org, id, "v1-j2-2", "dislike")).ok).toBe(true);
    });
    const latence = <T extends object>(objet: T): T =>
      Object.fromEntries(
        Object.entries(objet).map(([nom, valeur]) => [
          nom,
          typeof valeur !== "function"
            ? valeur
            : async (...args: unknown[]) => {
                await new Promise((r) => setTimeout(r, 50));
                return (valeur as (...a: unknown[]) => unknown).apply(objet, args);
              },
        ]),
      ) as T;
    const fabrique = () =>
      composerSimuleeAvec({
        doubles: () => {
          const d = doublesEdimbourg();
          return { modeles: latence(d.modeles), rechercheWeb: latence(d.rechercheWeb), lecteur: latence(d.lecteur), places: latence(d.places), routes: latence(d.routes) };
        },
      });
    const debut = performance.now();
    const { fin } = await deroulerLot(entreeDuLot(org, avant), dependances(fabrique));
    const duree = performance.now() - debut;
    expect(fin.arret).toBeUndefined();
    expect(duree).toBeGreaterThan(0);
    console.info(`[mesure B10-PO-17] workflow 5, deux jours touchés, latence fixe 50 ms : ${Math.round(duree)} ms`);
  }, 180_000);
});
