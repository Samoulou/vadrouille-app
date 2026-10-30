import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import { fail } from "@/contracts";

import { closeAll, connect, createOrg, type DbClient, type Org } from "./helpers";
import { ecrireVoyagesSimules } from "../support/voyages-en-base";

/**
 * Liste « À faire » cochée depuis l'écran 11 sur l'adaptateur `api` (tâche M5e, ticket 903 ; spécification M5 § 7.3,
 * critère 29). Le chemin est celui de l'écran : action serveur `toggleChecklistItem` (`src/server/actions/sejour.ts`),
 * `revisionEnregistree()`, `RevisionAdapter.toggleChecklistItem` de l'adaptateur `api` (`src/adapters/api.ts`), cas d'usage
 * `basculerAFaire` sous `vadrouille_app`, puis relecture du voyage par `getTrip` du même adaptateur (le « rechargement »).
 * Seule la session est simulée (`contexteFacultatif`) ; l'adaptateur `api` est branché comme le fait `src/instrumentation.ts`,
 * avec le `withOrg` de `vadrouille_app` et le double de relectures.
 */

const session = vi.hoisted(() => ({ ctx: null as AdapterContext | null }));
vi.mock("@/features/compte/session", () => ({ contexteFacultatif: async () => session.ctx }));

const { toggleChecklistItem } = await import("@/server/actions/sejour");
const { getTripAdapter } = await import("@/adapters");
const { brancherLectureVoyages, debrancherLectureVoyagesPourTests } = await import("@/adapters/api-instance");
const { createApiTripAdapter } = await import("@/adapters/api");
const { creerWithOrg } = await import("@/server/with-org");
const { createDatabase } = await import("../../db/index");

const db = createDatabase("vadrouille_app");
const withOrg = creerWithOrg(db);
let app: DbClient;
let auth: DbClient;
let admin: DbClient;
let a: Org;
let ctxA: AdapterContext;
let tripA: string;

const contexte = (org: Org): AdapterContext => ({ organizationId: org.org, userId: org.owner, role: "owner" });
const etat = async (itemId: string) => (await admin.query("SELECT done FROM checklist_items WHERE id = $1", [itemId])).rows[0]?.done as boolean | undefined;

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  admin = await connect("admin");
  a = await createOrg(auth);
  ctxA = contexte(a);
  tripA = (await ecrireVoyagesSimules(app, a)).get("mock_trip_edimbourg") as string;
  debrancherLectureVoyagesPourTests();
  brancherLectureVoyages((double) => createApiTripAdapter({ relectures: double, withOrg }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  session.ctx = null;
});

afterAll(async () => {
  debrancherLectureVoyagesPourTests();
  await db.$client.end();
  await closeAll();
});

const surApi = () => {
  vi.stubEnv("DATA_ADAPTER", "api");
  vi.stubEnv("AUTH_ADAPTER", "better-auth");
  vi.stubEnv("VADROUILLE_ENV", "ci");
};

describe("liste « À faire » cochée depuis l'écran 11 sur api (M5e, critère 29)", () => {
  it("a-faire: cocher reste coché : action toggleChecklistItem par l'adaptateur api, puis relecture getTrip : la ligne est cochée ; décocher de même", async () => {
    surApi();
    session.ctx = ctxA;
    const lecture = () => getTripAdapter().getTrip(ctxA, tripA);
    const cible = (await lecture())?.checklist.find((ligne) => !ligne.done);
    expect(cible).toBeDefined();

    const coche = await toggleChecklistItem({ tripId: tripA, itemId: cible!.id, done: true });
    expect(coche).toMatchObject({ ok: true, value: { id: cible!.id, done: true } });
    // « Rechargement » : le voyage relu par l'adaptateur montre la ligne cochée.
    expect((await lecture())?.checklist.find((ligne) => ligne.id === cible!.id)).toMatchObject({ done: true });
    expect(await etat(cible!.id)).toBe(true);

    const decoche = await toggleChecklistItem({ tripId: tripA, itemId: cible!.id, done: false });
    expect(decoche).toMatchObject({ ok: true, value: { id: cible!.id, done: false } });
    expect((await lecture())?.checklist.find((ligne) => ligne.id === cible!.id)).toMatchObject({ done: false });
  });

  it("a-faire: cocher hors adaptateur api : internal sans rien lire ni écrire ; sans session : unauthenticated", async () => {
    session.ctx = ctxA;
    const cible = (await admin.query("SELECT id FROM checklist_items WHERE trip_id = $1 AND NOT done ORDER BY id LIMIT 1", [tripA])).rows[0]!.id as string;
    for (const adaptateur of ["mock", "prototype"]) {
      vi.stubEnv("DATA_ADAPTER", adaptateur);
      expect(await toggleChecklistItem({ tripId: tripA, itemId: cible, done: true })).toEqual(fail("internal"));
    }
    expect(await etat(cible)).toBe(false);

    surApi();
    session.ctx = null;
    expect(await toggleChecklistItem({ tripId: tripA, itemId: cible, done: true })).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
    expect(await etat(cible)).toBe(false);
  });
});
