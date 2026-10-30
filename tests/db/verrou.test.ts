import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApiTripAdapter } from "@/adapters/api";
import type { AdapterContext, RevisionAdapter, TripAdapter } from "@/adapters/types";
import { ok, PatchResultSchema, TripPatchSchema, TripSnapshotSchema, type PatchResult, type ReplacementOffer, type Result, type StopSnapshot, type TripSnapshot } from "@/contracts";
import { creerRelecturesVoyages, type DoubleRelectures } from "@/mocks/relectures-voyages";
import { VERSIONS_MAX_PAR_VOYAGE } from "@/server/config/retouches";
import { basculerVerrou, type DependancesRetouche } from "@/server/versions/retouches";
import { creerWithOrg } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { convertirVoyagesSimules, ecrireVoyage, type DonneesVoyage } from "../support/voyages-en-base";
import { closeAll, connect, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * Verrou sur l'adaptateur `api` (tâche M5a, ticket 919 ; spécification M5 § 3, critères 1 à 5 ; décision 0147 § 8 et § 9),
 * sur la base réelle : cas d'usage `basculerVerrou` de `src/server/versions/retouches.ts` sous `vadrouille_app` avec le
 * `withOrg` réel. Le débit `retouche` (limiteur, en-têtes de la requête) est injecté et toujours admis : il est éprouvé par
 * les tests du limiteur. Voyage d'Édimbourg du jeu simulé, débloqué par une ligne `tripUnlocked` (écrite sous
 * `vadrouille_webhook` par le support), avec les candidats de ses propositions (critère 2 : remplacement M1g).
 * Aucune donnée Google : `placeId` sentinelles et noms entre crochets ; le port de relectures est le double, compté.
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

const donnees = (debloque: boolean): DonneesVoyage => {
  const converti = convertirVoyagesSimules().find((v) => v.mockId === EDIMBOURG);
  if (!converti) throw new Error(`voyage simulé absent : ${EDIMBOURG}`);
  const { entitlements } = converti.donnees;
  return { ...converti.donnees, entitlements: debloque ? [...entitlements.filter((k) => k !== "tripUnlocked"), "tripUnlocked"] : entitlements.filter((k) => k !== "tripUnlocked") };
};
const nouveauVoyage = (debloque = true, org: Org = a) => ecrireVoyage(app, org, donnees(debloque), undefined, { candidats: true });

const dependances = (ctx: AdapterContext | null): DependancesRetouche => ({ contexte: async () => ctx, withOrg, limiteur: async () => ok(undefined) });
const verrouiller = (tripId: string, stopId: string, baseVersion: number, requestId: string = randomUUID(), ctx: AdapterContext | null = contexte(a)) =>
  basculerVerrou(dependances(ctx), "lock", { tripId, requestId, stopId, baseVersion });
const deverrouiller = (tripId: string, stopId: string, baseVersion: number, requestId: string = randomUUID(), ctx: AdapterContext | null = contexte(a)) =>
  basculerVerrou(dependances(ctx), "unlock", { tripId, requestId, stopId, baseVersion });

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
const instantane = (ligne: Ligne | undefined): TripSnapshot => TripSnapshotSchema.parse(ligne?.snapshot);
const etapes = (s: TripSnapshot): { jour: number; stop: StopSnapshot }[] =>
  s.days.flatMap((jour) => jour.items.flatMap((item) => (item.type === "stop" ? [{ jour: jour.index, stop: item.stop }] : [])));
const etape = (s: TripSnapshot, id: string) => etapes(s).find((e) => e.stop.id === id);
const avecVerrou = (s: TripSnapshot, id: string, locked: boolean): TripSnapshot => ({
  days: s.days.map((jour) => ({ ...jour, items: jour.items.map((item) => (item.type === "stop" && item.stop.id === id ? { ...item, stop: { ...item.stop, locked } } : item)) })),
});

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

describe("verrou sur api (M5a, ticket 919)", () => {
  it("verrou: verrouiller écrit une version (auteur user, patch [lock]), relue verrouillée ; aucune relecture du port ; rejeu idempotent", async () => {
    const tripId = await nouveauVoyage();
    const [v1] = await versions(a, tripId);
    const base = instantane(v1);
    expect(etape(base, "j1-chateau")?.stop.locked).toBe(false);
    const appelsAvant = relectures.appels();
    const requestId = randomUUID();

    const resultat: PatchResult = valeur(await verrouiller(tripId, "j1-chateau", 1, requestId));
    expect(PatchResultSchema.parse(resultat)).toEqual(resultat);
    expect(resultat.version).toBe(2);
    expect(resultat.touchedDays).toEqual([1]);
    expect(resultat.changes).toContainEqual({ type: "locked", label: etape(base, "j1-chateau")?.stop.name, time: etape(base, "j1-chateau")?.stop.start });
    // Verrou seul (0147 § 9) : aucun appel du port de relectures, donc aucun appel Google ni Routes.
    expect(relectures.appels()).toBe(appelsAvant);

    const lignes = await versions(a, tripId);
    expect(lignes).toHaveLength(2);
    expect(lignes[1]).toMatchObject({ version: 2, parent_version: 1, author_kind: "user", author_user_id: a.owner });
    expect(TripPatchSchema.parse(lignes[1]?.patch)).toEqual({ requestId, baseVersion: 1, operations: [{ op: "lock", stopId: "j1-chateau" }] });
    // Instantané égal à la base hors `locked` (rien ne bouge).
    expect(instantane(lignes[1])).toEqual(avecVerrou(base, "j1-chateau", true));

    // Après « rechargement » : la lecture sert l'étape verrouillée.
    const jour = await adaptateur.getDay(contexte(a), tripId, 1);
    const lue = jour?.items.flatMap((item) => (item.type === "stop" && item.stop.id === "j1-chateau" ? [item.stop] : []))[0];
    expect(lue?.locked).toBe(true);

    // Rejeu de la même demande : même réponse, aucune version de plus.
    expect(valeur(await verrouiller(tripId, "j1-chateau", 1, requestId))).toEqual(resultat);
    expect(await versions(a, tripId)).toHaveLength(2);

    // Déverrouiller : version 3, patch [unlock], base rétablie (la lecture ci-dessus a appelé le port : compte repris).
    const appelsApresLecture = relectures.appels();
    const retire = valeur(await deverrouiller(tripId, "j1-chateau", 2));
    expect(retire.version).toBe(3);
    expect(retire.changes).toContainEqual(expect.objectContaining({ type: "unlocked" }));
    const v3 = (await versions(a, tripId))[2];
    expect(TripPatchSchema.parse(v3?.patch).operations).toEqual([{ op: "unlock", stopId: "j1-chateau" }]);
    expect(instantane(v3)).toEqual(base);
    expect(relectures.appels()).toBe(appelsApresLecture);
    // Le rejeu d'un autre geste sous le même requestId n'est pas confondu : conflit, rien d'écrit.
    expect(erreur(await deverrouiller(tripId, "j1-chateau", 3, requestId))).toEqual({ code: "version_conflict", retryable: true, currentVersion: 3 });
    expect(await versions(a, tripId)).toHaveLength(3);
  });

  it("verrou: refusé avant le déblocage : not_unlocked (retryable faux), sans écriture", async () => {
    const tripId = await nouveauVoyage(false);
    expect(erreur(await verrouiller(tripId, "j1-chateau", 1))).toEqual({ code: "not_unlocked", retryable: false });
    expect(erreur(await deverrouiller(tripId, "j1-tattoo", 1))).toEqual({ code: "not_unlocked", retryable: false });
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it("verrou: un engagement ne se déverrouille pas : validation_failed sur stopId, sans écriture", async () => {
    const tripId = await nouveauVoyage();
    const base = instantane((await versions(a, tripId))[0]);
    expect(etape(base, "j1-tattoo")?.stop).toMatchObject({ locked: true, commitment: "ticket" });
    expect(erreur(await deverrouiller(tripId, "j1-tattoo", 1))).toEqual({ code: "validation_failed", field: "stopId" });
    // Un événement de `Day.events` non plus.
    const evenement = base.days.flatMap((jour) => jour.events)[0];
    if (evenement !== undefined) expect(erreur(await verrouiller(tripId, evenement.id, 1))).toEqual({ code: "validation_failed", field: "stopId" });
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it("verrou: conflit de version : baseVersion dépassée, version_conflict avec currentVersion, sans écriture", async () => {
    const tripId = await nouveauVoyage();
    valeur(await verrouiller(tripId, "j1-chateau", 1));
    expect(erreur(await verrouiller(tripId, "j1-diner", 1))).toEqual({ code: "version_conflict", retryable: true, currentVersion: 2 });
    expect(await versions(a, tripId)).toHaveLength(2);
  });

  it("verrou : étape inconnue not_found ; verrou sans effet validation_failed ; autre organisation et sans session refusés", async () => {
    const tripId = await nouveauVoyage();
    expect(erreur(await verrouiller(tripId, "j9-inconnue", 1))).toEqual({ code: "not_found" });
    expect(erreur(await deverrouiller(tripId, "j1-chateau", 1))).toEqual({ code: "validation_failed", field: "stopId" });
    expect(erreur(await verrouiller(tripId, "j1-chateau", 1, randomUUID(), contexte(b)))).toEqual({ code: "not_found" });
    expect(erreur(await verrouiller(tripId, "j1-chateau", 1, randomUUID(), null))).toEqual({ code: "unauthenticated" });
    expect(erreur(await basculerVerrou(dependances(contexte(a)), "lock", { tripId, requestId: randomUUID(), stopId: "j1-chateau", baseVersion: 1, organizationId: b.org }))).toMatchObject({
      code: "validation_failed",
    });
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it(`verrou : ${VERSIONS_MAX_PAR_VOYAGE} versions atteintes, validation_failed sur baseVersion, sans écriture (0147 § 5.3 point 7)`, async () => {
    const tripId = await nouveauVoyage();
    const [v1] = await versions(a, tripId);
    // Une version du moteur numérotée à la borne (les versions des workflows ne sont jamais refusées par elle).
    await inTx(app, { org: a.org, user: a.owner }, async (c) => {
      await c.query(
        "INSERT INTO trip_versions (organization_id, trip_id, version, parent_version, request_id, snapshot, author_kind) VALUES ($1, $2, $3, 1, $4, $5, 'engine')",
        [a.org, tripId, VERSIONS_MAX_PAR_VOYAGE, randomUUID(), JSON.stringify(v1?.snapshot)],
      );
      await c.query("UPDATE trips SET current_version = $3 WHERE organization_id = $1 AND id = $2", [a.org, tripId, VERSIONS_MAX_PAR_VOYAGE]);
    });
    expect(erreur(await verrouiller(tripId, "j1-chateau", VERSIONS_MAX_PAR_VOYAGE))).toEqual({ code: "validation_failed", field: "baseVersion" });
    expect(await versions(a, tripId)).toHaveLength(2);
  });

  it("verrou: une étape verrouillée survit à toute écriture : le remplacement (M1g) garde nom, jour, heures et placeId ; la remplacer est refusé", async () => {
    const tripId = await nouveauVoyage();
    valeur(await verrouiller(tripId, "j1-dejeuner", 1));
    const avant = etape(instantane((await versions(a, tripId))[1]), "j1-dejeuner");
    expect(avant?.stop.locked).toBe(true);
    // Remplacer l'étape verrouillée : refusé, sans version.
    expect(valeur(await revision.previewReplacement(contexte(a), { tripId, stopId: "j1-dejeuner", reason: "notMyStyle", baseVersion: 2 }))).toEqual({ status: "lockedStop" });
    // Remplacer une autre étape du même jour : le moteur replanifie le J1, l'étape verrouillée ne change pas (R3).
    const offre: ReplacementOffer = valeur(await revision.previewReplacement(contexte(a), { tripId, stopId: "j1-diner", reason: "notMyStyle", baseVersion: 2 }));
    if (offre.status !== "offer") throw new Error(`aucune offre : ${offre.status}`);
    expect(valeur(await revision.applyReplacement(contexte(a), { tripId, requestId: randomUUID(), stopId: "j1-diner", candidateId: offre.candidateId, baseVersion: 2 }))).toEqual({
      status: "applied",
      version: 3,
    });
    const apres = etape(instantane((await versions(a, tripId))[2]), "j1-dejeuner");
    // Nom, jour, heures et `placeId` (définition de B5-PO-11) : identiques, verrou compris.
    expect(apres).toEqual(avant);
    expect(await versions(a, tripId)).toHaveLength(3);
  });
});
