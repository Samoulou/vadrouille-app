import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApiTripAdapter } from "@/adapters/api";
import type { AdapterContext, RevisionAdapter, TripAdapter } from "@/adapters/types";
import { ProposalRecordSchema, TripPatchSchema, TripSnapshotSchema, type ReplacementOffer, type Result } from "@/contracts";
import { creerRelecturesVoyages } from "@/mocks/relectures-voyages";
import { ecrireVersion } from "@/server/versions/ecrire";
import { creerWithOrg, executeurSql } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { convertirVoyagesSimules, ecrireVoyage } from "../support/voyages-en-base";
import { closeAll, connect, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * Remplacer une étape sur l'adaptateur `api` (écran 14 ; tâche M1g, ticket 869), sur la base réelle : cas d'usage de
 * `src/server/versions/remplacement.ts` par la révision de l'adaptateur `api` (`TripAdapter.revision`), avec le `withOrg` de
 * `vadrouille_app` et le double de relectures ; voyages du jeu simulé écrits par `tests/support/voyages-en-base.ts`
 * (Édimbourg : dîner du J1 et son option « [Bistrot de Victoria Street] », proposition déjà vérifiée hors programme).
 * Aucune donnée Google : `placeId` sentinelles (`mock_place_…`, `test_place_…`) et noms entre crochets.
 */

const db = createDatabase("vadrouille_app");
const withOrg = creerWithOrg(db);
let app: DbClient;
let auth: DbClient;
let a: Org;
let b: Org;
let ctxA: AdapterContext;
let ctxB: AdapterContext;
let adaptateur: TripAdapter;
let revision: RevisionAdapter;

const contexte = (org: Org): AdapterContext => ({ organizationId: org.org, userId: org.owner, role: "owner" });
const EDIMBOURG = "mock_trip_edimbourg";
const EDIMBOURG_DEBLOQUE = "mock_trip_edimbourg_debloque";

const voyageSimule = (mockId: string) => {
  const converti = convertirVoyagesSimules().find((v) => v.mockId === mockId);
  if (!converti) throw new Error(`voyage simulé absent : ${mockId}`);
  return converti.donnees;
};

const nouveauVoyage = (mockId = EDIMBOURG, org: Org = a) => ecrireVoyage(app, org, voyageSimule(mockId));

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
const courante = (org: Org, tripId: string): Promise<number> =>
  inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT current_version FROM trips WHERE organization_id = $1 AND id = $2", [org.org, tripId])).rows[0].current_version);
const propositionDe = (org: Org, tripId: string, contenu: string): Promise<string> =>
  inTx(app, { org: org.org, user: org.owner }, async (c) =>
    (await c.query("SELECT id FROM proposals WHERE organization_id = $1 AND trip_id = $2 AND content ->> 'id' = $3 AND phase = 'deck'", [org.org, tripId, contenu])).rows[0].id,
  );

const valeur = <T>(resultat: Result<T>): T => {
  if (!resultat.ok) throw new Error(`refus inattendu : ${resultat.error.code}`);
  return resultat.value;
};
const offre = (resultat: Result<ReplacementOffer>) => {
  const v = valeur(resultat);
  if (v.status !== "offer") throw new Error(`aucune offre : ${v.status}`);
  return v;
};

const apercu = (tripId: string, stopId: string, baseVersion: number, ctx: AdapterContext | null = ctxA) =>
  revision.previewReplacement(ctx, { tripId, stopId, reason: "notMyStyle", baseVersion });
const appliquer = (tripId: string, stopId: string, proposalId: string, baseVersion: number, requestId: string = randomUUID(), ctx: AdapterContext | null = ctxA) =>
  revision.applyReplacement(ctx, { tripId, requestId, stopId, proposalId, baseVersion });
const annuler = (tripId: string, version: number, requestId: string = randomUUID(), ctx: AdapterContext | null = ctxA) =>
  revision.undoReplacement(ctx, { tripId, requestId, version });

const etapesDuJour = async (tripId: string, index: number) => {
  const jour = await adaptateur.getDay(ctxA, tripId, index);
  return (jour?.items ?? []).flatMap((item) => (item.type === "stop" ? [item.stop] : []));
};

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  a = await createOrg(auth);
  b = await createOrg(auth);
  ctxA = contexte(a);
  ctxB = contexte(b);
  adaptateur = createApiTripAdapter({ relectures: creerRelecturesVoyages(), withOrg });
  if (adaptateur.revision === undefined) throw new Error("révision absente de l'adaptateur api");
  revision = adaptateur.revision;
});

afterAll(closeAll);

describe("remplacer une étape sur api (M1g, PR 869)", () => {
  it("PR 869 : aperçu sans écriture, puis version 2 (auteur user, patch replace), lue par les lecteurs inchangés", async () => {
    const tripId = await nouveauVoyage();
    expect(valeur(await revision.currentVersion(ctxA, { tripId }))).toBe(1);
    const proposalId = await propositionDe(a, tripId, "prop-j1-diner-2");

    const proposee = offre(await apercu(tripId, "j1-diner", 1));
    expect(proposee.version).toBe(1);
    expect(proposee.proposalId).toBe(proposalId);
    expect(proposee.stop).toMatchObject({ name: "[Bistrot de Victoria Street]", placeId: "mock_place_old_town_diner_2", kind: "meal", start: "18:45", locked: false });
    expect(await versions(a, tripId)).toHaveLength(1);

    const avant = TripSnapshotSchema.parse((await versions(a, tripId))[0]?.snapshot);
    const ancienne = avant.days[0]?.items.flatMap((item) => (item.type === "stop" && item.stop.id === "j1-diner" ? [item.stop] : []))[0];
    expect(proposee.stop.end).toBe(ancienne?.end);

    expect(valeur(await appliquer(tripId, "j1-diner", proposalId, 1))).toEqual({ status: "applied", version: 2 });
    expect(await courante(a, tripId)).toBe(2);
    const lignes = await versions(a, tripId);
    expect(lignes).toHaveLength(2);
    const v2 = lignes[1] ?? {};
    expect(v2).toMatchObject({ version: 2, parent_version: 1, author_kind: "user", author_user_id: a.owner });
    const patch = TripPatchSchema.parse(v2.patch);
    expect(patch.baseVersion).toBe(1);
    expect(patch.operations).toEqual([{ op: "replace", stopId: "j1-diner", candidateId: proposalId, newStopId: proposee.stop.id }]);

    // Seul le dîner du J1 change ; la nouvelle étape est l'étape stockée de la proposition, au créneau remplacé.
    const apres = TripSnapshotSchema.parse(v2.snapshot);
    expect(apres.days.slice(1)).toEqual(avant.days.slice(1));
    const contenu = await inTx(app, { org: a.org, user: a.owner }, async (c) => (await c.query("SELECT content FROM proposals WHERE id = $1", [proposalId])).rows[0].content);
    const stockee = ProposalRecordSchema.parse(contenu).stop;
    const nouvelle = apres.days[0]?.items.flatMap((item) => (item.type === "stop" && item.stop.id === proposee.stop.id ? [item.stop] : []))[0];
    expect(nouvelle).toEqual({ ...stockee, id: proposee.stop.id, start: ancienne?.start, end: ancienne?.end, locked: false });

    // Lecture (lecteurs de M1a-3 inchangés) : la Journée 1 sert la nouvelle étape avec ses durées relues.
    const etapes = await etapesDuJour(tripId, 1);
    expect(etapes.map((s) => s.id)).toContain(proposee.stop.id);
    expect(etapes.map((s) => s.id)).not.toContain("j1-diner");
    const jour = await adaptateur.getDay(ctxA, tripId, 1);
    expect(jour?.items.filter((item) => item.type === "segment").every((item) => item.type === "segment" && typeof item.segment.minutes === "number")).toBe(true);
  });

  it("PR 869 : annulation, version 3 identique à la version 1 (revert), rien n'est supprimé", async () => {
    const tripId = await nouveauVoyage();
    const proposee = offre(await apercu(tripId, "j1-diner", 1));
    valeur(await appliquer(tripId, "j1-diner", proposee.proposalId, 1));
    expect(valeur(await annuler(tripId, 2))).toEqual({ status: "undone", version: 3 });
    const lignes = await versions(a, tripId);
    expect(lignes.map((l) => l.version)).toEqual([1, 2, 3]);
    expect(lignes[2]?.snapshot).toEqual(lignes[0]?.snapshot);
    expect(lignes[2]).toMatchObject({ parent_version: 2, author_kind: "user", author_user_id: a.owner });
    expect(TripPatchSchema.parse(lignes[2]?.patch).operations).toEqual([{ op: "revert", toVersion: 1 }]);
    expect(await courante(a, tripId)).toBe(3);
    expect((await etapesDuJour(tripId, 1)).map((s) => s.id)).toContain("j1-diner");
    // Une annulation ne s'annule pas ici, et la version 2 n'est plus la courante.
    expect(valeur(await annuler(tripId, 3))).toEqual({ status: "conflict", currentVersion: 3 });
    expect(valeur(await annuler(tripId, 2))).toEqual({ status: "conflict", currentVersion: 3 });
    // Après l'annulation, le même remplacement se propose de nouveau, sur la version 3.
    expect(offre(await apercu(tripId, "j1-diner", 3)).proposalId).toBe(proposee.proposalId);
    expect(await versions(a, tripId)).toHaveLength(3);
  });

  it("PR 869 : même requestId, une seule version (application et annulation)", async () => {
    const tripId = await nouveauVoyage();
    const proposee = offre(await apercu(tripId, "j1-diner", 1));
    const demande = randomUUID();
    expect(valeur(await appliquer(tripId, "j1-diner", proposee.proposalId, 1, demande))).toEqual({ status: "applied", version: 2 });
    expect(valeur(await appliquer(tripId, "j1-diner", proposee.proposalId, 1, demande))).toEqual({ status: "applied", version: 2 });
    const annulation = randomUUID();
    expect(valeur(await annuler(tripId, 2, annulation))).toEqual({ status: "undone", version: 3 });
    expect(valeur(await annuler(tripId, 2, annulation))).toEqual({ status: "undone", version: 3 });
    expect(await versions(a, tripId)).toHaveLength(3);
  });

  it("PR 869 : version de base dépassée, conflict sans écriture", async () => {
    const tripId = await nouveauVoyage();
    const proposee = offre(await apercu(tripId, "j1-diner", 1));
    valeur(await appliquer(tripId, "j1-diner", proposee.proposalId, 1));
    expect(valeur(await apercu(tripId, "j1-diner", 1))).toEqual({ status: "conflict", currentVersion: 2 });
    expect(valeur(await appliquer(tripId, "j1-diner", proposee.proposalId, 1))).toEqual({ status: "conflict", currentVersion: 2 });
    expect(await versions(a, tripId)).toHaveLength(2);
  });

  it("PR 869 : étape verrouillée, sans proposition compatible, proposition écartée au tri ou étape inconnue : rien n'est écrit", async () => {
    const tripId = await nouveauVoyage();
    // Le Tattoo est verrouillé (et un engagement).
    expect(valeur(await apercu(tripId, "j1-tattoo", 1))).toEqual({ status: "lockedStop" });
    // Aucune activité du voyage hors programme : aucune option compatible.
    expect(valeur(await apercu(tripId, "j1-chateau", 1))).toEqual({ status: "noOption" });
    // Étape absente du programme : `not_found`.
    const inconnue = await apercu(tripId, "j1-inconnue", 1);
    expect(inconnue.ok ? null : inconnue.error.code).toBe("not_found");
    // « Pas pour moi » sur l'option : elle n'est plus proposée ; une proposition qui n'est pas celle de l'aperçu non plus.
    const proposalId = await propositionDe(a, tripId, "prop-j1-diner-2");
    const autre = await propositionDe(a, tripId, "prop-j1-chateau");
    expect(valeur(await appliquer(tripId, "j1-diner", autre, 1))).toEqual({ status: "noOption" });
    await inTx(app, { org: a.org, user: a.owner }, (c) =>
      c.query(
        "INSERT INTO preference_signals (organization_id, trip_id, request_id, place_id, category, signal, origin, status, proposal_id) VALUES ($1, $2, $3, 'mock_place_old_town_diner_2', 'restaurant', 'dislike', 'gesture', 'confirmed', $4)",
        [a.org, tripId, randomUUID(), proposalId],
      ),
    );
    expect(valeur(await apercu(tripId, "j1-diner", 1))).toEqual({ status: "noOption" });
    expect(valeur(await appliquer(tripId, "j1-diner", proposalId, 1))).toEqual({ status: "noOption" });
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it("PR 869 : isolation, une autre organisation ne lit ni n'écrit (not_found), et sans session : unauthenticated", async () => {
    const tripId = await nouveauVoyage();
    const proposalId = await propositionDe(a, tripId, "prop-j1-diner-2");
    const code = (r: Result<unknown>) => (r.ok ? null : r.error.code);
    expect(code(await revision.currentVersion(ctxB, { tripId }))).toBe("not_found");
    expect(code(await apercu(tripId, "j1-diner", 1, ctxB))).toBe("not_found");
    expect(code(await appliquer(tripId, "j1-diner", proposalId, 1, randomUUID(), ctxB))).toBe("not_found");
    expect(code(await annuler(tripId, 1, randomUUID(), ctxB))).toBe("not_found");
    expect(code(await apercu(tripId, "j1-diner", 1, null))).toBe("unauthenticated");
    expect(code(await appliquer(tripId, "j1-diner", proposalId, 1, randomUUID(), null))).toBe("unauthenticated");
    // Un champ d'organisation dans l'entrée est refusé (objet strict), sans rien lire.
    const intrus = await revision.applyReplacement(ctxA, { tripId, requestId: randomUUID(), stopId: "j1-diner", proposalId, baseVersion: 1, organizationId: b.org });
    expect(code(intrus)).toBe("validation_failed");
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it("PR 869 : recalcul en cours (exécution batch non terminée), generation_in_progress sans écriture", async () => {
    const tripId = await nouveauVoyage(EDIMBOURG_DEBLOQUE);
    const proposalId = await propositionDe(a, tripId, "prop-j3-diner-2");
    const refus = await appliquer(tripId, "j3-diner", proposalId, 1);
    expect(refus.ok ? null : refus.error).toEqual({ code: "generation_in_progress", retryable: true });
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it("PR 869 : ecrireVersion refuse un patch dont la base n'est pas la dernière version, sans rien écrire", async () => {
    const tripId = await nouveauVoyage();
    const snapshot = TripSnapshotSchema.parse((await versions(a, tripId))[0]?.snapshot);
    const requestId = randomUUID();
    const ecrire = (baseVersion: number) =>
      withOrg(ctxA, (tx) =>
        ecrireVersion(executeurSql(tx), {
          organizationId: a.org,
          tripId,
          requestId,
          auteur: "user",
          auteurUserId: a.owner,
          instantane: snapshot,
          patch: { requestId, baseVersion, operations: [{ op: "lock", stopId: "j1-chateau" }] },
        }),
      );
    await expect(ecrire(2)).rejects.toThrow();
    expect(await versions(a, tripId)).toHaveLength(1);
    // Patch d'une autre demande : refusé avant toute requête.
    await expect(
      withOrg(ctxA, (tx) =>
        ecrireVersion(executeurSql(tx), {
          organizationId: a.org,
          tripId,
          requestId: randomUUID(),
          auteur: "user",
          auteurUserId: a.owner,
          instantane: snapshot,
          patch: { requestId, baseVersion: 1, operations: [{ op: "lock", stopId: "j1-chateau" }] },
        }),
      ),
    ).rejects.toThrow(RangeError);
    expect((await ecrire(1)).version).toBe(2);
  });
});
