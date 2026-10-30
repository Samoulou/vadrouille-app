import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApiTripAdapter } from "@/adapters/api";
import type { AdapterContext, RevisionAdapter, TripAdapter } from "@/adapters/types";
import { MoveDraftSchema, MoveOptionsSchema, ok, PatchResultSchema, TripPatchSchema, TripSnapshotSchema, type Result, type StopSnapshot, type TripSnapshot } from "@/contracts";
import { etapesVerrouilleesModifiees } from "@/domain/verrous";
import { INCONNU, memePoint, type SourceRelectures } from "@/domain/relectures";
import { creerRelecturesVoyages, type DoubleRelectures } from "@/mocks/relectures-voyages";
import { VERSIONS_MAX_PAR_VOYAGE } from "@/server/config/retouches";
import { appliquerPatch } from "@/domain/patch";
import { appliquerDeplacement, demandeDuDeplacement, optionsDeDeplacement, proposerDeplacement, type DependancesDeplacement } from "@/server/versions/deplacement";
import { contexteVoyage, entreeMoteurDeRevision } from "@/server/versions/remplacement";
import { relireRevision } from "@/server/voyages/lecture";
import { appliquerRetour } from "@/server/versions/historique";
import { basculerVerrou } from "@/server/versions/retouches";
import { creerWithOrg } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { convertirVoyagesSimules, ecrireVoyage, type DonneesVoyage } from "../support/voyages-en-base";
import { closeAll, connect, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * « Déplacer une étape » sur l'adaptateur `api` (ticket 947 ; spécification M5 § 3 et § 14 ; décision 0147 § 4, § 8 et § 11 ;
 * décision 0153, PR en cours : le moteur applique le patch `[move]` avec une relecture), sur la base réelle : cas d'usage de
 * `src/server/versions/deplacement.ts` sous `vadrouille_app` avec le `withOrg` réel. Le débit `retouche` est injecté et
 * toujours admis (éprouvé par les tests du limiteur). Voyage d'Édimbourg du jeu simulé, débloqué par une ligne `tripUnlocked`.
 *
 * Aucune donnée Google : `placeId` simulés et noms entre crochets. Le port de relectures est le double des voyages simulés,
 * compté ; il ne connaît que les trajets du jeu : pour un trajet **demandé** qu'il ne connaît pas (le jardin botanique entre
 * ses nouveaux voisins), il répond comme le vrai port, 10 minutes (même enveloppe que `tests/db/lieu-a-soi.test.ts`). Un
 * trajet non demandé reste inconnu. Aucun appel Google ni Routes.
 */

const db = createDatabase("vadrouille_app");
const withOrg = creerWithOrg(db);
let app: DbClient;
let auth: DbClient;
let a: Org;
let b: Org;
let admin: DbClient;
let double: DoubleRelectures;
let relectures: SourceRelectures;
let adaptateur: TripAdapter;
let revision: RevisionAdapter;

const contexte = (org: Org): AdapterContext => ({ organizationId: org.org, userId: org.owner, role: "owner" });
const EDIMBOURG = "mock_trip_edimbourg";
const JARDIN = "j2-jardin-botanique";
const POINT_J4 = "deplacer-j4-1550";

const donnees = (debloque: boolean): DonneesVoyage => {
  const converti = convertirVoyagesSimules().find((v) => v.mockId === EDIMBOURG);
  if (!converti) throw new Error(`voyage simulé absent : ${EDIMBOURG}`);
  const { entitlements } = converti.donnees;
  return { ...converti.donnees, entitlements: debloque ? [...entitlements.filter((k) => k !== "tripUnlocked"), "tripUnlocked"] : entitlements.filter((k) => k !== "tripUnlocked") };
};
const nouveauVoyage = (debloque = true, org: Org = a) => ecrireVoyage(app, org, donnees(debloque), undefined, { candidats: true });

const dependances = (ctx: AdapterContext | null): DependancesDeplacement => ({ contexte: async () => ctx, withOrg, limiteur: async () => ok(undefined), relectures });
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
  admin = await connect("admin");
  double = creerRelecturesVoyages();
  relectures = {
    async pour(voyage, demande) {
      const issue = await double.pour(voyage, demande);
      if (!issue.ok) return issue;
      const base = issue.relectures;
      return {
        ok: true as const,
        relectures: {
          validite: (placeId) => base.validite(placeId),
          plages: (placeId, date) => base.plages(placeId, date),
          duree(depuis, vers, mode) {
            const lue = base.duree(depuis, vers, mode);
            if (lue !== INCONNU) return lue;
            const demandee = demande.trajets.some((t) => memePoint(t.depuis, depuis) && memePoint(t.vers, vers) && t.modes.includes(mode));
            return demandee ? { minutes: 10, estimee: false } : INCONNU;
          },
        },
      };
    },
  };
  adaptateur = createApiTripAdapter({ relectures, withOrg });
  if (adaptateur.revision === undefined) throw new Error("révision absente de l'adaptateur api");
  revision = adaptateur.revision;
});

afterAll(closeAll);

describe("déplacer une étape sur api (ticket 947)", () => {
  it("deplacer: points, aperçu puis application par le moteur : version 2 (auteur user, patch [move]), un appel du port par aperçu et par application ; rejeu idempotent", async () => {
    const tripId = await nouveauVoyage();
    const base = instantane((await versions(a, tripId))[0]);

    // Points par l'adaptateur (même chemin que l'action serveur), sans relecture : J4 vers 15:50, aucun point dans les temps
    // libres voisins du jardin.
    const appelsAvant = double.appels();
    const lus = MoveOptionsSchema.parse(valeur(await revision.getMoveOptions(contexte(a), { tripId, stopId: JARDIN })));
    expect(double.appels()).toBe(appelsAvant);
    expect(lus.days.map((jour) => jour.index)).toEqual(base.days.map((jour) => jour.index));
    expect(lus.days.find((jour) => jour.index === 4)?.points).toContainEqual({ id: POINT_J4, time: "15:50" });
    expect(lus.days.find((jour) => jour.index === 2)?.points).toEqual([]);

    // Aperçu par le cas d'usage, débit injecté (l'adaptateur prend le limiteur des en-têtes de la requête) : un appel du port ;
    // jours touchés recomposés avec les durées relues ; « Ce qui change » du moteur.
    const brouillon = MoveDraftSchema.parse(valeur(await apercu(tripId, 1)));
    expect(double.appels()).toBe(appelsAvant + 1);
    expect(brouillon.days.map((jour) => jour.index)).toEqual([2, 4]);
    expect(brouillon.targetStopId).toBe(JARDIN);
    expect(brouillon.changedStopIds[0]).toBe(JARDIN);
    expect(brouillon.changes[0]).toEqual({ type: "moved", label: expect.any(String), before: { day: 2, time: "13:25" }, after: { day: 4, time: "15:50" } });
    const segments = brouillon.days.flatMap((jour) => jour.items.flatMap((item) => (item.type === "segment" ? [item.segment] : [])));
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.every((segment) => typeof segment.minutes === "number")).toBe(true);
    expect(await versions(a, tripId)).toHaveLength(1);

    const lignesAvant = await lignesAFaire(a, tripId);
    const requestId = randomUUID();
    // Application par le cas d'usage, débit injecté (l'adaptateur prend le limiteur des en-têtes de la requête).
    const resultat = PatchResultSchema.parse(valeur(await deplacer(tripId, 1, requestId)));
    expect(double.appels()).toBe(appelsAvant + 2);
    expect(resultat).toMatchObject({ version: 2, touchedDays: [2, 4] });
    expect(resultat.changes).toEqual(brouillon.changes);

    const lignes = await versions(a, tripId);
    expect(lignes).toHaveLength(2);
    expect(lignes[1]).toMatchObject({ version: 2, parent_version: 1, author_kind: "user", author_user_id: a.owner });
    const patch = TripPatchSchema.parse(lignes[1]?.patch);
    expect(patch).toEqual({ requestId, baseVersion: 1, operations: [{ op: "move", stopId: JARDIN, day: 4, time: "15:50" }] });
    const apres = instantane(lignes[1]);
    expect(etape(apres, JARDIN)).toMatchObject({ jour: 4, stop: { start: "15:50", locked: false } });
    // Les jours non touchés ne changent pas.
    for (const jour of base.days) if (![2, 4].includes(jour.index)) expect(apres.days.find((j) => j.index === jour.index)).toEqual(jour);
    // Lecture suivante (« rechargement ») : le jardin est servi au J4, plus au J2.
    const j4 = await adaptateur.getDay(contexte(a), tripId, 4);
    expect(j4?.items.some((item) => item.type === "stop" && item.stop.id === JARDIN && item.stop.start === "15:50")).toBe(true);
    const j2 = await adaptateur.getDay(contexte(a), tripId, 2);
    expect(j2?.items.some((item) => item.type === "stop" && item.stop.id === JARDIN)).toBe(false);
    // Une étape déplacée garde ses lignes « À faire » (spécification M5 § 7.4).
    expect(await lignesAFaire(a, tripId)).toEqual(lignesAvant);

    // Rejeu de la même demande : même version, mêmes jours, le déplacement d'abord ; aucune relecture ni version de plus ;
    // même requestId pour une autre étape : conflit.
    const appelsRejeu = double.appels();
    const rejoue = valeur(await deplacer(tripId, 1, requestId));
    expect(rejoue).toMatchObject({ version: 2, touchedDays: [2, 4] });
    expect(rejoue.changes[0]).toEqual(brouillon.changes[0]);
    expect(rejoue.changes.filter((c) => c.type === "checklist")).toEqual(resultat.changes.filter((c) => c.type === "checklist"));
    expect(erreur(await deplacer(tripId, 1, requestId, "j4-holyrood"))).toEqual({ code: "version_conflict", retryable: true, currentVersion: 2 });
    expect(double.appels()).toBe(appelsRejeu);
    expect(await versions(a, tripId)).toHaveLength(2);
  });

  it("deplacer: le patch écrit se rejoue tel quel par le moteur (0037 B2-TL-3) : même instantané que la version écrite", async () => {
    const tripId = await nouveauVoyage();
    valeur(await deplacer(tripId, 1));
    const [v1, v2] = await versions(a, tripId);
    const patch = TripPatchSchema.parse(v2?.patch);
    const operation = patch.operations[0];
    if (operation?.op !== "move") throw new Error("patch [move] attendu");
    // Rejeu hors du cas d'usage : contexte du voyage relu, même demande de relectures, `appliquerPatch` sur la version 1.
    const rejoue = await inTx(app, { org: a.org, user: a.owner }, async (c) => {
      const lu = await contexteVoyage(c, contexte(a), tripId);
      if (lu === null) throw new Error("voyage absent");
      const base1 = { ...lu.base, version: 1, snapshot: instantane(v1) };
      const point = { id: "rejeu", day: operation.day, time: operation.time };
      const stop = etape(base1.snapshot, operation.stopId)?.stop;
      if (stop === undefined) throw new Error("étape absente");
      const lues = await relireRevision(relectures, contexte(a), base1, demandeDuDeplacement(base1, stop, point));
      return appliquerPatch({ moteur: entreeMoteurDeRevision({ ...lu, base: base1 }, [], lues), patch, versionCourante: 1, base: base1.snapshot });
    });
    expect(rejoue.ok).toBe(true);
    if (rejoue.ok) expect(rejoue.instantane).toEqual(instantane(v2));
  });

  it("deplacer: R3 : une étape verrouillée du jour d'arrivée ne bouge pas ; une étape verrouillée ne se déplace pas", async () => {
    const tripId = await nouveauVoyage();
    // Calton Hill, première étape du J4 : à son heure, jamais décalée ni retirée par le déplacement du jardin.
    valeur(await basculerVerrou({ contexte: async () => contexte(a), withOrg, limiteur: async () => ok(undefined) }, "lock", { tripId, requestId: randomUUID(), stopId: "j4-calton-hill", baseVersion: 1 }));
    const v2 = instantane((await versions(a, tripId))[1]);
    valeur(await deplacer(tripId, 2));
    const v3 = instantane((await versions(a, tripId))[2]);
    expect(etape(v3, JARDIN)?.jour).toBe(4);
    expect(etapesVerrouilleesModifiees(v2.days, v3.days)).toEqual([]);
    expect(etape(v3, "j4-calton-hill")).toEqual(etape(v2, "j4-calton-hill"));

    // L'étape verrouillée elle-même : refusée partout (points, aperçu, application), sans relecture ni version.
    const appels = double.appels();
    expect(erreur(await options(tripId, "j4-calton-hill"))).toEqual({ code: "validation_failed", field: "stopId" });
    expect(erreur(await apercu(tripId, 3, "j4-calton-hill"))).toEqual({ code: "validation_failed", field: "stopId" });
    expect(erreur(await deplacer(tripId, 3, randomUUID(), "j4-calton-hill"))).toEqual({ code: "validation_failed", field: "stopId" });
    // Un engagement (Tattoo, verrouillé) et un événement de `Day.events` non plus.
    expect(erreur(await deplacer(tripId, 3, randomUUID(), "j1-tattoo"))).toEqual({ code: "validation_failed", field: "stopId" });
    const evenement = v3.days.flatMap((jour) => jour.events)[0];
    if (evenement !== undefined) expect(erreur(await options(tripId, evenement.id))).toEqual({ code: "validation_failed", field: "stopId" });
    expect(double.appels()).toBe(appels);
    expect(await versions(a, tripId)).toHaveLength(3);
  });

  it("deplacer: refusé avant le déblocage : not_unlocked (retryable faux), sans relecture ni écriture", async () => {
    const tripId = await nouveauVoyage(false);
    const appels = double.appels();
    expect(erreur(await options(tripId))).toEqual({ code: "not_unlocked", retryable: false });
    expect(erreur(await apercu(tripId, 1))).toEqual({ code: "not_unlocked", retryable: false });
    expect(erreur(await deplacer(tripId, 1))).toEqual({ code: "not_unlocked", retryable: false });
    expect(double.appels()).toBe(appels);
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

  it("deplacer: le moteur refuse une journée qu'il ne sait pas tenir : no_option à l'aperçu comme à l'application, rien d'écrit", async () => {
    const tripId = await nouveauVoyage();
    // Dîner du J4 verrouillé (19 h) : le jardin posé à 15 h 50 repousse Arthur's Seat après lui, qui ne tient plus avant le
    // dîner ; le moteur refuse (replanification impossible), aucune version.
    valeur(await basculerVerrou({ contexte: async () => contexte(a), withOrg, limiteur: async () => ok(undefined) }, "lock", { tripId, requestId: randomUUID(), stopId: "j4-diner", baseVersion: 1 }));
    const avant = await versions(a, tripId);
    expect(erreur(await apercu(tripId, 2))).toEqual({ code: "no_option" });
    expect(erreur(await deplacer(tripId, 2))).toEqual({ code: "no_option" });
    expect(await versions(a, tripId)).toEqual(avant);
  });

  it("deplacer: relecture refusée : forfait atteint → cost_cap_reached ; port indisponible ou en erreur → provider_error ; rien d'écrit", async () => {
    const tripId = await nouveauVoyage();
    const avec = (source: SourceRelectures): DependancesDeplacement => ({ ...dependances(contexte(a)), relectures: source });
    for (const [source, code] of [
      [creerRelecturesVoyages({ refus: "quota_reached" }), "cost_cap_reached"],
      [creerRelecturesVoyages({ refus: "unavailable" }), "provider_error"],
      [creerRelecturesVoyages({ leve: true }), "provider_error"],
    ] as const) {
      expect(erreur(await proposerDeplacement(avec(source), { tripId, stopId: JARDIN, pointId: POINT_J4, baseVersion: 1 })), code).toEqual({ code });
      expect(erreur(await appliquerDeplacement(avec(source), { tripId, stopId: JARDIN, pointId: POINT_J4, baseVersion: 1, requestId: randomUUID() })), code).toEqual({ code });
      expect(source.appels()).toBe(2);
    }
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it("deplacer: recalcul ou voyage complet en cours : l'application rend generation_in_progress (retryable), sans écriture", async () => {
    const tripId = await nouveauVoyage();
    await admin.query("INSERT INTO public.generation_runs (organization_id, trip_id, kind, phase) VALUES ($1, $2, 'full', 'preparing')", [a.org, tripId]);
    expect(erreur(await deplacer(tripId, 1))).toEqual({ code: "generation_in_progress", retryable: true });
    expect(await versions(a, tripId)).toHaveLength(1);
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

  it(`deplacer : ${VERSIONS_MAX_PAR_VOYAGE} versions atteintes, validation_failed sur baseVersion, sans relecture ni écriture`, async () => {
    const tripId = await nouveauVoyage();
    const [v1] = await versions(a, tripId);
    await inTx(app, { org: a.org, user: a.owner }, async (c) => {
      await c.query(
        "INSERT INTO trip_versions (organization_id, trip_id, version, parent_version, request_id, snapshot, author_kind) VALUES ($1, $2, $3, 1, $4, $5, 'engine')",
        [a.org, tripId, VERSIONS_MAX_PAR_VOYAGE, randomUUID(), JSON.stringify(v1?.snapshot)],
      );
      await c.query("UPDATE trips SET current_version = $3 WHERE organization_id = $1 AND id = $2", [a.org, tripId, VERSIONS_MAX_PAR_VOYAGE]);
    });
    const appels = double.appels();
    expect(erreur(await apercu(tripId, VERSIONS_MAX_PAR_VOYAGE))).toEqual({ code: "validation_failed", field: "baseVersion" });
    expect(erreur(await deplacer(tripId, VERSIONS_MAX_PAR_VOYAGE))).toEqual({ code: "validation_failed", field: "baseVersion" });
    expect(double.appels()).toBe(appels);
    expect(await versions(a, tripId)).toHaveLength(2);
  });

  it("deplacer: « Annuler » du toast : un retour à la version de base (M5b) rétablit le programme d'avant", async () => {
    const tripId = await nouveauVoyage();
    const base = instantane((await versions(a, tripId))[0]);
    valeur(await deplacer(tripId, 1));
    const retour = valeur(await appliquerRetour({ contexte: async () => contexte(a), withOrg, limiteur: async () => ok(undefined) }, { tripId, requestId: randomUUID(), baseVersion: 2, toVersion: 1 }));
    expect(retour.version).toBe(3);
    expect(instantane((await versions(a, tripId))[2])).toEqual(base);
  });
});
