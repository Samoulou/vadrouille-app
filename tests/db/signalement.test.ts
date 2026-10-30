import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createApiTripAdapter } from "@/adapters/api";
import type { AdapterContext, TripAdapter } from "@/adapters/types";
import { ok, type DaySnapshot } from "@/contracts";
import { SIGNALEMENTS_PAR_VOYAGE_ET_PAR_JOUR } from "@/server/config/lieux";
import { signalerEtape, type DependancesSignalement } from "@/server/voyages/signalement";
import { creerWithOrg, executeurSql } from "@/server/with-org";

import { creerRelecturesVoyages, type DoubleRelectures } from "@/mocks/relectures-voyages";

import { createDatabase } from "../../db/index";
import { convertirVoyagesSimules, ecrireVoyage } from "../support/voyages-en-base";
import { closeAll, connect, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * Signaler une erreur sur une étape sur la base réelle (tâche M5c, ticket 904 ; décision 0147 § 1 point 4, § 2 et § 12 S1 ;
 * spécification M5, critères 13, 14, 16 et 17) : cas d'usage `signalerEtape` de `src/server/voyages/signalement.ts`, sous
 * `vadrouille_app` avec le `withOrg` réel, sur la table `feedback` durcie par la migration 0022. Le débit par adresse IP
 * (limiteur, en-têtes de la requête) est injecté et toujours admis : il est éprouvé par les tests du limiteur.
 * Aucune donnée Google : `placeId` sentinelles du jeu simulé.
 */

const db = createDatabase("vadrouille_app");
const withOrg = creerWithOrg(db);
let app: DbClient;
let auth: DbClient;
let a: Org;
let b: Org;
let relectures: DoubleRelectures;
let lecture: TripAdapter;

const contexte = (org: Org): AdapterContext => ({ organizationId: org.org, userId: org.owner, role: "owner" });
const EDIMBOURG_DEBLOQUE = "mock_trip_edimbourg_debloque";

const donnees = () => {
  const converti = convertirVoyagesSimules().find((v) => v.mockId === EDIMBOURG_DEBLOQUE);
  if (!converti) throw new Error(`voyage simulé absent : ${EDIMBOURG_DEBLOQUE}`);
  return converti.donnees;
};

/** Étapes signalables (ni engagement, ni lieu à soi) de la version courante du jeu simulé, avec leur `placeId`. */
const etapesSignalables = () => {
  const versions = donnees().versions;
  const snapshot = versions[versions.length - 1]?.snapshot as { days: DaySnapshot[] };
  return snapshot.days.flatMap((jour) =>
    jour.items.flatMap((item) => (item.type === "stop" && item.stop.commitment === undefined && item.stop.addedBy !== "person" ? [item.stop] : [])),
  );
};

/** `withOrg` réel, la session de la transaction en Europe/Zurich (critère « plafond du jour UTC », 0147 § 2, mineur 2). */
const withOrgZurich: NonNullable<DependancesSignalement["withOrg"]> = (ctx, fn) =>
  withOrg(ctx, async (tx) => {
    await executeurSql(tx).query("SET LOCAL TIME ZONE 'Europe/Zurich'");
    return fn(tx);
  });

const signaler = (org: Org, input: Record<string, unknown>, options: { zurich?: boolean } = {}) =>
  signalerEtape({ contexte: async () => contexte(org), withOrg: options.zurich === true ? withOrgZurich : withOrg, limiteur: async () => ok(undefined) }, input);

type Ligne = Record<string, unknown>;
const signalements = (org: Org, tripId: string): Promise<Ligne[]> =>
  inTx(app, { org: org.org, user: org.owner }, async (c) =>
    (
      await c.query(
        "SELECT target_stop_id, place_id, reason, text, scope, created_by, request_id FROM public.feedback WHERE organization_id = $1 AND trip_id = $2 ORDER BY created_at",
        [org.org, tripId],
      )
    ).rows,
  );
const listeAFaire = (org: Org, tripId: string): Promise<Ligne[]> =>
  inTx(app, { org: org.org, user: org.owner }, async (c) =>
    (await c.query("SELECT * FROM public.checklist_items WHERE organization_id = $1 AND trip_id = $2 ORDER BY id", [org.org, tripId])).rows,
  );
const versions = (org: Org, tripId: string): Promise<Ligne[]> =>
  inTx(app, { org: org.org, user: org.owner }, async (c) =>
    (await c.query("SELECT version, snapshot FROM public.trip_versions WHERE organization_id = $1 AND trip_id = $2 ORDER BY version", [org.org, tripId])).rows,
  );

/** Écrit `n` signalements d'autres étapes du voyage, datés de `instant` (expression SQL `timestamptz`). */
const remplir = (org: Org, tripId: string, n: number, instant: string): Promise<void> =>
  inTx(app, { org: org.org, user: org.owner }, async (c) => {
    for (let i = 0; i < n; i += 1) {
      await c.query(
        `INSERT INTO public.feedback (organization_id, trip_id, target_stop_id, place_id, reason, text, scope, created_by, request_id, created_at)
         VALUES ($1, $2, $3, NULL, 'other', NULL, 'stop', $4, $5, ${instant})`,
        [org.org, tripId, `rempli-${randomUUID().slice(0, 8)}`, org.owner, randomUUID()],
      );
    }
  });

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  a = await createOrg(auth);
  b = await createOrg(auth);
  // Lecture du programme par l'adaptateur `api`, avec le double compté du port de relectures (Google, Routes).
  relectures = creerRelecturesVoyages();
  lecture = createApiTripAdapter({ relectures, withOrg });
});

afterEach(() => vi.restoreAllMocks());
afterAll(closeAll);

describe("signalement sur api (M5c, ticket 904)", () => {
  it("enregistre motif, étape, placeId de la version courante, auteur, request_id ; aucun texte ; signalement: rien ne change", async () => {
    const tripId = await ecrireVoyage(app, a, donnees());
    const [etape] = etapesSignalables();
    if (!etape) throw new Error("aucune étape signalable");
    const avant = await versions(a, tripId);
    const listeAvant = await listeAFaire(a, tripId);
    const programmeAvant = await lecture.getTrip(contexte(a), tripId);
    expect(listeAvant.length).toBeGreaterThan(0);
    const requestId = randomUUID();
    // Doubles comptés autour du signalement seul : aucun appel de modèle ni de Google (réseau) ni du port de relectures.
    const reseau = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("réseau interdit pendant un signalement"));
    const relecturesAvant = relectures.appels();
    expect(await signaler(a, { tripId, stopId: etape.id, reason: "closed", requestId })).toEqual(ok(null));
    expect(reseau).not.toHaveBeenCalled();
    expect(relectures.appels()).toBe(relecturesAvant);
    expect(await listeAFaire(a, tripId)).toEqual(listeAvant);
    expect(await lecture.getTrip(contexte(a), tripId)).toEqual(programmeAvant);
    expect(await signalements(a, tripId)).toEqual([
      { target_stop_id: etape.id, place_id: etape.placeId ?? null, reason: "closed", text: null, scope: "stop", created_by: a.owner, request_id: requestId },
    ]);
    expect(await versions(a, tripId)).toEqual(avant);
  });

  it("signalement: idempotent : même requestId, ou même motif sur la même étape, ne crée qu'un enregistrement ; un autre motif en crée un", async () => {
    const tripId = await ecrireVoyage(app, a, donnees());
    const [etape] = etapesSignalables();
    if (!etape) throw new Error("aucune étape signalable");
    const requestId = randomUUID();
    const demande = { tripId, stopId: etape.id, reason: "hours", requestId };
    expect(await signaler(a, demande)).toEqual(ok(null));
    expect(await signaler(a, demande)).toEqual(ok(null));
    expect(await signaler(a, { ...demande, requestId: randomUUID() })).toEqual(ok(null));
    expect(await signalements(a, tripId)).toHaveLength(1);
    expect(await signaler(a, { ...demande, reason: "price", requestId: randomUUID() })).toEqual(ok(null));
    expect((await signalements(a, tripId)).map((l) => l.reason)).toEqual(["hours", "price"]);
  });

  it("signalement: isolation : une autre organisation ne peut ni signaler une étape du voyage ni lire ses signalements", async () => {
    const tripId = await ecrireVoyage(app, a, donnees());
    const [etape] = etapesSignalables();
    if (!etape) throw new Error("aucune étape signalable");
    expect(await signaler(a, { tripId, stopId: etape.id, reason: "closed", requestId: randomUUID() })).toEqual(ok(null));
    const refus = await signaler(b, { tripId, stopId: etape.id, reason: "wrongPlace", requestId: randomUUID() });
    expect(refus.ok ? null : refus.error.code).toBe("not_found");
    expect(await signalements(b, tripId)).toEqual([]);
    expect((await signalements(a, tripId)).map((l) => l.reason)).toEqual(["closed"]);
  });

  it("étape inconnue : not_found, rien d'écrit", async () => {
    const tripId = await ecrireVoyage(app, a, donnees());
    const refus = await signaler(a, { tripId, stopId: "etape-inconnue", reason: "closed", requestId: randomUUID() });
    expect(refus.ok ? null : refus.error.code).toBe("not_found");
    expect(await signalements(a, tripId)).toEqual([]);
  });

  it("signalement: plafond du jour UTC sous une session en Europe/Zurich : la veille UTC ne compte pas ; le 21e du jour rend rate_limited ; un doublon passe encore", async () => {
    const tripId = await ecrireVoyage(app, a, donnees());
    const [etape, autre] = etapesSignalables();
    if (!etape || !autre) throw new Error("deux étapes signalables attendues");
    const minuitUtc = "(pg_catalog.date_trunc('day', pg_catalog.now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')";
    // 30 minutes avant minuit UTC : la veille en UTC, mais déjà le jour même à Zurich (UTC+1 ou UTC+2). Une borne calculée
    // comme une `date` dans le fuseau de la session compterait cette ligne.
    await remplir(a, tripId, 1, `${minuitUtc} - interval '30 minutes'`);
    await remplir(a, tripId, SIGNALEMENTS_PAR_VOYAGE_ET_PAR_JOUR - 1, "pg_catalog.now()");
    // 19 signalements du jour UTC (la ligne de la veille exclue) : le 20e passe.
    const premier = { tripId, stopId: etape.id, reason: "closed", requestId: randomUUID() };
    expect(await signaler(a, premier, { zurich: true })).toEqual(ok(null));
    // 19 du jour UTC, plus celui-ci : 20 ; le suivant est refusé, sans écriture.
    const refus = await signaler(a, { tripId, stopId: autre.id, reason: "closed", requestId: randomUUID() }, { zurich: true });
    expect(refus.ok ? null : refus.error.code).toBe("rate_limited");
    expect(await signalements(a, tripId)).toHaveLength(SIGNALEMENTS_PAR_VOYAGE_ET_PAR_JOUR + 1);
    // Doublon contrôlé avant le plafond : même réponse, rien d'écrit.
    expect(await signaler(a, premier, { zurich: true })).toEqual(ok(null));
    expect(await signalements(a, tripId)).toHaveLength(SIGNALEMENTS_PAR_VOYAGE_ET_PAR_JOUR + 1);
  });
});
