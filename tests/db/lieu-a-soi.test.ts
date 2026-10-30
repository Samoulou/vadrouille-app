import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import { ok, PatchResultSchema, RevisionPreviewSchema, TripPatchSchema, TripSnapshotSchema, type Result, type StopSnapshot, type TripSnapshot } from "@/contracts";
import { INCONNU, type Point, type SourceRelectures } from "@/domain/relectures";
import { creerRelecturesVoyages, type DoubleRelectures } from "@/mocks/relectures-voyages";
import { VERSIONS_MAX_PAR_VOYAGE } from "@/server/config/retouches";
import { appliquerAjout, identifiantAjout, proposerAjout, type DependancesAjout } from "@/server/lieux/ajout";
import { basculerVerrou } from "@/server/versions/retouches";
import { creerWithOrg } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { convertirVoyagesSimules, ecrireVoyage, type DonneesVoyage } from "../support/voyages-en-base";
import { closeAll, connect, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * Lieu à soi sur l'adaptateur `api` (tâche M5d-1, ticket 939 ; spécification M5 § 6 ; décision 0147 § 3 point 5, § 4, § 8,
 * § 11, § 5.3 point 7, § 12 S4), sur la base réelle : cas d'usage `proposerAjout` et `appliquerAjout` de
 * `src/server/lieux/ajout.ts` sous `vadrouille_app` avec le `withOrg` réel. Le débit `retouche` est injecté et toujours
 * admis (éprouvé par les tests du limiteur). Voyage d'Édimbourg du jeu simulé, débloqué par une ligne `tripUnlocked`.
 *
 * Aucune donnée Google : le lieu choisi a un `placeId` sentinelle (jamais revérifié auprès de Google, § 3 point 4) et un nom
 * saisi sentinelle (`texteMaison`) ; le port de relectures est le double des voyages simulés, qui rend une durée fixe pour
 * les trajets vers et depuis le lieu ajouté (le double ne connaît que les lieux du jeu). Aucun appel Google ni Routes.
 */

const db = createDatabase("vadrouille_app");
const withOrg = creerWithOrg(db);
let app: DbClient;
let auth: DbClient;
let admin: DbClient;
let a: Org;
let b: Org;
let double: DoubleRelectures;
let relectures: SourceRelectures;

const EDIMBOURG = "mock_trip_edimbourg";
const LIEU = "SENTINELLE_PLACE_AJOUT_M5D";
const NOM = "SENTINELLE-NOM-SAISI-M5D";
/** Temps libre du J2 du jeu (15 h à 18 h 30, entre le jardin botanique et le dîner). */
const DEMANDE = { day: 2, time: "16:00", kind: "activity" as const, name: NOM, resultId: LIEU };

const contexte = (org: Org): AdapterContext => ({ organizationId: org.org, userId: org.owner, role: "owner" });

const donnees = (debloque: boolean): DonneesVoyage => {
  const converti = convertirVoyagesSimules().find((v) => v.mockId === EDIMBOURG);
  if (!converti) throw new Error(`voyage simulé absent : ${EDIMBOURG}`);
  const { entitlements } = converti.donnees;
  return { ...converti.donnees, entitlements: debloque ? [...entitlements.filter((k) => k !== "tripUnlocked"), "tripUnlocked"] : entitlements.filter((k) => k !== "tripUnlocked") };
};
const nouveauVoyage = (debloque = true, org: Org = a) => ecrireVoyage(app, org, donnees(debloque), undefined, { candidats: true });

const dependances = (ctx: AdapterContext | null): DependancesAjout => ({ contexte: async () => ctx, withOrg, limiteur: async () => ok(undefined), relectures });
const apercu = (tripId: string, baseVersion = 1, extra: Record<string, unknown> = {}, ctx: AdapterContext | null = contexte(a)) =>
  proposerAjout(dependances(ctx), { tripId, baseVersion, ...DEMANDE, ...extra });
const appliquer = (tripId: string, baseVersion = 1, requestId: string = randomUUID(), extra: Record<string, unknown> = {}, ctx: AdapterContext | null = contexte(a)) =>
  appliquerAjout(dependances(ctx), { tripId, baseVersion, requestId, ...DEMANDE, ...extra });

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

const valeur = <T>(resultat: Result<T>): T => {
  if (!resultat.ok) throw new Error(`refus inattendu : ${resultat.error.code}`);
  return resultat.value;
};
const erreur = <T>(resultat: Result<T>) => (resultat.ok ? null : resultat.error);

/** Lignes des tables du voyage qui pourraient porter un texte : versions, « À faire », retours, exécutions. */
const lignesDuVoyage = async (tripId: string): Promise<string> => {
  const textes: string[] = [];
  for (const table of ["trip_versions", "checklist_items", "feedback", "generation_runs"]) {
    const { rows } = await admin.query(`SELECT t::text AS ligne FROM public.${table} t WHERE trip_id = $1`, [tripId]);
    textes.push(...rows.map((r) => String(r.ligne)));
  }
  return textes.join("\n");
};

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  admin = await connect("admin");
  a = await createOrg(auth);
  b = await createOrg(auth);
  double = creerRelecturesVoyages();
  const estLeLieu = (point: Point) => "lieu" in point && point.lieu === LIEU;
  // Le double ne connaît que les lieux du jeu : trajets vers et depuis le lieu ajouté, 10 minutes ; tout le reste, le double.
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
            return estLeLieu(depuis) || estLeLieu(vers) ? { minutes: 10, estimee: false } : INCONNU;
          },
        },
      };
    },
  };
});

afterAll(closeAll);

describe("lieu à soi sur api (M5d-1, ticket 939)", () => {
  it("aperçu add : étape ajoutée à son heure, nom saisi ; rien n'est écrit ; un appel du port", async () => {
    const tripId = await nouveauVoyage();
    const appels = double.appels();
    const lu = RevisionPreviewSchema.parse(valeur(await apercu(tripId)));
    expect(lu.kind).toBe("add");
    expect(lu.baseVersion).toBe(1);
    expect(lu.targetStopId.startsWith("ajout-")).toBe(true);
    const ajoutee = lu.days.flatMap((d) => d.items).find((i) => i.type === "stop" && i.stop.id === lu.targetStopId);
    expect(ajoutee).toMatchObject({ type: "stop", stop: { name: NOM, start: "16:00", locked: true, addedBy: "person" } });
    expect(lu.changedStopIds[0]).toBe(lu.targetStopId);
    expect(double.appels()).toBe(appels + 1);
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it("application : version 2 (auteur user, patch [add, lock]), étape verrouillée et ajoutée par la personne ; seul le placeId est gardé ; rejeu idempotent", async () => {
    const tripId = await nouveauVoyage();
    const requestId = randomUUID();
    const resultat = PatchResultSchema.parse(valeur(await appliquer(tripId, 1, requestId)));
    expect(resultat.version).toBe(2);
    expect(resultat.touchedDays).toContain(2);
    expect(resultat.changes).toContainEqual({ type: "added", time: "16:00", label: NOM });

    const lignes = await versions(a, tripId);
    expect(lignes).toHaveLength(2);
    expect(lignes[1]).toMatchObject({ version: 2, parent_version: 1, author_kind: "user", author_user_id: a.owner });
    const stopId = identifiantAjout(requestId);
    expect(TripPatchSchema.parse(lignes[1]?.patch)).toEqual({
      requestId,
      baseVersion: 1,
      operations: [
        { op: "add", stopId, kind: "activity", day: 2, time: "16:00", name: NOM, placeId: LIEU },
        { op: "lock", stopId },
      ],
    });
    expect(etape(instantane(lignes[1]), stopId)).toEqual({
      jour: 2,
      stop: { id: stopId, kind: "activity", placeId: LIEU, name: NOM, start: "16:00", end: expect.any(String), facts: {}, exceptions: [], locked: true, addedBy: "person" },
    });

    // Rejeu : même réponse, aucune nouvelle version ; autre geste sous le même requestId : conflit.
    const appels = double.appels();
    expect(valeur(await appliquer(tripId, 1, requestId))).toEqual({ version: 2, touchedDays: [2], changes: [{ type: "added", time: "16:00", label: NOM }] });
    expect(double.appels()).toBe(appels + 1);
    expect(erreur(await appliquer(tripId, 1, requestId, { time: "17:00" }))).toEqual({ code: "version_conflict", retryable: true, currentVersion: 2 });
    expect(await versions(a, tripId)).toHaveLength(2);

    // Aucun nom ni adresse Google : la demande n'a aucun champ pour eux ; le placeId choisi est la seule donnée de Google.
    const texte = await lignesDuVoyage(tripId);
    expect(texte).toContain(LIEU);
    for (const interdit of ["SENTINELLE-NOM-LIEU-M5D", "SENTINELLE-ADRESSE-LIEU-M5D", "shortFormattedAddress", "displayName"]) expect(texte).not.toContain(interdit);
  });

  it("refusé avant le déblocage : not_unlocked (retryable faux), sans relecture ni écriture", async () => {
    const tripId = await nouveauVoyage(false);
    const appels = double.appels();
    expect(erreur(await apercu(tripId))).toEqual({ code: "not_unlocked", retryable: false });
    expect(erreur(await appliquer(tripId))).toEqual({ code: "not_unlocked", retryable: false });
    expect(double.appels()).toBe(appels);
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it("conflit de version : baseVersion dépassée, version_conflict avec currentVersion, sans écriture", async () => {
    const tripId = await nouveauVoyage();
    valeur(await appliquer(tripId, 1));
    expect(erreur(await apercu(tripId, 1))).toEqual({ code: "version_conflict", retryable: true, currentVersion: 2 });
    expect(erreur(await appliquer(tripId, 1))).toEqual({ code: "version_conflict", retryable: true, currentVersion: 2 });
    expect(await versions(a, tripId)).toHaveLength(2);
  });

  it("entrée stricte : nom Google, adresse, organisation refusés ; jour hors du voyage not_found ; aucune place : no_option", async () => {
    const tripId = await nouveauVoyage();
    for (const extra of [{ googleName: "x" }, { address: "x" }, { organizationId: b.org }, { name: "" }]) {
      expect(erreur(await apercu(tripId, 1, extra))).toMatchObject({ code: "validation_failed" });
    }
    expect(erreur(await apercu(tripId, 1, { day: 30 }))).toEqual({ code: "not_found" });
    expect(erreur(await apercu(tripId, 1, { time: "23:50" }))).toEqual({ code: "no_option" });
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it("isolation : un voyage d'une autre organisation est not_found, aperçu comme application ; sans session : unauthenticated", async () => {
    const tripId = await nouveauVoyage(true, b);
    expect(erreur(await apercu(tripId, 1, {}, contexte(a)))).toEqual({ code: "not_found" });
    expect(erreur(await appliquer(tripId, 1, randomUUID(), {}, contexte(a)))).toEqual({ code: "not_found" });
    expect(erreur(await apercu(tripId, 1, {}, null))).toEqual({ code: "unauthenticated" });
    expect(await versions(b, tripId)).toHaveLength(1);
    // Dans son organisation, l'ajout passe.
    expect(valeur(await appliquer(tripId, 1, randomUUID(), {}, contexte(b))).version).toBe(2);
  });

  it(`${String(VERSIONS_MAX_PAR_VOYAGE)} versions atteintes : validation_failed sur baseVersion, sans relecture ni écriture (0147 § 5.3 point 7)`, async () => {
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
    expect(erreur(await appliquer(tripId, VERSIONS_MAX_PAR_VOYAGE))).toEqual({ code: "validation_failed", field: "baseVersion" });
    expect(double.appels()).toBe(appels);
    expect(await versions(a, tripId)).toHaveLength(2);
  });

  it("R3 : une étape verrouillée survit à l'ajout (nom, jour, heures, placeId, verrou)", async () => {
    const tripId = await nouveauVoyage();
    valeur(await basculerVerrou({ contexte: async () => contexte(a), withOrg, limiteur: async () => ok(undefined) }, "lock", { tripId, requestId: randomUUID(), stopId: "j2-jardin-botanique", baseVersion: 1 }));
    const avant = etape(instantane((await versions(a, tripId))[1]), "j2-jardin-botanique");
    expect(avant?.stop.locked).toBe(true);
    expect(valeur(await appliquer(tripId, 2)).version).toBe(3);
    const apres = etape(instantane((await versions(a, tripId))[2]), "j2-jardin-botanique");
    expect(apres).toEqual(avant);
  });
});
