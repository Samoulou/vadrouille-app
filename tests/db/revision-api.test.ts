import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApiCreationAdapter } from "@/adapters/api-creation";
import { PROMPT_REVISION } from "@/ai/prompts/revision";
import { TripSnapshotSchema, type TripDraft, type TripRequest, type TripSnapshot } from "@/contracts";
import { chargerDoubles } from "@/server/composition/fixtures-simulees";
import { composerSimuleeAvec, type DoublesGeneration, type FabriqueGeneration } from "@/server/composition/generation";
import type { DependancesGeneration } from "@/server/generation/dependances";
import { etapeLotDebut, etapeLotPlanification } from "@/server/generation/etapes-lot";
import { etapeProgrammeDebut, etapeProgrammeEcriture } from "@/server/generation/etapes-programme";
import type { EtatLot, EtatProgramme } from "@/server/generation/etat";
import { nomNormalise } from "@/server/programme/revision";
import { ecrireVersion } from "@/server/versions/ecrire";

import { BRIEF_EDIMBOURG, MAINTENANT, PLAFONDS_LARGES, contexteDe, creerHorlogeManuelle, creerWithOrg, creerWithSystemOrgPourTests } from "../support/banc-apercu";
import { journalDePrompts, type JournalPrompts } from "../support/journal-prompts";

import { creerBaseApercu, type BaseApercu } from "./base-apercu";
import { closeAll, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * M1b (ticket 868 ; décisions 0126 et 0136 § 4.4 ; plan `docs/plans/mvp-etapes-1-9.md`, ligne M1b) : « Pas pour moi » change
 * le programme sur `api`. La chaîne inversée écrit la version 1 (`generateProgramme`, déroulé sans le SDK), puis un tri clos
 * (`deck_closures`) porte des « Pas pour moi » et un « J'aime » sur des cases de l'aperçu ; la ligne `batch` est déroulée sans
 * le SDK (`a` puis `e`), chaîne injectée (`chaine: "inversee"`), variante simulée sur les fixtures de Rome, aucun appel réel,
 * aucune clé, aucune position écrite.
 */

let base: BaseApercu;
let db: BaseApercu["db"];
let withOrg: ReturnType<typeof creerWithOrg>;
let app: DbClient;
let auth: DbClient;
let admin: DbClient;
let doublesRome: () => DoublesGeneration;

beforeAll(async () => {
  base = await creerBaseApercu("revision_api");
  ({ db, app, auth, admin } = base);
  withOrg = creerWithOrg(db);
  doublesRome = await chargerDoubles({ VADROUILLE_ENV: "ci" }, "Rome");
}, 120_000);
afterAll(async () => {
  await base.supprimer();
  await closeAll();
});

const BROUILLON_ROME: TripDraft = {
  destination: "Rome",
  start: "2027-05-04",
  end: "2027-05-08",
  lodging: { kind: "area", label: "Rione Monti (près du Colisée)" },
  otherCities: [],
  commitments: [],
};

const demandeRome = (): TripRequest => ({ requestId: crypto.randomUUID(), draft: BROUILLON_ROME, brief: BRIEF_EDIMBOURG });

function dependances(fabrique?: () => FabriqueGeneration, surcharge: Partial<DependancesGeneration> = {}): DependancesGeneration {
  return {
    chaine: "inversee",
    transaction: creerWithSystemOrgPourTests(db),
    horloge: creerHorlogeManuelle(MAINTENANT),
    plafonds: PLAFONDS_LARGES,
    barriere: { env: { VADROUILLE_ENV: "ci" } },
    reserverEnSimulee: true,
    ...(fabrique === undefined ? {} : { composition: fabrique }),
    ...surcharge,
  };
}

/** Composition simulée de Rome : requêtes de modèles journalisées, appels Routes et compositions comptés. */
function observee() {
  const journaux: JournalPrompts[] = [];
  let routes = 0;
  let compositions = 0;
  const fabrique = () => {
    compositions += 1;
    return composerSimuleeAvec({
      doubles: () => {
        const d = doublesRome();
        const j = journalDePrompts(d.modeles);
        journaux.push(j);
        const comptees = new Proxy(d.routes, {
          get(cible, cle, recepteur) {
            const valeur = Reflect.get(cible, cle, recepteur) as unknown;
            if (typeof valeur !== "function") return valeur;
            return (...args: unknown[]) => {
              routes += 1;
              return (valeur as (...a: unknown[]) => unknown).apply(cible, args);
            };
          },
        });
        return { ...d, modeles: j.client, routes: comptees };
      },
    });
  };
  return {
    fabrique,
    requetes: () => journaux.flatMap((j) => j.requetes),
    routes: () => routes,
    compositions: () => compositions,
  };
}

async function lire<T>(org: Org, texte: string, valeurs: unknown[]): Promise<T[]> {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query(texte, valeurs)).rows as T[]);
}

/** Voyage de Rome écrit par la chaîne inversée : version 1, huit cases sur J1 et J2. */
async function voyageEcrit(org: Org): Promise<{ readonly tripId: string; readonly apercu: string }> {
  const adapter = createApiCreationAdapter({
    withOrg,
    maintenant: () => MAINTENANT,
    demarrerApercu: async () => null,
    demarrerVoyageComplet: async () => null,
    chaine: "inversee",
  });
  const r = await adapter.createTrip(contexteDe(org), demandeRome());
  expect(r.ok).toBe(true);
  const tripId = (r as { value: { tripId: string } }).value.tripId;
  const [run] = await lire<{ id: string }>(org, "SELECT id FROM public.generation_runs WHERE trip_id = $1 AND kind = 'preview'", [tripId]);
  const etat: EtatProgramme = { generationRunId: run!.id, organizationId: org.org, rang: 0 };
  const apresA = await etapeProgrammeDebut(etat, dependances());
  expect(apresA.arret).toBeUndefined();
  expect((await etapeProgrammeEcriture(apresA, dependances())).arret).toBeUndefined();
  await admin.query("INSERT INTO public.entitlements (organization_id, trip_id, kind) VALUES ($1, $2, 'tripUnlocked')", [org.org, tripId]);
  return { tripId, apercu: run!.id };
}

type Case = { readonly id: string; readonly stopId: string; readonly nom: string; readonly categorie: string };

async function casesDeLApercu(org: Org, tripId: string): Promise<Case[]> {
  const lignes = await lire<{ id: string; content: { stop: { id: string; name: string }; category: string } }>(
    org,
    "SELECT id, content FROM public.proposals WHERE trip_id = $1 AND phase = 'preview' ORDER BY position",
    [tripId],
  );
  return lignes.map((l) => ({ id: l.id, stopId: l.content.stop.id, nom: l.content.stop.name, categorie: l.content.category }));
}

/** Tri clos (8 cases) portant les décisions données, puis sa ligne `batch` sur `version` ; rend l'état d'entrée du lot. */
async function lotDuTri(
  org: Org,
  tripId: string,
  apercu: string,
  decisions: readonly { readonly signal: "like" | "dislike"; readonly cas: Case }[],
  version: number,
  jusqua = 8,
): Promise<EtatLot> {
  for (const { signal, cas } of decisions) {
    await admin.query(
      `INSERT INTO public.preference_signals (organization_id, trip_id, request_id, signal, origin, category, proposal_id)
       VALUES ($1, $2, gen_random_uuid(), $3, 'gesture', $4, $5)`,
      [org.org, tripId, signal, cas.categorie, cas.id],
    );
  }
  const lot = await inTx(app, { org: org.org, user: org.owner }, async (c) => {
    const cloture = (
      await c.query(
        "INSERT INTO public.deck_closures (organization_id, trip_id, generation_run_id, phase, through_position, request_id) VALUES ($1, $2, $3, 'preview', $4, gen_random_uuid()) RETURNING id",
        [org.org, tripId, apercu, jusqua],
      )
    ).rows[0].id as string;
    return (
      await c.query(
        "INSERT INTO public.generation_runs (organization_id, trip_id, kind, phase, base_version, deck_closure_id, request_id) VALUES ($1, $2, 'batch', 'queued', $3, $4, gen_random_uuid()) RETURNING id",
        [org.org, tripId, version, cloture],
      )
    ).rows[0].id as string;
  });
  return { generationRunId: lot, organizationId: org.org, rang: 0 };
}

async function derouler(etat: EtatLot, deps: DependancesGeneration): Promise<EtatLot> {
  const apresA = await etapeLotDebut(etat, deps);
  if (apresA.arret !== undefined || apresA.rang === etat.rang) return apresA;
  return etapeLotPlanification(apresA, deps);
}

async function ligneDuLot(org: Org, id: string) {
  const [ligne] = await lire<{ phase: string; stop_reason: string | null; step_seq: number; last_version: number | null; request_id: string }>(
    org,
    "SELECT phase, stop_reason, step_seq, last_version, request_id FROM public.generation_runs WHERE id = $1",
    [id],
  );
  return ligne!;
}

async function versions(org: Org, tripId: string) {
  return lire<{ version: number; snapshot: unknown; author_kind: string; request_id: string }>(
    org,
    "SELECT version, snapshot, author_kind, request_id FROM public.trip_versions WHERE trip_id = $1 ORDER BY version",
    [tripId],
  );
}

const etapes = (instantane: TripSnapshot) => instantane.days.flatMap((jour) => jour.items.flatMap((l) => (l.type === "stop" ? [l.stop] : [])));

describe("M1b : « Pas pour moi » change le programme sur api (PR 868 ; décisions 0126, 0136 § 4.4)", () => {
  it("PR 868 : les « Pas pour moi » sont retirés du programme, une version 2 écrite par le workflow, l'étape aimée gardée", async () => {
    const org = await createOrg(auth);
    const { tripId, apercu } = await voyageEcrit(org);
    const cases = await casesDeLApercu(org, tripId);
    expect(cases.length).toBe(8);
    const [ecartee1, aimee, ecartee2] = [cases[0]!, cases[1]!, cases[4]!];
    const obs = observee();
    const etat = await lotDuTri(
      org,
      tripId,
      apercu,
      [
        { signal: "dislike", cas: ecartee1 },
        { signal: "like", cas: aimee },
        { signal: "dislike", cas: ecartee2 },
      ],
      1,
    );
    const fin = await derouler(etat, dependances(obs.fabrique));
    expect(fin.arret).toBeUndefined();
    expect(fin.rang).toBe(2);

    const lues = await versions(org, tripId);
    expect(lues.map((v) => v.version)).toEqual([1, 2]);
    const v2 = lues[1]!;
    const ligne = await ligneDuLot(org, etat.generationRunId);
    expect(ligne).toMatchObject({ phase: "ready", stop_reason: null, last_version: 2 });
    expect(v2.author_kind).toBe("workflow");
    expect(v2.request_id).toBe(ligne.request_id);
    const [voyage] = await lire<{ current_version: number }>(org, "SELECT current_version FROM public.trips WHERE id = $1", [tripId]);
    expect(voyage!.current_version).toBe(2);

    const instantane = TripSnapshotSchema.parse(v2.snapshot);
    const noms = new Set(etapes(instantane).map((s) => nomNormalise(s.name)));
    expect(noms.has(nomNormalise(ecartee1.nom))).toBe(false);
    expect(noms.has(nomNormalise(ecartee2.nom))).toBe(false);
    expect(noms.has(nomNormalise(aimee.nom))).toBe(true);
    // Recomposé par le module partagé de M1a : toutes les journées, aucune durée stockée, jamais `toConfirm`.
    expect(instantane.days.map((d) => d.index)).toEqual(TripSnapshotSchema.parse(lues[0]!.snapshot).days.map((d) => d.index));
    expect(JSON.stringify(v2.snapshot)).not.toMatch(/"minutes"|"travelMinutes"|"toConfirm"/);
  });

  it("PR 868 : une seule requête de modèle, la requête revision (zdr, sans donnée Google ni récit), aucun appel Routes", async () => {
    const org = await createOrg(auth);
    const { tripId, apercu } = await voyageEcrit(org);
    const cases = await casesDeLApercu(org, tripId);
    const v1 = TripSnapshotSchema.parse((await versions(org, tripId))[0]!.snapshot);
    const obs = observee();
    const etat = await lotDuTri(org, tripId, apercu, [{ signal: "dislike", cas: cases[2]! }], 1);
    expect((await derouler(etat, dependances(obs.fabrique))).arret).toBeUndefined();

    expect(obs.requetes()).toHaveLength(1);
    const requete = obs.requetes()[0]!;
    expect(requete.prompt.id).toBe(PROMPT_REVISION.id);
    expect(requete.routage).toMatchObject({ zdr: true, data_collection: "deny" });
    const texte = requete.messages.map((m) => m.contenu).join("\n");
    expect(texte).toContain(`"pasPourMoi":["${cases[2]!.stopId}"]`);
    // Aucun identifiant de lieu, site vérifié, segment ni badge de la version servie dans la requête (0126 § 3).
    const placeIds = [...new Set(etapes(v1).flatMap((s) => (s.placeId === undefined ? [] : [s.placeId])))];
    expect(placeIds.length).toBeGreaterThan(0);
    for (const placeId of placeIds) expect(texte).not.toContain(placeId);
    for (const url of etapes(v1).flatMap((s) => (s.source === undefined ? [] : [s.source.url]))) expect(texte).not.toContain(url);
    expect(texte).not.toMatch(/"placeId"|"source"|"exceptions"|"segment"|"recit"/);
    expect(obs.routes()).toBe(0);
  });

  it("PR 868 : une seule révision par voyage (Q613) : le tri suivant clôt sa ligne sans version ni appel", async () => {
    const org = await createOrg(auth);
    const { tripId, apercu } = await voyageEcrit(org);
    const cases = await casesDeLApercu(org, tripId);
    expect((await derouler(await lotDuTri(org, tripId, apercu, [{ signal: "dislike", cas: cases[0]! }], 1, 4), dependances(observee().fabrique))).arret).toBeUndefined();
    expect((await versions(org, tripId)).length).toBe(2);

    const obs = observee();
    const second = await lotDuTri(org, tripId, apercu, [{ signal: "dislike", cas: cases[5]! }], 2);
    const fin = await derouler(second, dependances(obs.fabrique));
    expect(fin.arret).toBeUndefined();
    expect(obs.compositions()).toBe(0);
    expect(obs.requetes()).toHaveLength(0);
    expect(await ligneDuLot(org, second.generationRunId)).toMatchObject({ phase: "ready", stop_reason: null, last_version: 2, step_seq: 1 });
    expect((await versions(org, tripId)).length).toBe(2);
  });

  it("PR 868 : programme modifié depuis la version de base : rien n'est écrit, aucune requête de modèle", async () => {
    const org = await createOrg(auth);
    const { tripId, apercu } = await voyageEcrit(org);
    const cases = await casesDeLApercu(org, tripId);
    const obs = observee();
    const etat = await lotDuTri(org, tripId, apercu, [{ signal: "dislike", cas: cases[1]! }], 1);
    const apresA = await etapeLotDebut(etat, dependances(obs.fabrique));
    expect(apresA).toEqual({ ...etat, rang: 1 });
    // Une modification de la personne (version 2) arrive entre `a` et `e`.
    const v1 = (await versions(org, tripId))[0]!.snapshot;
    await ecrireVersion(admin, { organizationId: org.org, tripId, requestId: crypto.randomUUID(), auteur: "workflow", instantane: v1 });
    const fin = await etapeLotPlanification(apresA, dependances(obs.fabrique));
    expect(fin.arret).toBeUndefined();
    expect(obs.requetes()).toHaveLength(0);
    expect(await ligneDuLot(org, etat.generationRunId)).toMatchObject({ phase: "ready", stop_reason: null, last_version: null });
    expect((await versions(org, tripId)).map((v) => v.version)).toEqual([1, 2]);
  });

  it("PR 868 : forfait du profil programme réservé par a sous l'identifiant de l'exécution, avant tout appel ; barrière de production : refus sans composition", async () => {
    const org = await createOrg(auth);
    const { tripId, apercu } = await voyageEcrit(org);
    const cases = await casesDeLApercu(org, tripId);
    const obs = observee();
    const refuse = await lotDuTri(org, tripId, apercu, [{ signal: "dislike", cas: cases[1]! }], 1, 4);
    const production = await etapeLotDebut(refuse, dependances(obs.fabrique, { barriere: { env: { VERCEL_ENV: "production" } } }));
    expect(production.arret).toBe("production_refused");
    expect(await ligneDuLot(org, refuse.generationRunId)).toMatchObject({ phase: "failed", stop_reason: "production_refused" });
    const avant = await lire<{ n: number }>(org, "SELECT count(*)::int AS n FROM public.usage_ledger WHERE generation_run_id = $1", [refuse.generationRunId]);
    expect(avant[0]!.n).toBe(0);

    const etat = await lotDuTri(org, tripId, apercu, [{ signal: "dislike", cas: cases[5]! }], 1);
    expect((await etapeLotDebut(etat, dependances(obs.fabrique))).arret).toBeUndefined();
    expect(obs.compositions()).toBe(0);
    const reservees = await lire<{ n: number }>(org, "SELECT count(*)::int AS n FROM public.usage_ledger WHERE generation_run_id = $1", [etat.generationRunId]);
    expect(reservees[0]!.n).toBeGreaterThan(0);
    expect((await versions(org, tripId)).length).toBe(1);
  });
});
