// @vitest-environment node
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { DaySchema, TripSchema } from "@/contracts";
import { PROTOTYPE_ORG_ID, ProgrammeReduitSchema, type ProgrammeEcrit } from "@/prototype/programme-reduit";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

import { createPrototypeAdapter, createPrototypeAdapterSansCarte } from "./prototype";
import { createSourceProgrammesReels, EchecLectureProgrammes, PROGRAMMES_MAX, SQL_DELAI, SQL_LISTE, SQL_PROGRAMME } from "./prototype-lecture";

/**
 * Source des programmes réels et chemin sans carte (décision 0074) : client `pg` simulé. Lecture seule bornée,
 * barrière avant toute connexion, schéma unique sans positions, aucune durée ni position servie.
 */

const TRIP_ID = "proto_test_20261012_1";
const ctx = { organizationId: PROTOTYPE_ORG_ID, userId: "user_test", role: "owner" as const };
const DOSSIER = realpathSync(join(process.cwd(), "prototype", "programmes-test"));

function programmeComplet() {
  return ProgrammeReduitSchema.parse(JSON.parse(readFileSync(join(DOSSIER, `${TRIP_ID}.json`), "utf8")));
}

/** Contenu tel qu'écrit par `ecrireProgramme` : la forme réduite de test sans `positions`. */
function contenuEcrit(): Record<string, unknown> {
  const contenu: Partial<ReturnType<typeof programmeComplet>> = structuredClone(programmeComplet());
  delete contenu.positions;
  return contenu;
}

type Requete = { texte: string; valeurs?: readonly unknown[] };

function poolSimule(reponses: { contenus?: unknown[]; echec?: boolean; connexionRefusee?: boolean } = {}) {
  const requetes: Requete[] = [];
  const liberations: unknown[] = [];
  const client: ClientSql = {
    async query(texte, valeurs) {
      requetes.push({ texte, valeurs });
      if (reponses.echec && texte !== "ROLLBACK") throw Object.assign(new Error("secret de la base"), { code: "08006" });
      if (texte === SQL_LISTE || texte === SQL_PROGRAMME) return { rows: (reponses.contenus ?? []).map((contenu) => ({ contenu })) };
      return { rows: [] };
    },
    release: (erreur) => {
      liberations.push(erreur);
    },
  };
  const connect = vi.fn(async () => {
    if (reponses.connexionRefusee) throw new Error("secret de connexion");
    return client;
  });
  const pool: PoolSql = { connect };
  return { pool, requetes, liberations, connect };
}

describe("p0: lecture des programmes réels (décision 0074)", () => {
  it("barrière fermée : aucune connexion, liste vide et voyage introuvable", async () => {
    const ouvrir = vi.fn(async () => null);
    const source = createSourceProgrammesReels({ pool: ouvrir });
    expect(await source.lister()).toEqual([]);
    expect(await source.lire(TRIP_ID)).toBeNull();
    expect(ouvrir).toHaveBeenCalledTimes(2);
  });

  it("identifiant mal formé : refusé avant la barrière et avant toute connexion", async () => {
    const ouvrir = vi.fn(async () => poolSimule().pool);
    const source = createSourceProgrammesReels({ pool: ouvrir });
    expect(await source.lire("../x")).toBeNull();
    expect(await source.lire("a".repeat(65))).toBeNull();
    expect(ouvrir).not.toHaveBeenCalled();
  });

  it("lecture seule : transaction READ ONLY bornée par statement_timeout, un seul SELECT, identifiant en paramètre lié", async () => {
    const simule = poolSimule({ contenus: [contenuEcrit()] });
    const source = createSourceProgrammesReels({ pool: async () => simule.pool });
    expect((await source.lister()).map((p) => p.trip.id)).toEqual([TRIP_ID]);
    expect((await source.lire(TRIP_ID))?.trip.id).toBe(TRIP_ID);
    expect(simule.requetes.map((r) => r.texte)).toEqual(["BEGIN READ ONLY", SQL_DELAI, SQL_LISTE, "COMMIT", "BEGIN READ ONLY", SQL_DELAI, SQL_PROGRAMME, "COMMIT"]);
    expect(SQL_DELAI).toMatch(/^SET LOCAL statement_timeout = \d+$/);
    expect(simule.requetes.find((r) => r.texte === SQL_PROGRAMME)?.valeurs).toEqual([TRIP_ID]);
    expect(simule.liberations).toEqual([false, false]);
    for (const sql of [SQL_LISTE, SQL_PROGRAMME]) {
      expect(sql.trimStart().startsWith("SELECT")).toBe(true);
      expect(sql).toContain("FROM prototype.programmes");
      expect(sql).toContain("expires_at > pg_catalog.now()");
      expect(sql).not.toMatch(/place_coordinates|INSERT|UPDATE|DELETE/i);
    }
  });

  it("« Mes voyages » : une seule connexion pour toute la liste", async () => {
    const autre = contenuEcrit();
    (autre.trip as { id: string }).id = "proto_test_20261012_2";
    const simule = poolSimule({ contenus: [contenuEcrit(), autre] });
    const adapter = createPrototypeAdapterSansCarte({ programmes: createSourceProgrammesReels({ pool: async () => simule.pool }) });
    expect((await adapter.listTrips(ctx)).map((r) => r.id)).toEqual([TRIP_ID, "proto_test_20261012_2"]);
    expect(simule.connect).toHaveBeenCalledTimes(1);
  });

  it("chemin sans carte : aucune carte, aucune durée, aucune relecture", async () => {
    const simule = poolSimule({ contenus: [contenuEcrit()] });
    const adapter = createPrototypeAdapterSansCarte({ programmes: createSourceProgrammesReels({ pool: async () => simule.pool }) });
    const trip = await adapter.getTrip(ctx, TRIP_ID);
    expect(trip).not.toBeNull();
    TripSchema.parse(trip);
    for (const jour of trip!.days) {
      DaySchema.parse(jour);
      expect(jour.travelMinutes).toBe(0);
      expect(jour.items.some((item) => item.type === "segment")).toBe(false);
      expect(jour.items.some((item) => item.type === "stop")).toBe(true);
    }
    const propositions = await adapter.listProposals(ctx, TRIP_ID);
    expect(propositions.length).toBeGreaterThan(0);
    for (const proposition of propositions) {
      expect(proposition.travelFromPrevious).toBeUndefined();
      expect(proposition.detour).toBeUndefined();
    }
    expect(await adapter.getDayMap(ctx, TRIP_ID, 1)).toBeNull();
    expect(await adapter.getTripMap(ctx, TRIP_ID)).toEqual([]);
  });

  it("chemin sans carte explicite : même avec les positions d'un programme complet, aucun point n'est servi", async () => {
    // Le même programme, servi avec ses positions par le chemin du chargeur, a bien une carte : le « sans carte » tient
    // au chemin choisi, pas à une table de positions vide.
    const complet = programmeComplet();
    const avecCarte = createPrototypeAdapter({
      programmes: { ids: async () => [TRIP_ID], lire: async (id) => (id === TRIP_ID ? structuredClone(complet) : null) },
      relecteurs: { trajets: { relireJournee: async (paires) => ({ ok: true, minutes: paires.map(() => 10) }) } },
    });
    expect((await avecCarte.getTripMap(ctx, TRIP_ID)).length).toBeGreaterThan(0);
    const sansCarte = createPrototypeAdapterSansCarte({
      programmes: { lister: async () => [complet as ProgrammeEcrit], lire: async (id) => (id === TRIP_ID ? (complet as ProgrammeEcrit) : null) },
    });
    expect(await sansCarte.getTripMap(ctx, TRIP_ID)).toEqual([]);
    for (const jour of complet.trip.days) expect(await sansCarte.getDayMap(ctx, TRIP_ID, jour.index)).toBeNull();
  });

  it("contenu refusé : positions présentes, clé inconnue, identifiant différent ou deux lignes → non servi", async () => {
    const avecPositions = { ...contenuEcrit(), positions: {} };
    const cleInconnue = { ...contenuEcrit(), extra: 1 };
    const autre = contenuEcrit();
    (autre.trip as { id: string }).id = "proto_autre_20261012_1";
    for (const contenus of [[avecPositions], [cleInconnue], [autre], [contenuEcrit(), contenuEcrit()], [], ["texte"]]) {
      const simule = poolSimule({ contenus });
      const source = createSourceProgrammesReels({ pool: async () => simule.pool });
      expect(await source.lire(TRIP_ID)).toBeNull();
    }
  });

  it("identifiant en double : absent de la liste comme de la page du voyage", async () => {
    const simule = poolSimule({ contenus: [contenuEcrit(), contenuEcrit()] });
    const source = createSourceProgrammesReels({ pool: async () => simule.pool });
    expect(await source.lister()).toEqual([]);
    expect(await source.lire(TRIP_ID)).toBeNull();
  });

  it("autre organisation que celle du contexte : introuvable", async () => {
    const simule = poolSimule({ contenus: [contenuEcrit()] });
    const adapter = createPrototypeAdapterSansCarte({ programmes: createSourceProgrammesReels({ pool: async () => simule.pool }) });
    const autre = { ...ctx, organizationId: "5e1f0000-0000-4000-8000-0000000000ff" };
    expect(await adapter.listTrips(autre)).toEqual([]);
    expect(await adapter.getTrip(autre, TRIP_ID)).toBeNull();
  });

  it("erreur de requête : EchecLectureProgrammes sans message de la base, ROLLBACK tenté, client rendu comme cassé", async () => {
    const simule = poolSimule({ echec: true });
    const source = createSourceProgrammesReels({ pool: async () => simule.pool });
    const erreur = await source.lister().catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(EchecLectureProgrammes);
    expect(String((erreur as Error).message)).not.toContain("secret");
    expect(simule.requetes.at(-1)?.texte).toBe("ROLLBACK");
    expect(simule.liberations).toEqual([true]);
  });

  it("connexion refusée : EchecLectureProgrammes sans message", async () => {
    const simule = poolSimule({ connexionRefusee: true });
    const erreur = await createSourceProgrammesReels({ pool: async () => simule.pool })
      .lire(TRIP_ID)
      .catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(EchecLectureProgrammes);
    expect(String((erreur as Error).message)).not.toContain("secret");
  });

  it(`plus de ${PROGRAMMES_MAX} programmes : échec fermé, jamais une liste tronquée`, async () => {
    const contenus = Array.from({ length: PROGRAMMES_MAX + 1 }, (_, i) => {
      const c = contenuEcrit();
      (c.trip as { id: string }).id = `proto_x_20261012_${i}`;
      return c;
    });
    const simule = poolSimule({ contenus });
    await expect(createSourceProgrammesReels({ pool: async () => simule.pool }).lister()).rejects.toBeInstanceOf(EchecLectureProgrammes);
  });
});
