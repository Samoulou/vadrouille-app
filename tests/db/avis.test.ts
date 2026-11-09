import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import { fail, ok, type DaySnapshot, type Result } from "@/contracts";
import { donnerAvis, lireRevue, type DependancesAvis } from "@/server/avis/avis";
import { creerWithOrg } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { convertirVoyagesSimules, ecrireVoyage, type DonneesVoyage } from "../support/voyages-en-base";
import { closeAll, connect, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * Avis rapide sur la base réelle (tâche M8a, ticket 1062 ; spécification M8 § 3 et § 6.3, critères 1, 3, 4, 5, 7 et 8 ;
 * décision 0160 § 1.1, § 1.5 et § 3.3) : `donnerAvis` et `lireRevue` de `src/server/avis/avis.ts`, sous `vadrouille_app`
 * avec le `withOrg` réel, sur la table `stop_reviews` de la migration 0026 (colonne `opinion`), comme
 * `tests/db/apres-voyage.test.ts` pour la migration. L'horloge est injectée (voyage simulé d'Édimbourg débloqué, fin le
 * 2026-09-03, heure de Londres, UTC+1) ; le débit par adresse IP est injecté et toujours admis (éprouvé par les tests du
 * limiteur). Aucune donnée Google : `placeId` sentinelles du jeu simulé.
 */

const db = createDatabase("vadrouille_app");
const withOrg = creerWithOrg(db);
let app: DbClient;
let auth: DbClient;
let a: Org & { members: string[] };
let b: Org;

const EDIMBOURG_DEBLOQUE = "mock_trip_edimbourg_debloque";
/** 2026-09-03 à 00:00, heure de Londres : premier instant de l'écran complet (critère 1). */
const DERNIER_JOUR = Date.parse("2026-09-02T23:00:00Z");
/** 2026-10-03 à 23:59, heure de Londres : dernier instant modifiable (critère 7). */
const DERNIER_INSTANT_MODIFIABLE = Date.parse("2026-10-03T22:59:00Z");
/** 2026-10-04 à 00:00, heure de Londres : lecture seule (critère 7). */
const LECTURE_SEULE = Date.parse("2026-10-03T23:00:00Z");

const contexte = (org: Org, userId = org.owner, role: AdapterContext["role"] = "owner"): AdapterContext => ({ organizationId: org.org, userId, role });

const donnees = (): DonneesVoyage => {
  const converti = convertirVoyagesSimules().find((v) => v.mockId === EDIMBOURG_DEBLOQUE);
  if (!converti) throw new Error(`voyage simulé absent : ${EDIMBOURG_DEBLOQUE}`);
  return converti.donnees;
};

const snapshotCourant = () => {
  const versions = donnees().versions;
  return versions[versions.length - 1]?.snapshot as { days: DaySnapshot[] } & Record<string, unknown>;
};

/** Première activité avec `placeId` du programme (J1). */
const etapeAvecLieu = () => {
  for (const jour of snapshotCourant().days) {
    for (const item of jour.items) if (item.type === "stop" && item.stop.placeId !== undefined && item.stop.kind === "activity") return item.stop;
  }
  throw new Error("aucune étape avec lieu");
};

const dependances = (maintenant: number): Omit<DependancesAvis, "contexte"> => ({
  withOrg,
  maintenant: () => maintenant,
  limiteur: async (): Promise<Result<void>> => ok(undefined),
});

const noter = (org: Org, maintenant: number, input: Record<string, unknown>, ctx = contexte(org)) =>
  donnerAvis({ ...dependances(maintenant), contexte: async () => ctx }, input);

const relire = (org: Org, tripId: string, maintenant: number, ctx = contexte(org)) => lireRevue(dependances(maintenant), ctx, tripId);

const code = (r: Result<unknown>) => (r.ok ? null : r.error.code);

type Ligne = Record<string, unknown>;
const lignes = (org: Org, tripId: string): Promise<Ligne[]> =>
  inTx(app, { org: org.org, user: org.owner }, async (c) =>
    (
      await c.query("SELECT stop_id, place_id, opinion, created_by, request_id FROM public.stop_reviews WHERE organization_id = $1 AND trip_id = $2 ORDER BY created_at", [
        org.org,
        tripId,
      ])
    ).rows,
  );

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  a = await createOrg(auth, 1);
  b = await createOrg(auth);
});

afterAll(closeAll);

describe("avis rapide sur api (M8a, ticket 1062)", () => {
  it("critère 3 : choisir, relire ; changer : une seule ligne, dernière valeur ; toucher le choix actif : ligne supprimée", async () => {
    const tripId = await ecrireVoyage(app, a, donnees());
    const etape = etapeAvecLieu();
    const requestId = randomUUID();
    expect(await noter(a, DERNIER_JOUR, { tripId, stopId: etape.id, rating: "liked", requestId })).toEqual(ok({ stopId: etape.id, rating: "liked" }));
    expect(await lignes(a, tripId)).toEqual([{ stop_id: etape.id, place_id: etape.placeId ?? null, opinion: "liked", created_by: a.owner, request_id: requestId }]);
    expect((await relire(a, tripId, DERNIER_JOUR))?.reviews).toEqual([{ stopId: etape.id, rating: "liked" }]);

    expect(await noter(a, DERNIER_JOUR, { tripId, stopId: etape.id, rating: "notDone", requestId: randomUUID() })).toEqual(ok({ stopId: etape.id, rating: "notDone" }));
    expect((await lignes(a, tripId)).map((l) => l.opinion)).toEqual(["notDone"]);
    expect((await relire(a, tripId, DERNIER_JOUR))?.reviews).toEqual([{ stopId: etape.id, rating: "notDone" }]);

    expect(await noter(a, DERNIER_JOUR, { tripId, stopId: etape.id, rating: null, requestId: randomUUID() })).toEqual(ok(null));
    expect(await lignes(a, tripId)).toEqual([]);
    expect((await relire(a, tripId, DERNIER_JOUR))?.reviews).toEqual([]);
  });

  it("critère 8 : rejouer la même demande (requestId) ne double rien ; un rejeu d'une autre valeur rend la valeur enregistrée", async () => {
    const tripId = await ecrireVoyage(app, a, donnees());
    const etape = etapeAvecLieu();
    const demande = { tripId, stopId: etape.id, rating: "disliked", requestId: randomUUID() };
    expect(await noter(a, DERNIER_JOUR, demande)).toEqual(ok({ stopId: etape.id, rating: "disliked" }));
    expect(await noter(a, DERNIER_JOUR, demande)).toEqual(ok({ stopId: etape.id, rating: "disliked" }));
    expect(await noter(a, DERNIER_JOUR, { ...demande, rating: "liked" })).toEqual(ok({ stopId: etape.id, rating: "disliked" }));
    expect(await lignes(a, tripId)).toEqual([{ stop_id: etape.id, place_id: etape.placeId ?? null, opinion: "disliked", created_by: a.owner, request_id: demande.requestId }]);
  });

  it("critère 4 : une étape dont le placeId change revient sans avis ; l'ancien avis reste en base, invisible", async () => {
    const tripId = await ecrireVoyage(app, a, donnees());
    const etape = etapeAvecLieu();
    expect(await noter(a, DERNIER_JOUR, { tripId, stopId: etape.id, rating: "liked", requestId: randomUUID() })).toEqual(ok({ stopId: etape.id, rating: "liked" }));
    // Remplacement : nouvelle version courante, même `stopId`, autre `placeId` (sentinelle du jeu simulé, suffixée).
    const remplace = `${etape.placeId}_remplace`;
    const snapshot = snapshotCourant();
    const suivant = {
      ...snapshot,
      days: snapshot.days.map((jour) => ({
        ...jour,
        items: jour.items.map((item) => (item.type === "stop" && item.stop.id === etape.id ? { ...item, stop: { ...item.stop, placeId: remplace } } : item)),
      })),
    };
    await inTx(app, { org: a.org, user: a.owner }, async (c) => {
      const version = Number((await c.query("SELECT current_version FROM trips WHERE organization_id = $1 AND id = $2", [a.org, tripId])).rows[0]?.current_version);
      await c.query(
        `INSERT INTO trip_versions (organization_id, trip_id, version, parent_version, request_id, snapshot, author_kind)
         VALUES ($1, $2, $3, $4, gen_random_uuid(), $5, 'engine')`,
        [a.org, tripId, version + 1, version, JSON.stringify(suivant)],
      );
      await c.query("UPDATE trips SET current_version = $1 WHERE organization_id = $2 AND id = $3", [version + 1, a.org, tripId]);
    });
    expect((await relire(a, tripId, DERNIER_JOUR))?.reviews).toEqual([]);
    expect(await lignes(a, tripId)).toEqual([expect.objectContaining({ stop_id: etape.id, place_id: etape.placeId, opinion: "liked" })]);
    // Un nouvel avis s'écrit sous le nouveau `placeId`, à côté de l'ancien.
    expect(await noter(a, DERNIER_JOUR, { tripId, stopId: etape.id, rating: "disliked", requestId: randomUUID() })).toEqual(ok({ stopId: etape.id, rating: "disliked" }));
    expect((await lignes(a, tripId)).map((l) => [l.place_id, l.opinion])).toEqual([
      [etape.placeId, "liked"],
      [remplace, "disliked"],
    ]);
    expect((await relire(a, tripId, DERNIER_JOUR))?.reviews).toEqual([{ stopId: etape.id, rating: "disliked" }]);
  });

  it("critère 5 : autre organisation ou voyage inconnu : not_found et null ; membre non propriétaire : not_found, rien d'écrit", async () => {
    const tripId = await ecrireVoyage(app, a, donnees());
    const etape = etapeAvecLieu();
    const demande = () => ({ tripId, stopId: etape.id, rating: "liked", requestId: randomUUID() });

    expect(code(await noter(b, DERNIER_JOUR, demande()))).toBe("not_found");
    expect(await relire(b, tripId, DERNIER_JOUR)).toBeNull();

    const membre = contexte(a, a.members[0]!, "member");
    expect(code(await noter(a, DERNIER_JOUR, demande(), membre))).toBe("not_found");
    expect(await relire(a, tripId, DERNIER_JOUR, membre)).toBeNull();

    const inconnu = randomUUID();
    expect(code(await noter(a, DERNIER_JOUR, { ...demande(), tripId: inconnu }))).toBe("not_found");
    expect(await relire(a, inconnu, DERNIER_JOUR)).toBeNull();

    expect(await lignes(a, tripId)).toEqual([]);
  });

  it("critères 1 et 7 : avant le dernier jour et dès le 2026-10-04, écriture refusée (not_found), rien d'écrit ; le 2026-10-03 à 23:59, modifiable", async () => {
    const tripId = await ecrireVoyage(app, a, donnees());
    const etape = etapeAvecLieu();
    const demande = (rating: string | null) => ({ tripId, stopId: etape.id, rating, requestId: randomUUID() });

    expect((await relire(a, tripId, DERNIER_JOUR - 60_000))?.access).toBe("notEnded");
    expect(await noter(a, DERNIER_JOUR - 60_000, demande("liked"))).toEqual(fail("not_found"));
    expect(await lignes(a, tripId)).toEqual([]);
    expect((await relire(a, tripId, DERNIER_JOUR))?.access).toBe("open");

    expect((await relire(a, tripId, DERNIER_INSTANT_MODIFIABLE))?.access).toBe("open");
    expect(await noter(a, DERNIER_INSTANT_MODIFIABLE, demande("liked"))).toEqual(ok({ stopId: etape.id, rating: "liked" }));

    const lecture = await relire(a, tripId, LECTURE_SEULE);
    expect(lecture?.access).toBe("readOnly");
    expect(lecture?.reviews).toEqual([{ stopId: etape.id, rating: "liked" }]);
    expect(await noter(a, LECTURE_SEULE, demande("disliked"))).toEqual(fail("not_found"));
    expect(await noter(a, LECTURE_SEULE, demande(null))).toEqual(fail("not_found"));
    expect((await lignes(a, tripId)).map((l) => l.opinion)).toEqual(["liked"]);
  });

  it("étape hors des étapes à évaluer : validation_failed, rien d'écrit", async () => {
    const tripId = await ecrireVoyage(app, a, donnees());
    const refus = await noter(a, DERNIER_JOUR, { tripId, stopId: "etape-inconnue", rating: "liked", requestId: randomUUID() });
    expect(code(refus)).toBe("validation_failed");
    expect(await lignes(a, tripId)).toEqual([]);
  });
});
