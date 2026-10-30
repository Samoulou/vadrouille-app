import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApiTripAdapter } from "@/adapters/api";
import type { AdapterContext, RevisionAdapter, TripAdapter } from "@/adapters/types";
import { MoveDraftSchema, MoveOptionsSchema, ok, PatchResultSchema, TripPatchSchema, TripSnapshotSchema, type Result, type StopSnapshot, type TripSnapshot } from "@/contracts";
import { etapesVerrouilleesModifiees } from "@/domain/verrous";
import { creerRelecturesVoyages, type DoubleRelectures } from "@/mocks/relectures-voyages";
import { VERSIONS_MAX_PAR_VOYAGE } from "@/server/config/retouches";
import { appliquerDeplacement, optionsDeDeplacement, proposerDeplacement } from "@/server/versions/deplacement";
import { appliquerRetour } from "@/server/versions/historique";
import { basculerVerrou, type DependancesRetouche } from "@/server/versions/retouches";
import { creerWithOrg } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { convertirVoyagesSimules, ecrireVoyage, type DonneesVoyage } from "../support/voyages-en-base";
import { closeAll, connect, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * « Déplacer une étape » sur l'adaptateur `api` (ticket 947 ; spécification M5 § 3 et § 14 ; décision 0147 § 8 et § 11), sur
 * la base réelle : cas d'usage de `src/server/versions/deplacement.ts` sous `vadrouille_app` avec le `withOrg` réel. Le débit
 * `retouche` est injecté et toujours admis (éprouvé par les tests du limiteur). Voyage d'Édimbourg du jeu simulé, débloqué
 * par une ligne `tripUnlocked`. Aucune donnée Google : `placeId` simulés et noms entre crochets ; le port de relectures est
 * le double, compté : un déplacement ne l'appelle jamais (aucun appel Google ni Routes).
 */

const db = createDatabase("vadrouille_app");
const withOrg = creerWithOrg(db);
let app: DbClient;
let auth: DbClient;
let a: Org;
let b: Org;
let relectures: DoubleRelectures;
let adaptateur: TripAdapter;
let revision: RevisionAdapter;

const contexte = (org: Org): AdapterContext => ({ organizationId: org.org, userId: org.owner, role: "owner" });
const EDIMBOURG = "mock_trip_edimbourg";
const JARDIN = "j2-jardin-botanique";
const POINT_J4 = "deplacer-j4-1545";

const donnees = (debloque: boolean): DonneesVoyage => {
  const converti = convertirVoyagesSimules().find((v) => v.mockId === EDIMBOURG);
  if (!converti) throw new Error(`voyage simulé absent : ${EDIMBOURG}`);
  const { entitlements } = converti.donnees;
  return { ...converti.donnees, entitlements: debloque ? [...entitlements.filter((k) => k !== "tripUnlocked"), "tripUnlocked"] : entitlements.filter((k) => k !== "tripUnlocked") };
};
const nouveauVoyage = (debloque = true, org: Org = a) => ecrireVoyage(app, org, donnees(debloque), undefined, { candidats: true });

const dependances = (ctx: AdapterContext | null): DependancesRetouche => ({ contexte: async () => ctx, withOrg, limiteur: async () => ok(undefined) });
const options = (tripId: string, stopId: string = JARDIN, ctx: AdapterContext | null = contexte(a)) => optionsDeDeplacement(dependances(ctx), { tripId, stopId });
const apercu = (tripId: string, baseVersion: number, stopId: string = JARDIN, pointId: string = POINT_J4, ctx: AdapterContext | null = contexte(a)) =>
  proposerDeplacement(dependances(ctx), { tripId, stopId, pointId, baseVersion });
const deplacer = (tripId: string, baseVersion: number, requestId: string = randomUUID(), stopId: string = JARDIN, pointId: string = POINT_J4, ctx: AdapterContext | null = contexte(a)) =>
  appliquerDeplacement(dependances(ctx), { tripId, requestId, stopId, pointId, baseVersion });

type Ligne = Record<string, unknown>;
const versions = (org: Org, tripId: string): Promise<Ligne[]> =>
  inTx(app, { org: org.org, user: org.owner }, async (c) =>
    (
      await c.query(
        "SELECT version, parent_version, author_kind, author_user_id, snapshot, patch FROM trip_versions WHERE organization_id = $1 AND trip_id = $2 ORDER BY version",
        [org.org, tripId],
      )
    ).rows,
  );
const lignesAFaire = (org: Org, tripId: string): Promise<Ligne[]> =>
  inTx(app, { org: org.org, user: org.owner }, async (c) =>
    (await c.query("SELECT id, stop_id, done FROM checklist_items WHERE organization_id = $1 AND trip_id = $2 ORDER BY id", [org.org, tripId])).rows,
  );
const instantane = (ligne: Ligne | undefined): TripSnapshot => TripSnapshotSchema.parse(ligne?.snapshot);
const etapes = (s: TripSnapshot): { jour: number; stop: StopSnapshot }[] =>
  s.days.flatMap((jour) => jour.items.flatMap((item) => (item.type === "stop" ? [{ jour: jour.index, stop: item.stop }] : [])));
const etape = (s: TripSnapshot, id: string) => etapes(s).find((e) => e.stop.id === id);

const valeur = <T>(resultat: Result<T>): T => {
  if (!resultat.ok) throw new Error(`refus inattendu : ${resultat.error.code}`);
  return resultat.value;
};
const erreur = <T>(resultat: Result<T>) => (resultat.ok ? null : resultat.error);

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  a = await createOrg(auth);
  b = await createOrg(auth);
  relectures = creerRelecturesVoyages();
  adaptateur = createApiTripAdapter({ relectures, withOrg });
  if (adaptateur.revision === undefined) throw new Error("révision absente de l'adaptateur api");
  revision = adaptateur.revision;
});

afterAll(closeAll);

describe("déplacer une étape sur api (ticket 947)", () => {
  it("deplacer: points, aperçu puis application : version 2 (auteur user, patch [move]), aucune relecture du port ; rejeu idempotent", async () => {
    const tripId = await nouveauVoyage();
    const base = instantane((await versions(a, tripId))[0]);
    const appelsAvant = relectures.appels();

    // Points par l'adaptateur (même chemin que l'action serveur) : J4 vers 15:45, aucun point dans les temps libres voisins.
    const lus = MoveOptionsSchema.parse(valeur(await revision.getMoveOptions(contexte(a), { tripId, stopId: JARDIN })));
    expect(lus.days.map((jour) => jour.index)).toEqual(base.days.map((jour) => jour.index));
    expect(lus.days.find((jour) => jour.index === 4)?.points).toContainEqual({ id: POINT_J4, time: "15:45" });
    expect(lus.days.find((jour) => jour.index === 2)?.points).toEqual([]);

    // Aperçu : rien n'est écrit, trajets sans durée, « Ce qui change » sans trajet ni ligne « À faire ».
    const brouillon = MoveDraftSchema.parse(valeur(await revision.previewMove(contexte(a), { tripId, stopId: JARDIN, pointId: POINT_J4, baseVersion: 1 })));
    expect(brouillon.days.map((jour) => jour.index)).toEqual([2, 4]);
    expect(brouillon.targetStopId).toBe(JARDIN);
    expect(brouillon.changes[0]).toMatchObject({ type: "moved", before: { day: 2, time: "13:25" }, after: { day: 4, time: "15:45" } });
    expect(brouillon.changes.some((c) => c.type === "segment" || c.type === "checklist")).toBe(false);
    const segments = brouillon.days.flatMap((jour) => jour.items.flatMap((item) => (item.type === "segment" ? [item.segment] : [])));
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.every((segment) => segment.minutes === null)).toBe(true);
    expect(await versions(a, tripId)).toHaveLength(1);

    const lignesAvant = await lignesAFaire(a, tripId);
    const requestId = randomUUID();
    // Application par le cas d'usage, débit injecté (l'adaptateur prend le limiteur des en-têtes de la requête).
    const resultat = PatchResultSchema.parse(valeur(await deplacer(tripId, 1, requestId)));
    expect(resultat).toMatchObject({ version: 2, touchedDays: [2, 4] });
    // Aucun appel du port de relectures : ni Google, ni Routes.
    expect(relectures.appels()).toBe(appelsAvant);

    const lignes = await versions(a, tripId);
    expect(lignes).toHaveLength(2);
    expect(lignes[1]).toMatchObject({ version: 2, parent_version: 1, author_kind: "user", author_user_id: a.owner });
    expect(TripPatchSchema.parse(lignes[1]?.patch)).toEqual({ requestId, baseVersion: 1, operations: [{ op: "move", stopId: JARDIN, day: 4, time: "15:45" }] });
    const apres = instantane(lignes[1]);
    expect(etape(apres, JARDIN)).toMatchObject({ jour: 4, stop: { start: "15:45", end: "17:20", locked: false } });
    // Aucune autre étape ne bouge.
    for (const { jour, stop } of etapes(base)) if (stop.id !== JARDIN) expect(etape(apres, stop.id)).toEqual({ jour, stop });
    // Lecture suivante (« rechargement ») : le port relit les trajets des jours touchés ; le jardin est servi au J4.
    const j4 = await adaptateur.getDay(contexte(a), tripId, 4);
    expect(j4?.items.some((item) => item.type === "stop" && item.stop.id === JARDIN && item.stop.start === "15:45")).toBe(true);
    const j2 = await adaptateur.getDay(contexte(a), tripId, 2);
    expect(j2?.items.some((item) => item.type === "stop" && item.stop.id === JARDIN)).toBe(false);
    // Une étape déplacée garde ses lignes « À faire » (spécification M5 § 7.4).
    expect(await lignesAFaire(a, tripId)).toEqual(lignesAvant);

    // Rejeu de la même demande : même réponse, aucune version de plus ; même requestId pour une autre étape : conflit.
    expect(valeur(await deplacer(tripId, 1, requestId))).toEqual(resultat);
    expect(erreur(await deplacer(tripId, 1, requestId, "j4-holyrood"))).toEqual({ code: "version_conflict", retryable: true, currentVersion: 2 });
    expect(await versions(a, tripId)).toHaveLength(2);
  });

  it("deplacer: R3 rejouée : une étape verrouillée du jour d'arrivée ne bouge pas ; une étape verrouillée ne se déplace pas", async () => {
    const tripId = await nouveauVoyage();
    valeur(await basculerVerrou(dependances(contexte(a)), "lock", { tripId, requestId: randomUUID(), stopId: "j4-arthurs-seat", baseVersion: 1 }));
    const v2 = instantane((await versions(a, tripId))[1]);
    valeur(await deplacer(tripId, 2));
    const v3 = instantane((await versions(a, tripId))[2]);
    expect(etapesVerrouilleesModifiees(v2.days, v3.days)).toEqual([]);
    expect(etape(v3, "j4-arthurs-seat")).toEqual(etape(v2, "j4-arthurs-seat"));

    // L'étape verrouillée elle-même : refusée partout (points, aperçu, application), sans version.
    expect(erreur(await options(tripId, "j4-arthurs-seat"))).toEqual({ code: "validation_failed", field: "stopId" });
    expect(erreur(await apercu(tripId, 3, "j4-arthurs-seat"))).toEqual({ code: "validation_failed", field: "stopId" });
    expect(erreur(await deplacer(tripId, 3, randomUUID(), "j4-arthurs-seat"))).toEqual({ code: "validation_failed", field: "stopId" });
    // Un engagement (Tattoo, verrouillé) et un événement de `Day.events` non plus.
    expect(erreur(await deplacer(tripId, 3, randomUUID(), "j1-tattoo"))).toEqual({ code: "validation_failed", field: "stopId" });
    const evenement = v3.days.flatMap((jour) => jour.events)[0];
    if (evenement !== undefined) expect(erreur(await options(tripId, evenement.id))).toEqual({ code: "validation_failed", field: "stopId" });
    expect(await versions(a, tripId)).toHaveLength(3);
  });

  it("deplacer: refusé avant le déblocage : not_unlocked (retryable faux), sans écriture", async () => {
    const tripId = await nouveauVoyage(false);
    expect(erreur(await options(tripId))).toEqual({ code: "not_unlocked", retryable: false });
    expect(erreur(await apercu(tripId, 1))).toEqual({ code: "not_unlocked", retryable: false });
    expect(erreur(await deplacer(tripId, 1))).toEqual({ code: "not_unlocked", retryable: false });
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it("deplacer: conflit de version (aperçu et application), point disparu : no_option, sans écriture", async () => {
    const tripId = await nouveauVoyage();
    valeur(await deplacer(tripId, 1));
    expect(erreur(await apercu(tripId, 1))).toEqual({ code: "version_conflict", retryable: true, currentVersion: 2 });
    expect(erreur(await deplacer(tripId, 1, randomUUID(), "j4-holyrood"))).toEqual({ code: "version_conflict", retryable: true, currentVersion: 2 });
    // Le temps libre du J4 est pris : le point n'existe plus pour une autre étape.
    expect(erreur(await deplacer(tripId, 2, randomUUID(), "j2-royal-mile", POINT_J4))).toEqual({ code: "no_option" });
    expect(erreur(await apercu(tripId, 2, JARDIN, "deplacer-j9-1000"))).toEqual({ code: "no_option" });
    expect(await versions(a, tripId)).toHaveLength(2);
  });

  it("deplacer : étape inconnue not_found ; autre organisation et sans session refusés ; champ inconnu validation_failed", async () => {
    const tripId = await nouveauVoyage();
    expect(erreur(await options(tripId, "j9-inconnue"))).toEqual({ code: "not_found" });
    expect(erreur(await deplacer(tripId, 1, randomUUID(), "j9-inconnue"))).toEqual({ code: "not_found" });
    expect(erreur(await options(tripId, JARDIN, contexte(b)))).toEqual({ code: "not_found" });
    expect(erreur(await apercu(tripId, 1, JARDIN, POINT_J4, contexte(b)))).toEqual({ code: "not_found" });
    expect(erreur(await deplacer(tripId, 1, randomUUID(), JARDIN, POINT_J4, contexte(b)))).toEqual({ code: "not_found" });
    expect(erreur(await deplacer(tripId, 1, randomUUID(), JARDIN, POINT_J4, null))).toEqual({ code: "unauthenticated" });
    expect(
      erreur(await appliquerDeplacement(dependances(contexte(a)), { tripId, requestId: randomUUID(), stopId: JARDIN, pointId: POINT_J4, baseVersion: 1, organizationId: b.org })),
    ).toMatchObject({ code: "validation_failed" });
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it(`deplacer : ${VERSIONS_MAX_PAR_VOYAGE} versions atteintes, validation_failed sur baseVersion, sans écriture`, async () => {
    const tripId = await nouveauVoyage();
    const [v1] = await versions(a, tripId);
    await inTx(app, { org: a.org, user: a.owner }, async (c) => {
      await c.query(
        "INSERT INTO trip_versions (organization_id, trip_id, version, parent_version, request_id, snapshot, author_kind) VALUES ($1, $2, $3, 1, $4, $5, 'engine')",
        [a.org, tripId, VERSIONS_MAX_PAR_VOYAGE, randomUUID(), JSON.stringify(v1?.snapshot)],
      );
      await c.query("UPDATE trips SET current_version = $3 WHERE organization_id = $1 AND id = $2", [a.org, tripId, VERSIONS_MAX_PAR_VOYAGE]);
    });
    expect(erreur(await deplacer(tripId, VERSIONS_MAX_PAR_VOYAGE))).toEqual({ code: "validation_failed", field: "baseVersion" });
    expect(await versions(a, tripId)).toHaveLength(2);
  });

  it("deplacer: « Annuler » du toast : un retour à la version de base (M5b) rétablit le programme d'avant", async () => {
    const tripId = await nouveauVoyage();
    const base = instantane((await versions(a, tripId))[0]);
    valeur(await deplacer(tripId, 1));
    const retour = valeur(await appliquerRetour(dependances(contexte(a)), { tripId, requestId: randomUUID(), baseVersion: 2, toVersion: 1 }));
    expect(retour.version).toBe(3);
    expect(instantane((await versions(a, tripId))[2])).toEqual(base);
  });
});
