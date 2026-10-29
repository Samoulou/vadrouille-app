import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApiTripAdapter } from "@/adapters/api";
import type { AdapterContext } from "@/adapters/types";
import { EDIMBOURG_TRIP_ID } from "@/mocks/edimbourg";
import { creerRelecturesVoyages } from "@/mocks/relectures-voyages";
import { depuisIdentifiantPublic } from "@/server/payment/identifiant";
import { creerWithOrg } from "@/server/with-org";

import { ecrireVoyagesSimules } from "../support/voyages-en-base";
import { closeAll, connect, createOrg, inTx, type DbClient } from "./helpers";
import { base, contexte, creerBanc, fermerBase } from "./paiement-banc";

/**
 * Déblocage lu par l'adaptateur `api` après un paiement simulé (spécification B4, B4b point 3 ; critères B6 et, pour les
 * lignes en base du scénario de bout en bout B4-PO-14, B1 et B2). Banc de B4a (`./paiement-banc.ts` : adaptateur
 * `simulated`, prestataire simulé dont le transport livre l'événement signé au gestionnaire du webhook simulé, sans
 * réseau), voyage du jeu simulé écrit par `ecrireVoyagesSimules` (pendant d'Édimbourg, non débloqué), lecture par
 * `createApiTripAdapter` sur le double de relectures (aucun client réel).
 */

let app: DbClient;
let auth: DbClient;

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
});

afterAll(async () => {
  await fermerBase();
  await closeAll();
});

async function lignes(ctx: AdapterContext, sql: string, valeurs: unknown[] = []): Promise<Record<string, unknown>[]> {
  return inTx(app, { org: ctx.organizationId, user: ctx.userId }, async (c) => (await c.query(sql, valeurs)).rows);
}

async function voyageNonDebloque() {
  const org = await createOrg(auth);
  const ids = await ecrireVoyagesSimules(app, org);
  const tripId = ids.get(EDIMBOURG_TRIP_ID);
  if (tripId === undefined) throw new Error("voyage d'Édimbourg absent du jeu simulé");
  const ctx = contexte(org);
  const lecture = createApiTripAdapter({ relectures: creerRelecturesVoyages(), withOrg: creerWithOrg(base()) });
  return { ctx, tripId, lecture };
}

async function payer(banc: ReturnType<typeof creerBanc>, ctx: AdapterContext, tripId: string, method: "twint" | "card", issue: "succeeded" | "declined") {
  const depart = await banc.adapter.createCheckout(ctx, { tripId, method, requestId: randomUUID() });
  if (!depart.ok) throw new Error(`createCheckout : ${depart.error.code}`);
  const statut = await banc.adapter.simulateOutcome(ctx, depart.value.checkoutId, issue);
  return { checkoutId: depart.value.checkoutId, uuid: depuisIdentifiantPublic(depart.value.checkoutId) as string, statut };
}

describe("déblocage sur l'adaptateur api (B4b)", () => {
  it("debloquer: après un paiement réussi, getTrip de api renvoie unlocked: true, et aucune colonne de trips ne porte le déblocage (B6)", async () => {
    const { ctx, tripId, lecture } = await voyageNonDebloque();
    const banc = creerBanc();
    expect((await lecture.getTrip(ctx, tripId))?.unlocked).toBe(false);
    const avant = await lignes(ctx, "SELECT * FROM trips WHERE id = $1", [tripId]);

    const { uuid, statut } = await payer(banc, ctx, tripId, "twint", "succeeded");
    expect(statut.ok && statut.value.status).toBe("succeeded");

    expect((await lecture.getTrip(ctx, tripId))?.unlocked).toBe(true);
    expect((await lecture.listTrips(ctx)).find((trip) => trip.id === tripId)?.unlocked).toBe(true);
    // Le déblocage vit dans `entitlements` seulement : la ligne du voyage est inchangée.
    expect(await lignes(ctx, "SELECT * FROM trips WHERE id = $1", [tripId])).toEqual(avant);
    // Lignes du scénario B4-PO-14 : un paiement `succeeded`, une ligne `billing` `granted`, un droit `tripUnlocked`.
    expect(await lignes(ctx, "SELECT status FROM checkouts WHERE id = $1", [uuid])).toEqual([{ status: "succeeded" }]);
    expect(await lignes(ctx, "SELECT outcome FROM billing WHERE checkout_id = $1", [uuid])).toEqual([{ outcome: "granted" }]);
    expect(await lignes(ctx, "SELECT kind FROM entitlements WHERE trip_id = $1", [tripId])).toEqual([{ kind: "tripUnlocked" }]);
    // Un second paiement est refusé sans écrire (`already_unlocked`).
    expect(await banc.adapter.createCheckout(ctx, { tripId, method: "card", requestId: randomUUID() })).toEqual({ ok: false, error: { code: "already_unlocked" } });
    expect(await lignes(ctx, "SELECT count(*)::int AS n FROM checkouts WHERE trip_id = $1", [tripId])).toEqual([{ n: 1 }]);
  });

  it("debloquer: paiement refusé puis réussi, un seul droit (B2)", async () => {
    const { ctx, tripId, lecture } = await voyageNonDebloque();
    const banc = creerBanc();
    const refus = await payer(banc, ctx, tripId, "card", "declined");
    expect(refus.statut.ok && refus.statut.value.status).toBe("declined");
    expect((await lecture.getTrip(ctx, tripId))?.unlocked).toBe(false);
    const reussite = await payer(banc, ctx, tripId, "twint", "succeeded");
    expect(reussite.statut.ok && reussite.statut.value.status).toBe("succeeded");
    expect((await lecture.getTrip(ctx, tripId))?.unlocked).toBe(true);
    expect(await lignes(ctx, "SELECT kind FROM entitlements WHERE trip_id = $1", [tripId])).toEqual([{ kind: "tripUnlocked" }]);
  });
});
