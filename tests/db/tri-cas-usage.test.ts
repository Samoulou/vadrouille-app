import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createApiTripAdapter } from "@/adapters/api";
import type { AdapterContext } from "@/adapters/types";
import { ProposalRecordSchema, TripSnapshotSchema, type Category, type DeckSession, type ProposalRecord } from "@/contracts";
import { createServerDeckActions } from "@/features/presentation/server-actions";
import { creerRelecturesVoyages } from "@/mocks/relectures-voyages";
import { creerLectureDuTri } from "@/server/presentation/lecture";
import { annulerDecision, cloreTri, deciderCarte, repondreQuestion } from "@/server/presentation/tri";
import { creerWithOrg } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { executerContratDeckActions } from "../support/deck-actions-contrat";
import { DETOUR_DE_TEST, ecrireVoyage, type DonneesVoyage, type LigneProposition } from "../support/voyages-en-base";
import { closeAll, connect, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * Cas d'usage du tri enregistré sur la base réelle (spécification B10, critères de B10a ; décision 0112, « Conséquences testables ») ;
 * les droits et formes du schéma sont dans `tests/db/tri-enregistre.test.ts` (migration 0014).
 * Cas d'usage de `src/server/presentation/tri.ts` appelés avec le contexte d'une organisation de test et le `withOrg` de
 * `vadrouille_app` ; voyages et cases écrits par `tests/support/voyages-en-base.ts`. Aucune donnée Google : noms et
 * `placeId` sentinelles (`[Nom sentinelle …]`, `test_place_…`), fabriqués ici.
 */

const db = createDatabase("vadrouille_app");
const withOrg = creerWithOrg(db);
let app: DbClient;
let auth: DbClient;
let a: Org;
let b: Org;
let ctxA: AdapterContext;
let ctxB: AdapterContext;

const contexte = (org: Org): AdapterContext => ({ organizationId: org.org, userId: org.owner, role: "owner" });
const dep = (ctx: AdapterContext) => ({ contexte: async () => ctx, withOrg });

// Les actions serveur de l'écran passent par les cas d'usage avec le contexte du test (aucune session, aucun branchement).
const actionsCtx = vi.hoisted(() => ({ ctx: null as AdapterContext | null }));
vi.mock("@/server/actions/presentation", async () => {
  const tri = await import("@/server/presentation/tri");
  const { creerWithOrg: creer } = await import("@/server/with-org");
  const { createDatabase: creerBase } = await import("../../db/index");
  const w = creer(creerBase("vadrouille_app"));
  const d = () => ({ contexte: async () => actionsCtx.ctx, withOrg: w });
  return {
    decideCard: (entree: unknown) => tri.deciderCarte(d(), entree),
    undoDecision: (entree: unknown) => tri.annulerDecision(d(), entree),
    answerPreferencePrompt: (entree: unknown) => tri.repondreQuestion(d(), entree),
    completeDeck: (entree: unknown) => tri.cloreTri(d(), entree),
  };
});

// --- Voyage de test -----------------------------------------------------------------------------------------

type Carte = { readonly id: string; readonly kind: "activity" | "meal"; readonly category: Category; readonly day: number; readonly time: string; readonly locked?: boolean };

const NOM = (id: string) => `[Nom sentinelle ${id}]`;
const LIEU = (id: string) => `test_place_tri_${id}`;

function record(carte: Carte): ProposalRecord {
  return ProposalRecordSchema.parse({
    id: carte.id,
    kind: carte.kind,
    day: carte.day,
    time: carte.time,
    stop: { id: carte.id, kind: carte.kind, placeId: LIEU(carte.id), name: NOM(carte.id), start: carte.time, facts: {}, exceptions: [], locked: carte.locked ?? false },
    category: carte.category,
    detour: DETOUR_DE_TEST,
  });
}

/** Cartes du tri, dans l'ordre du paquet (F6-PO-1). */
const CARTES: readonly Carte[] = [
  { id: "m1", kind: "activity", category: "museum", day: 1, time: "09:00" },
  { id: "r1", kind: "meal", category: "restaurant", day: 1, time: "12:30" },
  { id: "r2", kind: "meal", category: "restaurant", day: 1, time: "12:30" },
  { id: "r3", kind: "meal", category: "restaurant", day: 1, time: "12:30" },
  { id: "m2", kind: "activity", category: "museum", day: 1, time: "15:00" },
  { id: "n1", kind: "activity", category: "nature", day: 2, time: "09:00" },
  { id: "n2", kind: "activity", category: "nature", day: 2, time: "11:00" },
  { id: "m3", kind: "activity", category: "museum", day: 2, time: "15:00" },
  { id: "w1", kind: "activity", category: "walk", day: 2, time: "17:00" },
  { id: "v1", kind: "activity", category: "heritage", day: 2, time: "19:00", locked: true },
];

function donnees(options: { batchEnCours?: boolean; debloque?: boolean } = {}): DonneesVoyage {
  const jours = [1, 2].map((index) => ({ index, date: `2027-05-0${index}`, items: [], events: [], travelBudgetMinutes: 90 }));
  const propositions: LigneProposition[] = CARTES.map((carte, i) => ({
    phase: "preview",
    position: i + 1,
    slotType: "proposal",
    day: carte.day,
    time: carte.time,
    kind: carte.kind,
    content: record(carte),
  }));
  return {
    destination: "Testville",
    start: "2027-05-01",
    end: "2027-05-03",
    timeZone: "Europe/Zurich",
    travellers: { adults: 2, children: 0 },
    versions: [{ snapshot: TripSnapshotSchema.parse({ days: jours }) }],
    stays: [{ kind: "lodging", placeId: "test_place_tri_logement", label: "[Hôtel de test]", from: "2027-05-01", to: "2027-05-03" }],
    checklist: [],
    runs: [{ kind: "preview", finished: true, propositions }, ...(options.batchEnCours ? [{ kind: "batch" as const, finished: false, propositions: [] }] : [])],
    entitlements: options.debloque ? ["tripUnlocked"] : [],
    coordonnees: [],
  };
}

const nouveauVoyage = (org: Org = a, options: Parameters<typeof donnees>[0] = {}) => ecrireVoyage(app, org, donnees(options));

// --- Raccourcis ---------------------------------------------------------------------------------------------

const decider = (tripId: string, proposalId: string, decision: "like" | "dislike" | "choose" | "nextOption", requestId: string = randomUUID(), ctx = ctxA) =>
  deciderCarte(dep(ctx), { tripId, requestId, proposalId, decision });
const annuler = (tripId: string, decisionRequestId: string, requestId: string = randomUUID(), ctx = ctxA) => annulerDecision(dep(ctx), { tripId, requestId, decisionRequestId });
const repondre = (tripId: string, category: Category, answer: "yes" | "no", options: { reason?: "tooFar" | "notMyStyle"; requestId?: string; ctx?: AdapterContext } = {}) =>
  repondreQuestion(dep(options.ctx ?? ctxA), {
    tripId,
    requestId: options.requestId ?? randomUUID(),
    prompt: { kind: "category", category },
    answer,
    ...(options.reason ? { reason: options.reason } : {}),
  });
const clore = (tripId: string, requestId: string = randomUUID(), ctx = ctxA) => cloreTri(dep(ctx), { tripId, requestId });
const lireSession = (tripId: string, ctx = ctxA) => creerLectureDuTri({ withOrg })(ctx, tripId);
async function session(tripId: string): Promise<DeckSession> {
  const s = await lireSession(tripId);
  if (s === null) throw new Error("session absente");
  return s;
}

async function lignes(org: Org, table: "preference_signals" | "preference_prompts" | "deck_closures", tripId: string) {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query(`SELECT * FROM public.${table} WHERE trip_id = $1`, [tripId])).rows);
}
const nombre = async (org: Org, table: "preference_signals" | "preference_prompts" | "deck_closures", tripId: string) => (await lignes(org, table, tripId)).length;
const toutes = async (tripId: string, org: Org = a) => ({
  signaux: await nombre(org, "preference_signals", tripId),
  questions: await nombre(org, "preference_prompts", tripId),
  clotures: await nombre(org, "deck_closures", tripId),
});

const valide = { code: "validation_failed" };
const refuse = (resultat: { ok: boolean; error?: unknown }) => {
  expect(resultat.ok).toBe(false);
  return resultat.ok ? undefined : resultat.error;
};

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  a = await createOrg(auth);
  b = await createOrg(auth);
  ctxA = contexte(a);
  ctxB = contexte(b);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await db.$client.end();
  await closeAll();
});

describe("présentation: une décision est enregistrée une fois par requestId", () => {
  it.each([
    ["like", "m1"],
    ["dislike", "m1"],
    ["choose", "r1"],
    ["nextOption", "r1"],
  ] as const)("%s : même requestId (dont deux simultanés), même résultat, une ligne", async (decision, carte) => {
    const tripId = await nouveauVoyage();
    const requestId = randomUUID();
    const [un, deux] = await Promise.all([decider(tripId, carte, decision, requestId), decider(tripId, carte, decision, requestId)]);
    const trois = await decider(tripId, carte, decision, requestId);
    expect(un.ok).toBe(true);
    expect(deux).toEqual(un);
    expect(trois).toEqual(un);
    expect(await nombre(a, "preference_signals", tripId)).toBe(1);
    // Un autre requestId sur la même proposition : refusé, rien n'est écrit.
    expect(refuse(await decider(tripId, carte, decision))).toEqual(valide);
    expect(await nombre(a, "preference_signals", tripId)).toBe(1);
  });

  it("même requestId avec un autre contenu : refusé sans écriture", async () => {
    const tripId = await nouveauVoyage();
    const requestId = randomUUID();
    expect((await decider(tripId, "m1", "like", requestId)).ok).toBe(true);
    expect(refuse(await decider(tripId, "m2", "like", requestId))).toEqual(valide);
    expect(refuse(await decider(tripId, "m1", "dislike", requestId))).toEqual(valide);
    expect(await nombre(a, "preference_signals", tripId)).toBe(1);
  });

  it("décision rejouée après son annulation : ok, sans question, compteurs courants ; la ligne reste cancelled, aucune seconde ligne", async () => {
    const tripId = await nouveauVoyage();
    await decider(tripId, "m1", "dislike");
    const declencheur = randomUUID();
    const premiere = await decider(tripId, "m2", "dislike", declencheur);
    expect(premiere.ok && premiere.value.prompt).toEqual({ kind: "category", category: "museum" });
    expect((await annuler(tripId, declencheur)).ok).toBe(true);
    const rejouee = await decider(tripId, "m2", "dislike", declencheur);
    expect(rejouee.ok && rejouee.value).toEqual({ prompt: null, counts: { decided: 1, remaining: 8 } });
    const signaux = await lignes(a, "preference_signals", tripId);
    expect(signaux).toHaveLength(2);
    expect(signaux.find((s) => s.request_id === declencheur)?.status).toBe("cancelled");
  });

  it("un requestId d'annulation ne sert plus ni à une décision, ni à une réponse, ni à une autre annulation", async () => {
    const tripId = await nouveauVoyage();
    const decision = randomUUID();
    await decider(tripId, "m1", "like", decision);
    const annulation = randomUUID();
    expect((await annuler(tripId, decision, annulation)).ok).toBe(true);
    const avant = await toutes(tripId);
    expect(refuse(await decider(tripId, "n1", "like", annulation))).toEqual(valide);
    await decider(tripId, "m1", "dislike");
    const autre = randomUUID();
    await decider(tripId, "m2", "dislike", autre);
    expect(refuse(await repondre(tripId, "museum", "no", { requestId: annulation }))).toEqual(valide);
    expect(refuse(await annuler(tripId, autre, annulation))).toEqual(valide);
    expect(await nombre(a, "preference_signals", tripId)).toBe(avant.signaux + 2);
    expect((await session(tripId)).openPrompt).toEqual({ kind: "category", category: "museum" });
  });
});

describe("présentation: un voyage d'une autre organisation n'est jamais touché", () => {
  it("decideCard, undoDecision, answerPreferencePrompt, completeDeck : not_found, comme un voyage inconnu, rien d'écrit", async () => {
    const tripId = await nouveauVoyage(a);
    const inconnu = "00000000-0000-4000-8000-000000000000";
    const decisionA = randomUUID();
    expect((await decider(tripId, "m1", "dislike", decisionA)).ok).toBe(true);
    const avant = await toutes(tripId);
    for (const cible of [tripId, inconnu]) {
      expect(refuse(await decider(cible, "m2", "dislike", randomUUID(), ctxB))).toEqual({ code: "not_found" });
      expect(refuse(await annuler(cible, decisionA, randomUUID(), ctxB))).toEqual({ code: "not_found" });
      expect(refuse(await repondre(cible, "museum", "yes", { ctx: ctxB }))).toEqual({ code: "not_found" });
      expect(refuse(await clore(cible, randomUUID(), ctxB))).toEqual({ code: "not_found" });
    }
    expect(await toutes(tripId)).toEqual(avant);
    expect(await lireSession(tripId, ctxB)).toBeNull();
    expect(await lireSession(inconnu)).toBeNull();
  });

  it("une proposition d'un autre voyage : validation_failed, rien d'écrit", async () => {
    const tripId = await nouveauVoyage(a);
    expect(refuse(await decider(tripId, "inconnue", "like"))).toEqual(valide);
    // Carte verrouillée : jamais présentée, jamais décidable.
    expect(refuse(await decider(tripId, "v1", "like"))).toEqual(valide);
    expect(await toutes(tripId)).toEqual({ signaux: 0, questions: 0, clotures: 0 });
  });
});

describe("préférences: aucune généralisation sans réponse (adaptateur api)", () => {
  it("deux refus museum → question ; sans réponse, aucun answerYes ni answerNo, la catégorie reste présentée ; un troisième refus ne la repose pas", async () => {
    const tripId = await nouveauVoyage();
    expect((await decider(tripId, "m1", "dislike")).ok && (await session(tripId)).openPrompt).toBeNull();
    const deuxieme = await decider(tripId, "m2", "dislike");
    expect(deuxieme.ok && deuxieme.value.prompt).toEqual({ kind: "category", category: "museum" });
    const signaux = [...(await lignes(a, "preference_signals", tripId))].sort((x, y) => Number(x.seq) - Number(y.seq));
    expect(signaux.map((s) => s.signal)).toEqual(["dislike", "dislike"]);
    expect((await session(tripId)).proposalIds).toContain("m3");
    const troisieme = await decider(tripId, "m3", "dislike");
    expect(troisieme.ok && troisieme.value.prompt).toBeNull();
  });

  it("deux refus nature puis un refus museum : aucune question museum ; repas jamais", async () => {
    const tripId = await nouveauVoyage();
    await decider(tripId, "n1", "dislike");
    const nature = await decider(tripId, "n2", "dislike");
    expect(nature.ok && nature.value.prompt).toEqual({ kind: "category", category: "nature" });
    const musee = await decider(tripId, "m1", "dislike");
    expect(musee.ok && musee.value.prompt).toBeNull();
    const r1 = await decider(tripId, "r1", "nextOption");
    const r2 = await decider(tripId, "r2", "nextOption");
    const r3 = await decider(tripId, "r3", "dislike");
    for (const r of [r1, r2, r3]) expect(r.ok && r.value.prompt).toBeNull();
  });
});

describe("préférences: une question fermée ne revient pas et n'accepte plus de réponse", () => {
  it("posée puis rechargée sans réponse : rendue de nouveau, et une réponse est acceptée", async () => {
    const tripId = await nouveauVoyage();
    await decider(tripId, "m1", "dislike");
    await decider(tripId, "m2", "dislike");
    expect((await session(tripId)).openPrompt).toEqual({ kind: "category", category: "museum" });
    expect((await session(tripId)).openPrompt).toEqual({ kind: "category", category: "museum" });
    const reponse = await repondre(tripId, "museum", "no");
    expect(reponse.ok).toBe(true);
    expect((await session(tripId)).openPrompt).toBeNull();
  });

  it("fermée par la décision suivante : plus rendue, pas reposée, réponse tardive refusée sans écriture", async () => {
    const tripId = await nouveauVoyage();
    await decider(tripId, "m1", "dislike");
    await decider(tripId, "m2", "dislike");
    await decider(tripId, "n1", "like");
    expect((await session(tripId)).openPrompt).toBeNull();
    const troisieme = await decider(tripId, "m3", "dislike");
    expect(troisieme.ok && troisieme.value.prompt).toBeNull();
    const avant = await toutes(tripId);
    expect(refuse(await repondre(tripId, "museum", "yes"))).toEqual(valide);
    expect(await toutes(tripId)).toEqual(avant);
  });

  it("fermée par completeDeck : réponse tardive refusée", async () => {
    const tripId = await nouveauVoyage();
    await decider(tripId, "m1", "dislike");
    await decider(tripId, "m2", "dislike");
    expect((await clore(tripId)).ok).toBe(true);
    expect((await session(tripId)).openPrompt).toBeNull();
    expect(refuse(await repondre(tripId, "museum", "yes"))).toEqual(valide);
  });

  it("une question jamais posée, ou d'une autre catégorie, est refusée ; la distance n'est jamais posée avant B10f", async () => {
    const tripId = await nouveauVoyage();
    expect(refuse(await repondre(tripId, "museum", "yes"))).toEqual(valide);
    await decider(tripId, "m1", "dislike");
    await decider(tripId, "m2", "dislike");
    expect(refuse(await repondre(tripId, "nature", "yes"))).toEqual(valide);
    expect(refuse(await repondreQuestion(dep(ctxA), { tripId, requestId: randomUUID(), prompt: { kind: "distance" }, answer: "yes" }))).toEqual(valide);
    expect((await session(tripId)).openPrompt).toEqual({ kind: "category", category: "museum" });
  });

  it("décision déclenchante annulée : la question n'est plus ouverte, et un nouveau deuxième refus la repose", async () => {
    const tripId = await nouveauVoyage();
    await decider(tripId, "m1", "dislike");
    const declencheur = randomUUID();
    await decider(tripId, "m2", "dislike", declencheur);
    expect((await annuler(tripId, declencheur)).ok).toBe(true);
    expect((await session(tripId)).openPrompt).toBeNull();
    expect(refuse(await repondre(tripId, "museum", "yes"))).toEqual(valide);
    const encore = await decider(tripId, "m3", "dislike");
    expect(encore.ok && encore.value.prompt).toEqual({ kind: "category", category: "museum" });
  });
});

describe("présentation: le tri reprend à la première carte non triée", () => {
  it("après trois décisions et un « Oui » sur museum : sans les cartes décidées ni les museum, dans l'ordre ; « Passer » clôt le tri", async () => {
    const tripId = await nouveauVoyage();
    const adapter = createApiTripAdapter({ relectures: creerRelecturesVoyages(), withOrg });
    await decider(tripId, "m1", "dislike");
    await decider(tripId, "r1", "choose");
    const musee = await decider(tripId, "m2", "dislike");
    expect(musee.ok && musee.value.prompt).toEqual({ kind: "category", category: "museum" });
    const oui = await repondre(tripId, "museum", "yes", { reason: "notMyStyle" });
    expect(oui.ok && oui.value).toEqual({ next: null, counts: { decided: 3, remaining: 3 } });
    const reprise = await adapter.getDeckSession(ctxA, tripId);
    expect(reprise).toEqual({ tripId, proposalIds: ["n1", "n2", "w1"], openPrompt: null, closed: false, counts: { decided: 3, remaining: 3 } });
    const troisieme = await decider(tripId, "n1", "dislike");
    expect(troisieme.ok && troisieme.value.prompt).toBeNull();
    const fin = await clore(tripId);
    expect(fin.ok && fin.value.deck).toEqual({ tripId, proposalIds: [], openPrompt: null, closed: true, counts: { decided: 0, remaining: 0 } });
    expect(await adapter.getDeckSession(ctxA, tripId)).toEqual({ tripId, proposalIds: [], openPrompt: null, closed: true, counts: { decided: 0, remaining: 0 } });
    // Clôture rejouée ou depuis un autre onglet : même réponse, aucune seconde ligne.
    expect((await clore(tripId)).ok).toBe(true);
    expect(await nombre(a, "deck_closures", tripId)).toBe(1);
    // Une décision sur une carte d'un tri clos est refusée.
    expect(refuse(await decider(tripId, "n2", "like"))).toEqual(valide);
  });

  it("voyage débloqué : le tri de l'aperçu est clos à la lecture (aucune carte deck en B10a), sans écriture", async () => {
    const tripId = await nouveauVoyage(a, { debloque: true });
    const clos = { tripId, proposalIds: [], openPrompt: null, closed: true, counts: { decided: 0, remaining: 0 } };
    expect(await session(tripId)).toEqual(clos);
    expect(refuse(await decider(tripId, "m1", "like"))).toEqual(valide);
    // « Passer » sur un tri déjà clos (0112 § 3.4) : même réponse, aucune clôture écrite.
    const fin = await clore(tripId);
    expect(fin.ok && fin.value.deck).toEqual(clos);
    expect(await toutes(tripId)).toEqual({ signaux: 0, questions: 0, clotures: 0 });
  });
});

describe("présentation: un repas choisi ne revient pas dans la reprise", () => {
  const repas = (s: DeckSession) => s.proposalIds.filter((id) => id.startsWith("r"));

  it("« Option suivante » puis « Je choisis » : aucune des trois options ; même chose après « Pas pour moi » sur la dernière", async () => {
    const choisi = await nouveauVoyage();
    await decider(choisi, "r1", "nextOption");
    await decider(choisi, "r2", "choose");
    expect(repas(await session(choisi))).toEqual([]);
    const refuseDerniere = await nouveauVoyage();
    await decider(refuseDerniere, "r1", "nextOption");
    await decider(refuseDerniere, "r2", "nextOption");
    expect((await decider(refuseDerniere, "r3", "dislike")).ok).toBe(true);
    expect(repas(await session(refuseDerniere))).toEqual([]);
  });

  it("« Option suivante » seule : la reprise montre l'option 2 ; annuler « Je choisis » la montre de nouveau", async () => {
    const tripId = await nouveauVoyage();
    await decider(tripId, "r1", "nextOption");
    expect(repas(await session(tripId))).toEqual(["r2", "r3"]);
    const choix = randomUUID();
    await decider(tripId, "r2", "choose", choix);
    expect(repas(await session(tripId))).toEqual([]);
    expect((await annuler(tripId, choix)).ok).toBe(true);
    expect(repas(await session(tripId))).toEqual(["r2", "r3"]);
  });

  it("like sur un repas, choose sur une activité, nextOption sur la dernière option, dislike sur une option qui n'est pas la dernière : refusés sans écriture", async () => {
    const tripId = await nouveauVoyage();
    expect(refuse(await decider(tripId, "r1", "like"))).toEqual(valide);
    expect(refuse(await decider(tripId, "m1", "choose"))).toEqual(valide);
    expect(refuse(await decider(tripId, "m1", "nextOption"))).toEqual(valide);
    expect(refuse(await decider(tripId, "r3", "nextOption"))).toEqual(valide);
    expect(refuse(await decider(tripId, "r1", "dislike"))).toEqual(valide);
    expect(await nombre(a, "preference_signals", tripId)).toBe(0);
  });
});

describe("présentation: annuler une décision annule aussi sa réponse", () => {
  it("décision déclenchante répondue « Oui » : les deux signaux cancelled, la catégorie revient, la question peut être reposée", async () => {
    const tripId = await nouveauVoyage();
    await decider(tripId, "m1", "dislike");
    const declencheur = randomUUID();
    await decider(tripId, "m2", "dislike", declencheur);
    await repondre(tripId, "museum", "yes");
    expect((await session(tripId)).proposalIds).not.toContain("m3");
    const annulation = randomUUID();
    const resultat = await annuler(tripId, declencheur, annulation);
    expect(resultat.ok).toBe(true);
    // Rejouée : même résultat, sans écriture.
    expect(await annuler(tripId, declencheur, annulation)).toEqual(resultat);
    const signaux = await lignes(a, "preference_signals", tripId);
    const annules = signaux.filter((s) => s.status === "cancelled");
    expect(annules.map((s) => s.signal).sort()).toEqual(["answerYes", "dislike"]);
    for (const s of annules) {
      expect(s.previous_status).toBe("confirmed");
      expect(s.cancel_request_id).toBe(annulation);
      expect(s.cancelled_at).not.toBeNull();
    }
    expect((await session(tripId)).proposalIds).toContain("m3");
    const reposee = await decider(tripId, "m2", "dislike");
    expect(reposee.ok && reposee.value.prompt).toEqual({ kind: "category", category: "museum" });
  });

  it("une décision qui n'est pas la dernière du tri ouvert, ou après « Passer », est refusée sans écriture", async () => {
    const tripId = await nouveauVoyage();
    const premiere = randomUUID();
    await decider(tripId, "m1", "like", premiere);
    const derniere = randomUUID();
    await decider(tripId, "n1", "like", derniere);
    const avant = await toutes(tripId);
    expect(refuse(await annuler(tripId, premiere))).toEqual(valide);
    expect(await toutes(tripId)).toEqual(avant);
    await clore(tripId);
    const apres = await toutes(tripId);
    expect(refuse(await annuler(tripId, derniere))).toEqual(valide);
    expect(await toutes(tripId)).toEqual(apres);
    // Annulation déjà faite avec un autre requestId : refusée.
    const autre = await nouveauVoyage();
    const decision = randomUUID();
    await decider(autre, "m1", "like", decision);
    expect((await annuler(autre, decision)).ok).toBe(true);
    expect(refuse(await annuler(autre, decision))).toEqual(valide);
  });
});

describe("présentation: aucune donnée Google ni nom dans les signaux", () => {
  it("après un tri complet : aucun nom dans les lignes, seul le placeId de la proposition décidée ; journal sans nom ni placeId", async () => {
    const journal: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void journal.push(args.map(String).join(" ")));
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void journal.push(args.map(String).join(" ")));
    const tripId = await nouveauVoyage();
    await decider(tripId, "m1", "dislike");
    await decider(tripId, "m2", "dislike");
    await repondre(tripId, "museum", "yes", { reason: "tooFar" });
    await decider(tripId, "r1", "nextOption");
    await decider(tripId, "r2", "choose");
    await decider(tripId, "n1", "like");
    // Une erreur forcée passe par le journal du cadre (`voyages.action_failed`), sans valeur.
    await decider(tripId, "n2", "dislike", "pas-un-uuid");
    await clore(tripId);
    const signaux = await lignes(a, "preference_signals", tripId);
    const texte = JSON.stringify([signaux, await lignes(a, "preference_prompts", tripId), await lignes(a, "deck_closures", tripId)]);
    for (const carte of CARTES) expect(texte).not.toContain(NOM(carte.id));
    for (const s of signaux) {
      const ligne = await inTx(app, { org: a.org, user: a.owner }, async (c) =>
        (await c.query("SELECT p.content ->> 'id' AS ref FROM public.proposals p WHERE p.id = $1", [s.proposal_id])).rows[0]?.ref as string | undefined,
      );
      expect(s.place_id).toBe(ligne === undefined ? null : LIEU(ligne));
    }
    const journalTexte = journal.join("\n");
    for (const carte of CARTES) {
      expect(journalTexte).not.toContain(NOM(carte.id));
      expect(journalTexte).not.toContain(LIEU(carte.id));
    }
  });
});

describe("présentation: décision refusée pendant un recalcul", () => {
  it("exécution batch en cours : generation_in_progress (retryable), rien d'écrit ; les lectures restent possibles", async () => {
    const tripId = await nouveauVoyage(a, { batchEnCours: true });
    expect(refuse(await decider(tripId, "m1", "like"))).toEqual({ code: "generation_in_progress", retryable: true });
    expect(refuse(await repondre(tripId, "museum", "yes"))).toEqual({ code: "generation_in_progress", retryable: true });
    expect(refuse(await clore(tripId))).toEqual({ code: "generation_in_progress", retryable: true });
    expect(refuse(await annuler(tripId, randomUUID()))).toEqual({ code: "generation_in_progress", retryable: true });
    expect(await toutes(tripId)).toEqual({ signaux: 0, questions: 0, clotures: 0 });
    expect((await session(tripId)).proposalIds).toHaveLength(9);
  });
});

describe("présentation: même règle en local et sur le serveur (suite commune, décision 0112 § 4 point 4)", () => {
  it("createServerDeckActions sur les cas d'usage et la base : mêmes questions que la session locale", async () => {
    const tripId = await nouveauVoyage();
    actionsCtx.ctx = ctxA;
    const carte = (id: string) => {
      const c = CARTES.find((x) => x.id === id);
      if (c === undefined) throw new Error(id);
      return { id: c.id, kind: c.kind, category: c.category };
    };
    await executerContratDeckActions({
      actions: createServerDeckActions(tripId),
      cartes: { musees: [carte("m1"), carte("m2"), carte("m3")], natures: [carte("n1"), carte("n2")], balade: carte("w1"), repas: [carte("r2"), carte("r3")] },
    });
    // r1 n'a pas été décidée : `r2` n'est pas la première option ; la suite commune ne lit que les questions.
    const signaux = [...(await lignes(a, "preference_signals", tripId))].sort((x, y) => Number(x.seq) - Number(y.seq));
    expect(signaux.map((s) => s.signal)).toEqual(["dislike", "dislike", "answerNo", "dislike", "dislike", "dislike", "like", "nextOption", "dislike"]);
  });
});

describe("lecture de l'état du tri : schéma absent", () => {
  it("une table du tri absente (migration non appliquée) : null, la session reste locale ; une autre erreur rejette", async () => {
    const journal: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void journal.push(args.map(String).join(" ")));
    const absente = Object.assign(new Error("relation absente"), { cause: { code: "42P01" } });
    const lecture = creerLectureDuTri({ withOrg: async () => Promise.reject(absente) });
    expect(await lecture(ctxA, "00000000-0000-4000-8000-000000000001")).toBeNull();
    // Repli journalisé (amendement 1 de 0112) : identifiant du voyage seul, ni code ni message de la base.
    expect(journal).toEqual([JSON.stringify({ level: "warn", event: "presentation.deck_schema_missing", tripId: "00000000-0000-4000-8000-000000000001" })]);
    const autre = creerLectureDuTri({ withOrg: async () => Promise.reject(Object.assign(new Error("panne"), { code: "08006" })) });
    await expect(autre(ctxA, "00000000-0000-4000-8000-000000000001")).rejects.toMatchObject({ name: "LectureVoyageError", reason: "unavailable" });
  });
});
