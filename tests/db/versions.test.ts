import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createApiTripAdapter } from "@/adapters/api";
import type { AdapterContext, TripVersionsAdapter } from "@/adapters/types";
import { ok, RevertPreviewSchema, TripPatchSchema, TripSnapshotSchema, TripVersionPageSchema, type Result, type StopSnapshot, type TripSnapshot } from "@/contracts";
import { creerRelecturesVoyages, type DoubleRelectures } from "@/mocks/relectures-voyages";
import { appliquerRetour, listerVersions, proposerRetour } from "@/server/versions/historique";
import { basculerVerrou, type DependancesRetouche } from "@/server/versions/retouches";
import { creerWithOrg } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { convertirVoyagesSimules, ecrireVoyage, type DonneesVoyage } from "../support/voyages-en-base";
import { closeAll, connect, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * Versions du programme et retour à une version sur l'adaptateur `api` (tâche M5b, ticket 934 ; spécification M5 § 4,
 * critères 6 à 11 ; décision 0147 § 5.3 et § 8), sur la base réelle : cas d'usage de `src/server/versions/historique.ts`
 * sous `vadrouille_app` avec le `withOrg` réel. Le débit `retouche` (limiteur, en-têtes de la requête) est injecté et
 * toujours admis : il est éprouvé par les tests du limiteur. Voyage d'Édimbourg du jeu simulé, débloqué par une ligne
 * `tripUnlocked` écrite sous `vadrouille_webhook` par le support. Les retouches sont écrites par le vrai verrou (M5a).
 * Aucune donnée Google : `placeId` sentinelles et noms du jeu simulé ; le port de relectures est le double, compté.
 */

const db = createDatabase("vadrouille_app");
const withOrg = creerWithOrg(db);
let app: DbClient;
let auth: DbClient;
let a: Org;
let b: Org;
let relectures: DoubleRelectures;
let adaptateur: TripVersionsAdapter;

// Passage par l'adaptateur `api` (qui n'injecte pas le limiteur) : en-têtes vides et débit `retouche` toujours admis,
// comme pour les cas d'usage appelés directement (le limiteur est éprouvé par `tests/db/limiteur.test.ts`).
const debitsRetouche = vi.hoisted(() => ({ n: 0 }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/rate-limit", () => ({
  checkRateLimit: async () => {
    debitsRetouche.n += 1;
    return { ok: true, value: undefined };
  },
}));

const contexte = (org: Org): AdapterContext => ({ organizationId: org.org, userId: org.owner, role: "owner" });
const EDIMBOURG = "mock_trip_edimbourg";

const donnees = (debloque: boolean): DonneesVoyage => {
  const converti = convertirVoyagesSimules().find((v) => v.mockId === EDIMBOURG);
  if (!converti) throw new Error(`voyage simulé absent : ${EDIMBOURG}`);
  const { entitlements } = converti.donnees;
  return { ...converti.donnees, entitlements: debloque ? [...entitlements.filter((k) => k !== "tripUnlocked"), "tripUnlocked"] : entitlements.filter((k) => k !== "tripUnlocked") };
};
const nouveauVoyage = (debloque = true, org: Org = a) => ecrireVoyage(app, org, donnees(debloque));

const dependances = (ctx: AdapterContext | null = contexte(a)): DependancesRetouche => ({ contexte: async () => ctx, withOrg, limiteur: async () => ok(undefined) });
const verrouiller = (tripId: string, op: "lock" | "unlock", stopId: string, baseVersion: number) =>
  basculerVerrou(dependances(), op, { tripId, requestId: randomUUID(), stopId, baseVersion });
const lister = (tripId: string, before?: number, ctx: AdapterContext | null = contexte(a)) => listerVersions(dependances(ctx), { tripId, ...(before === undefined ? {} : { before }) });
const apercu = (tripId: string, baseVersion: number, toVersion: number, ctx: AdapterContext | null = contexte(a)) => proposerRetour(dependances(ctx), { tripId, baseVersion, toVersion });
const retour = (tripId: string, baseVersion: number, toVersion: number, requestId: string = randomUUID()) => appliquerRetour(dependances(), { tripId, requestId, baseVersion, toVersion });

type Ligne = Record<string, unknown>;
const versions = (org: Org, tripId: string): Promise<Ligne[]> =>
  inTx(app, { org: org.org, user: org.owner }, async (c) =>
    (
      await c.query(
        "SELECT version, parent_version, author_kind, author_user_id, snapshot, patch, created_at FROM trip_versions WHERE organization_id = $1 AND trip_id = $2 ORDER BY version",
        [org.org, tripId],
      )
    ).rows,
  );
const instantane = (ligne: Ligne | undefined): TripSnapshot => TripSnapshotSchema.parse(ligne?.snapshot);
const etape = (s: TripSnapshot, id: string): StopSnapshot | undefined =>
  s.days.flatMap((jour) => jour.items.flatMap((item) => (item.type === "stop" && item.stop.id === id ? [item.stop] : [])))[0];

const valeur = <T>(resultat: Result<T>): T => {
  if (!resultat.ok) throw new Error(`refus inattendu : ${JSON.stringify(resultat.error)}`);
  return resultat.value;
};
const erreur = <T>(resultat: Result<T>) => (resultat.ok ? null : resultat.error);

/** Trois retouches de la personne : château verrouillé (v2), verrou retiré (v3), dîner verrouillé (v4). */
async function troisRetouches(tripId: string): Promise<void> {
  valeur(await verrouiller(tripId, "lock", "j1-chateau", 1));
  valeur(await verrouiller(tripId, "unlock", "j1-chateau", 2));
  valeur(await verrouiller(tripId, "lock", "j1-diner", 3));
}

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  a = await createOrg(auth);
  b = await createOrg(auth);
  relectures = creerRelecturesVoyages();
  const versionsApi = createApiTripAdapter({ relectures, withOrg }).versions;
  if (versionsApi === undefined) throw new Error("versions absentes de l'adaptateur api");
  adaptateur = versionsApi;
});

afterAll(closeAll);

describe("versions sur api (M5b, ticket 934)", () => {
  it("versions: liste de la plus récente à la plus ancienne, « Version actuelle » sur la première, noms tirés du programme", async () => {
    const tripId = await nouveauVoyage();
    await troisRetouches(tripId);
    const v1 = instantane((await versions(a, tripId))[0]);
    const page = valeur(await lister(tripId));
    expect(TripVersionPageSchema.parse(page)).toEqual(page);
    expect(page.nextBefore).toBeNull();
    expect(page.items.map((item) => [item.version, item.kind, item.subject ?? null, item.current, item.revertible])).toEqual([
      [4, "locked", etape(v1, "j1-diner")?.name, true, false],
      [3, "unlocked", etape(v1, "j1-chateau")?.name, false, true],
      [2, "locked", etape(v1, "j1-chateau")?.name, false, true],
      [1, "prepared", null, false, true],
    ]);
    // Aucun instantané ni aucune journée dans la réponse : métadonnées et noms seulement.
    expect(JSON.stringify(page)).not.toContain("\"days\"");
    // Par l'adaptateur `api` (même réponse, validée par le contrat).
    const debitsAvant = debitsRetouche.n;
    expect(valeur(await adaptateur.listTripVersions(contexte(a), { tripId }))).toEqual(page);
    expect(debitsRetouche.n).toBe(debitsAvant + 1);
  });

  it("versions: revenir crée une version identique ; l'aperçu ne contient jamais replaced ni segment ; rejeu idempotent", async () => {
    const tripId = await nouveauVoyage();
    await troisRetouches(tripId);
    const avant = await versions(a, tripId);
    const appels = relectures.appels();

    const preview = valeur(await apercu(tripId, 4, 2));
    expect(RevertPreviewSchema.parse(preview)).toEqual(preview);
    expect(preview).toMatchObject({ baseVersion: 4, toVersion: 2, currentHasLockedStop: true });
    const sortes = preview.changes.map((change) => change.type);
    expect(sortes).not.toContain("replaced");
    expect(sortes).not.toContain("segment");
    const v1 = instantane(avant[0]);
    expect(preview.changes).toContainEqual({ type: "locked", label: etape(v1, "j1-chateau")?.name, time: etape(v1, "j1-chateau")?.start });
    expect(preview.changes).toContainEqual({ type: "unlocked", label: etape(v1, "j1-diner")?.name, time: etape(v1, "j1-diner")?.start });
    // L'aperçu n'écrit rien.
    expect(await versions(a, tripId)).toHaveLength(4);

    const requestId = randomUUID();
    const ecrite = valeur(await retour(tripId, 4, 2, requestId));
    expect(ecrite.version).toBe(5);
    const apres = await versions(a, tripId);
    expect(apres).toHaveLength(5);
    expect(apres[4]).toMatchObject({ version: 5, parent_version: 4, author_kind: "user", author_user_id: a.owner });
    expect(TripPatchSchema.parse(apres[4]?.patch)).toEqual({ requestId, baseVersion: 4, operations: [{ op: "revert", toVersion: 2 }] });
    // Copie identique de la version choisie (critère 7) ; aucune version n'est modifiée ni supprimée.
    expect(instantane(apres[4])).toEqual(instantane(avant[1]));
    expect(apres.slice(0, 4)).toEqual(avant);
    // Aucun appel du port de relectures (aucun appel Google ni Routes) pour l'aperçu ni le retour.
    expect(relectures.appels()).toBe(appels);

    // Rejeu : même réponse, aucune version de plus ; même requestId vers une autre version : conflit, rien d'écrit.
    expect(valeur(await retour(tripId, 4, 2, requestId))).toEqual(ecrite);
    expect(erreur(await retour(tripId, 4, 3, requestId))).toEqual({ code: "version_conflict", retryable: true, currentVersion: 5 });
    expect(await versions(a, tripId)).toHaveLength(5);

    // La liste montre le retour, avec la date de la version visée.
    const premiere = valeur(await lister(tripId)).items[0];
    expect(premiere).toMatchObject({ version: 5, kind: "reverted", current: true, revertedTo: { version: 2 } });
  });

  it("versions: le retour est la seule exception au verrou : une étape verrouillée aujourd'hui est rétablie telle quelle ; sans étape verrouillée, la phrase est absente", async () => {
    const tripId = await nouveauVoyage();
    await troisRetouches(tripId);
    // v4 : dîner verrouillé ; v1 : dîner déverrouillé. Le retour vers v1 retire le verrou du dîner.
    valeur(await retour(tripId, 4, 1));
    expect(etape(instantane((await versions(a, tripId))[4]), "j1-diner")?.locked).toBe(false);

    // Voyage sans étape verrouillée (engagements retirés du jeu) : currentHasLockedStop faux.
    const sansVerrou: DonneesVoyage = { ...donnees(true) };
    const autre = await ecrireVoyage(app, a, sansVerrou);
    const base = instantane((await versions(a, autre))[0]);
    const verrouillees = base.days.flatMap((jour) => jour.items.flatMap((item) => (item.type === "stop" && item.stop.locked ? [item.stop.id] : [])));
    valeur(await verrouiller(autre, "lock", "j1-chateau", 1));
    valeur(await verrouiller(autre, "unlock", "j1-chateau", 2));
    expect(valeur(await apercu(autre, 3, 2)).currentHasLockedStop).toBe(verrouillees.length > 0);
  });

  it("versions: annuler le retour : un retour ordinaire vers la version d'avant, copie identique", async () => {
    const tripId = await nouveauVoyage();
    await troisRetouches(tripId);
    valeur(await retour(tripId, 4, 2));
    const annule = valeur(await retour(tripId, 5, 4));
    expect(annule.version).toBe(6);
    const lignes = await versions(a, tripId);
    expect(instantane(lignes[5])).toEqual(instantane(lignes[3]));
    expect(TripPatchSchema.parse(lignes[5]?.patch).operations).toEqual([{ op: "revert", toVersion: 4 }]);
  });

  it("versions: pas de retour avant le déblocage : listées sans retour, refusées côté serveur (validation_failed sur toVersion)", async () => {
    const tripId = await nouveauVoyage(false);
    const [v1] = await versions(a, tripId);
    // Version 2 du moteur avant le déblocage, puis le droit (transaction suivante, instant plus tardif), puis un verrou.
    await inTx(app, { org: a.org, user: a.owner }, async (c) => {
      await c.query("INSERT INTO trip_versions (organization_id, trip_id, version, parent_version, request_id, snapshot, author_kind) VALUES ($1, $2, 2, 1, $3, $4, 'engine')", [
        a.org,
        tripId,
        randomUUID(),
        JSON.stringify(v1?.snapshot),
      ]);
      await c.query("UPDATE trips SET current_version = 2 WHERE organization_id = $1 AND id = $2", [a.org, tripId]);
    });
    await inTx(app, { org: a.org, user: a.owner }, async (c) => {
      await c.query("SET LOCAL ROLE vadrouille_webhook");
      await c.query("INSERT INTO entitlements (organization_id, trip_id, kind) VALUES ($1, $2, 'tripUnlocked')", [a.org, tripId]);
    });
    valeur(await verrouiller(tripId, "lock", "j1-chateau", 2));
    valeur(await verrouiller(tripId, "unlock", "j1-chateau", 3));

    const page = valeur(await lister(tripId));
    expect(page.items.map((item) => [item.version, item.current, item.revertible])).toEqual([
      [4, true, false],
      [3, false, true],
      [2, false, false],
      [1, false, false],
    ]);
    expect(erreur(await apercu(tripId, 4, 2))).toEqual({ code: "validation_failed", field: "toVersion" });
    expect(erreur(await retour(tripId, 4, 1))).toEqual({ code: "validation_failed", field: "toVersion" });
    // La version courante ni une version à venir ne sont des cibles.
    expect(erreur(await retour(tripId, 4, 4))).toEqual({ code: "validation_failed", field: "toVersion" });
    expect(await versions(a, tripId)).toHaveLength(4);
    // Version proposée : admise.
    expect(valeur(await retour(tripId, 4, 3)).version).toBe(5);
  });

  it("versions: voyage non débloqué : not_unlocked pour la liste, l'aperçu et le retour, sans écriture", async () => {
    const tripId = await nouveauVoyage(false);
    expect(erreur(await lister(tripId))).toEqual({ code: "not_unlocked", retryable: false });
    expect(erreur(await apercu(tripId, 1, 1))).toEqual({ code: "not_unlocked", retryable: false });
    expect(erreur(await retour(tripId, 2, 1))).toEqual({ code: "not_unlocked", retryable: false });
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it("versions: conflit de version, autre organisation et sans session refusés, sans écriture", async () => {
    const tripId = await nouveauVoyage();
    await troisRetouches(tripId);
    expect(erreur(await apercu(tripId, 3, 2))).toEqual({ code: "version_conflict", retryable: true, currentVersion: 4 });
    expect(erreur(await retour(tripId, 3, 2))).toEqual({ code: "version_conflict", retryable: true, currentVersion: 4 });
    expect(erreur(await lister(tripId, undefined, contexte(b)))).toEqual({ code: "not_found" });
    expect(erreur(await apercu(tripId, 4, 2, contexte(b)))).toEqual({ code: "not_found" });
    expect(erreur(await lister(tripId, undefined, null))).toEqual({ code: "unauthenticated" });
    expect(await versions(a, tripId)).toHaveLength(4);
  });

  it("versions: pages de 20, before exclusif, nextBefore nul en fin de liste", async () => {
    const tripId = await nouveauVoyage();
    const [v1] = await versions(a, tripId);
    await inTx(app, { org: a.org, user: a.owner }, async (c) => {
      for (let version = 2; version <= 22; version += 1) {
        await c.query("INSERT INTO trip_versions (organization_id, trip_id, version, parent_version, request_id, snapshot, author_kind) VALUES ($1, $2, $3, $4, $5, $6, 'engine')", [
          a.org,
          tripId,
          version,
          version - 1,
          randomUUID(),
          JSON.stringify(v1?.snapshot),
        ]);
      }
      await c.query("UPDATE trips SET current_version = 22 WHERE organization_id = $1 AND id = $2", [a.org, tripId]);
    });
    const premiere = valeur(await lister(tripId));
    expect(premiere.items.map((item) => item.version)).toEqual(Array.from({ length: 20 }, (_, i) => 22 - i));
    expect(premiere.nextBefore).toBe(3);
    const seconde = valeur(await lister(tripId, 3));
    expect(seconde.items.map((item) => item.version)).toEqual([2, 1]);
    expect(seconde.nextBefore).toBeNull();
  });
});
