import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import { ChecklistItemSchema } from "@/contracts";
import { basculerAFaire } from "@/server/voyages/a-faire";
import { creerWithOrg } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { ecrireVoyagesSimules } from "../support/voyages-en-base";
import { closeAll, connect, createOrg, type DbClient, type Org } from "./helpers";

/**
 * Cadre des actions et `toggleChecklistItem` sur la base réelle (spécification B6, B6b points 2 et 3 ; décision 0086
 * § 2.2). Critères `isolation: une organisation ne lit ni ne modifie les voyages d'une autre` (partie écriture, rejouée
 * par l'action) et `actions: le contexte vient de la session, jamais du client` (état final idempotent). Organisations
 * par `createOrg` (`vadrouille_auth`), voyages par `tests/support/voyages-en-base.ts` ; l'action s'exécute sous
 * `vadrouille_app` par `withOrg`, avec le contexte « de la session » injecté (le cadre ne lit jamais l'entrée pour lui).
 */

const db = createDatabase("vadrouille_app");
const withOrg = creerWithOrg(db);
let app: DbClient;
let auth: DbClient;
let admin: DbClient;
let a: Org;
let b: Org;
let ctxA: AdapterContext;
let tripA: string;
let tripB: string;

const contexte = (org: Org): AdapterContext => ({ organizationId: org.org, userId: org.owner, role: "owner" });
const action = (ctx: AdapterContext | null) => ({ contexte: async () => ctx, withOrg });

type LigneEtat = { id: string; done: boolean; done_at: Date | null; organization_id: string };

/** État des lignes « À faire » d'un voyage, lu par la connexion d'administration (hors RLS) pour constater l'effet. */
async function lignes(tripId: string): Promise<LigneEtat[]> {
  return (await admin.query("SELECT id, done, done_at, organization_id FROM checklist_items WHERE trip_id = $1 ORDER BY id", [tripId])).rows as LigneEtat[];
}

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  admin = await connect("admin");
  a = await createOrg(auth);
  b = await createOrg(auth);
  ctxA = contexte(a);
  tripA = (await ecrireVoyagesSimules(app, a)).get("mock_trip_edimbourg") as string;
  tripB = (await ecrireVoyagesSimules(app, b)).get("mock_trip_edimbourg") as string;
});

afterAll(async () => {
  await db.$client.end();
  await closeAll();
});

describe("toggleChecklistItem (B6b point 3)", () => {
  it("coche puis décoche : ChecklistItem validé, done_at posé par la base puis remis à nul", async () => {
    const [cible] = (await lignes(tripA)).filter((l) => !l.done);
    expect(cible).toBeDefined();
    const avant = (await admin.query("SELECT now() AS t")).rows[0].t as Date;

    const coche = await basculerAFaire(action(ctxA), { tripId: tripA, itemId: cible!.id, done: true });
    expect(coche.ok).toBe(true);
    if (coche.ok) {
      expect(ChecklistItemSchema.parse(coche.value)).toEqual(coche.value);
      expect(coche.value).toMatchObject({ id: cible!.id, done: true });
    }
    const apres = (await lignes(tripA)).find((l) => l.id === cible!.id)!;
    expect(apres.done).toBe(true);
    expect(apres.done_at).not.toBeNull();
    expect(apres.done_at!.getTime()).toBeGreaterThanOrEqual(avant.getTime() - 1_000);

    const decoche = await basculerAFaire(action(ctxA), { tripId: tripA, itemId: cible!.id, done: false });
    expect(decoche.ok && decoche.value.done).toBe(false);
    const fin = (await lignes(tripA)).find((l) => l.id === cible!.id)!;
    expect(fin).toMatchObject({ done: false, done_at: null });
  });

  it("actions: deux appels identiques donnent le même état final (done_at du premier cochage gardé)", async () => {
    const [cible] = (await lignes(tripA)).filter((l) => !l.done);
    const entree = { tripId: tripA, itemId: cible!.id, done: true };
    const premier = await basculerAFaire(action(ctxA), entree);
    const etat1 = (await lignes(tripA)).find((l) => l.id === cible!.id)!;
    const second = await basculerAFaire(action(ctxA), entree);
    const etat2 = (await lignes(tripA)).find((l) => l.id === cible!.id)!;
    expect(second).toEqual(premier);
    expect(etat2).toEqual(etat1);
    // Remise dans l'état de départ, deux fois aussi.
    await basculerAFaire(action(ctxA), { ...entree, done: false });
    await basculerAFaire(action(ctxA), { ...entree, done: false });
    expect((await lignes(tripA)).find((l) => l.id === cible!.id)).toMatchObject({ done: false, done_at: null });
  });

  it("isolation: la ligne d'un voyage d'une autre organisation rend not_found et ne modifie aucune ligne", async () => {
    const avantA = await lignes(tripA);
    const avantB = await lignes(tripB);
    for (const ligne of avantB) {
      // Voyage de B, ligne de B, contexte de A.
      expect(await basculerAFaire(action(ctxA), { tripId: tripB, itemId: ligne.id, done: !ligne.done })).toEqual({ ok: false, error: { code: "not_found" } });
      // Voyage de A, ligne de B (identifiant connu d'une autre organisation).
      expect(await basculerAFaire(action(ctxA), { tripId: tripA, itemId: ligne.id, done: !ligne.done })).toEqual({ ok: false, error: { code: "not_found" } });
    }
    expect(await lignes(tripA)).toEqual(avantA);
    expect(await lignes(tripB)).toEqual(avantB);
  });

  it("voyage inconnu, ligne inconnue : not_found, rien d'écrit", async () => {
    const avant = await lignes(tripA);
    const inconnu = "0d000000-0000-4000-8000-00000000ffff";
    const [ligne] = avant;
    expect(await basculerAFaire(action(ctxA), { tripId: inconnu, itemId: ligne!.id, done: true })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await basculerAFaire(action(ctxA), { tripId: tripA, itemId: inconnu, done: true })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await lignes(tripA)).toEqual(avant);
  });

  it("actions: sans session, unauthenticated ; organizationId ou userId dans l'entrée, validation_failed ; aucune écriture", async () => {
    const avant = await lignes(tripB);
    const [ligne] = avant;
    expect(await basculerAFaire(action(null), { tripId: tripB, itemId: ligne!.id, done: true })).toEqual({ ok: false, error: { code: "unauthenticated" } });
    for (const extra of [{ organizationId: b.org }, { userId: b.owner }]) {
      const resultat = await basculerAFaire(action(ctxA), { tripId: tripB, itemId: ligne!.id, done: true, ...extra });
      expect(resultat.ok === false && resultat.error.code).toBe("validation_failed");
    }
    expect(await lignes(tripB)).toEqual(avant);
  });
});
