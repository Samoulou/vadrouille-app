import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TripSnapshotSchema, type TripCommitment, type TripDraft } from "@/contracts";
import { lireBrouillon } from "@/server/creation/brouillon";
import { composerSimuleeAvec } from "@/server/composition/generation";
import { doublesEdimbourg } from "../support/banc-apercu";
import { lireVoyage } from "@/server/generation/lecture";
import { ecrireVersion } from "@/server/versions/ecrire";
import { creerWithSystemOrg } from "@/server/with-system-org";
import { WithOrgContextError, executeurSql } from "@/server/with-org";

import { BRIEF_EDIMBOURG, MAINTENANT, PLAFONDS_LARGES, banc, contexteDe, creerHorlogeManuelle, creerWithOrg, creerWithSystemOrgPourTests, demandeEdimbourg, derouler } from "../support/banc-apercu";
import { creerBaseApercu, type BaseApercu } from "./base-apercu";
import { closeAll, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * Revue de la PR #563, bloquants 9 et 10 : `génération: lecture du brouillon égale à lireBrouillon`, `src/server/versions/ecrire.ts`
 * (partagé avec B11, B9-TL-10) et `src/server/with-system-org.ts` (B9-TL-12 point 3). Base réelle, aucune clé, aucun appel réel.
 */

let base: BaseApercu;
let db: BaseApercu["db"];
let withOrg: ReturnType<typeof creerWithOrg>;
let app: DbClient;
let auth: DbClient;

// Base jetable : les forfaits de l'aperçu n'entrent pas dans les sommes du jour de la base commune (`usage.test.ts`).
beforeAll(async () => {
  base = await creerBaseApercu("modules");
  ({ db, app, auth } = base);
  withOrg = creerWithOrg(db);
}, 120_000);
afterAll(async () => {
  await base.supprimer();
  await closeAll();
});

const nouvelleOrg = (): Promise<Org> => createOrg(auth);

async function creer(org: Org, demande = demandeEdimbourg()): Promise<string> {
  const { adapter } = banc(withOrg);
  const r = await adapter.createTrip(contexteDe(org), demande);
  expect(r.ok).toBe(true);
  return (r as { value: { tripId: string } }).value.tripId;
}

describe("génération: lecture du brouillon égale à lireBrouillon", () => {
  it("brouillon, brief et fuseau identiques sur des voyages à plusieurs villes, logements de chaque type et engagements", async () => {
    const engagements: TripCommitment[] = [
      { kind: "flight", label: "Vol aller", date: "2027-07-10", start: "08:15", end: "09:45" },
      { kind: "booking", label: "Table", date: "2027-07-12", start: "20:00" },
    ];
    const brouillons: TripDraft[] = [
      {
        destination: "Paris",
        start: "2027-07-10",
        end: "2027-07-18",
        lodging: { kind: "known", label: "Hôtel du Test" },
        otherCities: [
          { name: "Lyon", arrival: "2027-07-13", lodging: { kind: "suggestedLodging", lodgingId: "lodging_test_1", placeId: "test_place_logement", name: "[Logement maison]" } },
          { name: "Nice", arrival: "2027-07-16", lodging: { kind: "suggestedArea", areaId: "area_test_1", name: "[Quartier maison]", center: { lat: 45.76, lng: 4.83 }, radiusM: 800 } },
        ],
        commitments: engagements,
      },
      {
        destination: "Lisbonne",
        start: "2027-09-01",
        end: "2027-09-05",
        lodging: { kind: "none" },
        otherCities: [{ name: "Porto", arrival: "2027-09-03", lodging: { kind: "suggestedLodging", lodgingId: "lodging_test_2", name: "[Logement sans lieu]" } }],
        commitments: [],
      },
      { destination: "Rome", start: "2027-10-01", end: "2027-10-04", lodging: { kind: "area", label: "Trastevere" }, otherCities: [], commitments: [] },
    ];
    for (const draft of brouillons) {
      for (const brief of [BRIEF_EDIMBOURG, { ...BRIEF_EDIMBOURG, mealBudgetPerPerson: undefined, limits: ["nightlife" as const] }]) {
        const org = await nouvelleOrg();
        const demande = demandeEdimbourg(draft, brief as typeof BRIEF_EDIMBOURG);
        const tripId = await creer(org, demande);
        const attendu = await withOrg({ organizationId: org.org, userId: org.owner }, (tx) => lireBrouillon(executeurSql(tx), org.org, tripId));
        const lu = await creerWithSystemOrgPourTests(db)(org.org, (tx) => lireVoyage(executeurSql(tx), org.org, tripId));
        expect(attendu).not.toBeNull();
        expect(lu).not.toBeNull();
        expect({ draft: lu!.draft, brief: lu!.brief, timeZone: lu!.timeZone }).toEqual(attendu);
        expect(lu!.sejours).toHaveLength(1 + draft.otherCities.length);
      }
    }
  });
});

describe("versions: src/server/versions/ecrire.ts", () => {
  /** Instantané valide pris sur une version publiée par l'aperçu (variante simulée). */
  async function instantaneValide(org: Org) {
    const tripId = await creer(org);
    const run = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT id FROM public.generation_runs WHERE trip_id = $1", [tripId])).rows[0].id as string);
    await derouler(
      { generationRunId: run, organizationId: org.org, rang: 0 },
      { transaction: creerWithSystemOrgPourTests(db), horloge: creerHorlogeManuelle(MAINTENANT), plafonds: PLAFONDS_LARGES, barriere: { env: { VADROUILLE_ENV: "ci" } }, reserverEnSimulee: true, composition: () => composerSimuleeAvec({ doubles: doublesEdimbourg }) },
    );
    const snapshot = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT snapshot FROM public.trip_versions WHERE trip_id = $1", [tripId])).rows[0].snapshot as unknown);
    return snapshot;
  }

  const ecrire = (org: Org, tripId: string, fn: (executeur: ReturnType<typeof executeurSql>) => Promise<unknown>) => creerWithSystemOrgPourTests(db)(org.org, (tx) => fn(executeurSql(tx)) as Promise<unknown>);
  const lignes = (org: Org, tripId: string) =>
    inTx(app, { org: org.org, user: org.owner }, async (c) => {
      const versions = (await c.query("SELECT version, parent_version, request_id, author_kind FROM public.trip_versions WHERE trip_id = $1 ORDER BY version", [tripId])).rows;
      const courante = (await c.query("SELECT current_version FROM public.trips WHERE id = $1", [tripId])).rows[0].current_version as number | null;
      return { versions, courante };
    });

  it("écrit une version, avance current_version, puis rejoue sans rien écrire (request_id)", async () => {
    const org = await nouvelleOrg();
    const instantane = await instantaneValide(org);
    const tripId = await creer(org);
    const requestId = randomUUID();
    const demande = { organizationId: org.org, tripId, requestId, auteur: "workflow" as const, instantane, instantanePrecedent: null };
    const premiere = (await ecrire(org, tripId, (x) => ecrireVersion(x, demande))) as { version: number; creee: boolean };
    expect(premiere).toMatchObject({ version: 1, creee: true });
    const rejeu = (await ecrire(org, tripId, (x) => ecrireVersion(x, demande))) as { version: number; creee: boolean };
    expect(rejeu).toMatchObject({ version: 1, creee: false });
    const etat = await lignes(org, tripId);
    expect(etat.versions).toHaveLength(1);
    expect(etat.courante).toBe(1);
  });

  it("versions successives : parent_version = précédente, current_version monotone", async () => {
    const org = await nouvelleOrg();
    const instantane = await instantaneValide(org);
    const tripId = await creer(org);
    for (let i = 1; i <= 3; i += 1) {
      const r = (await ecrire(org, tripId, (x) => ecrireVersion(x, { organizationId: org.org, tripId, requestId: randomUUID(), auteur: "engine", instantane, instantanePrecedent: i === 1 ? null : TripSnapshotSchema.parse(instantane) }))) as { version: number };
      expect(r.version).toBe(i);
    }
    const etat = await lignes(org, tripId);
    expect(etat.versions.map((v) => [v.version, v.parent_version])).toEqual([[1, null], [2, 1], [3, 2]]);
    expect(etat.courante).toBe(3);
  });

  it("instantané invalide (clé Google, champ inconnu) : refusé avant toute écriture", async () => {
    const org = await nouvelleOrg();
    const instantane = (await instantaneValide(org)) as Record<string, unknown>;
    const tripId = await creer(org);
    for (const mauvais of [{ ...instantane, googleApiKey: "AIzaSENTINELLE" }, { ...instantane, version: "pas un nombre" }, null, "texte"]) {
      await expect(ecrire(org, tripId, (x) => ecrireVersion(x, { organizationId: org.org, tripId, requestId: randomUUID(), auteur: "workflow", instantane: mauvais, instantanePrecedent: null }))).rejects.toThrow();
    }
    expect(await lignes(org, tripId)).toEqual({ versions: [], courante: null });
  });

  it("auteur incohérent ou identifiant illisible : refusé, rien d'écrit", async () => {
    const org = await nouvelleOrg();
    const instantane = await instantaneValide(org);
    const tripId = await creer(org);
    const base = { organizationId: org.org, tripId, requestId: randomUUID(), instantane, instantanePrecedent: null };
    const refus = [
      { ...base, auteur: "user" as const },
      { ...base, auteur: "user" as const, auteurUserId: "pas-un-uuid" },
      { ...base, auteur: "workflow" as const, auteurUserId: org.owner },
      { ...base, auteur: "workflow" as const, requestId: "illisible" },
      { ...base, auteur: "workflow" as const, tripId: "illisible" },
    ];
    for (const demande of refus) await expect(ecrire(org, tripId, (x) => ecrireVersion(x, demande))).rejects.toThrow(RangeError);
    expect(await lignes(org, tripId)).toEqual({ versions: [], courante: null });
    const ok = (await ecrire(org, tripId, (x) => ecrireVersion(x, { ...base, auteur: "user", auteurUserId: org.owner }))) as { creee: boolean };
    expect(ok.creee).toBe(true);
  });
});

describe("with-system-org: src/server/with-system-org.ts", () => {
  const systeme: ReturnType<typeof creerWithSystemOrg> = (organizationId, fn) => creerWithSystemOrg(db)(organizationId, fn);

  it("refuse un identifiant qui n'est pas un uuid, sans requête", async () => {
    let appels = 0;
    for (const mauvais of ["", "pas-un-uuid", "12345678-1234-1234-1234-12345678901", "'; DROP TABLE trips; --", undefined as unknown as string]) {
      await expect(
        systeme(mauvais, async () => {
          appels += 1;
          return 1;
        }),
      ).rejects.toBeInstanceOf(WithOrgContextError);
    }
    expect(appels).toBe(0);
  });

  it("pose app.organization_id seul : aucun app.user_id", async () => {
    const org = await nouvelleOrg();
    const lu = await systeme(org.org, async (tx) => {
      const { rows } = await executeurSql(tx).query("SELECT current_setting('app.organization_id', true) AS organisation, current_setting('app.user_id', true) AS personne");
      return rows[0] as { organisation: string | null; personne: string | null };
    });
    expect(lu.organisation).toBe(org.org);
    expect(lu.personne === null || lu.personne === "").toBe(true);
  });

  it("isolation : le contexte d'une organisation ne voit aucun voyage d'une autre", async () => {
    const a = await nouvelleOrg();
    const b = await nouvelleOrg();
    const tripA = await creer(a);
    const tripB = await creer(b);
    const vus = async (org: Org) =>
      systeme(org.org, async (tx) => {
        const { rows } = await executeurSql(tx).query("SELECT id FROM public.trips");
        return rows.map((r) => r.id as string);
      });
    expect(await vus(a)).toEqual([tripA]);
    expect(await vus(b)).toEqual([tripB]);
  });
});
