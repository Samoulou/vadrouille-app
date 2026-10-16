// @vitest-environment node
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { DaySchema, TripSchema } from "@/contracts";
import { PROTOTYPE_ORG_ID, ProgrammeReduitSchema } from "@/prototype/programme-reduit";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

import { createPrototypeAdapter } from "./prototype";
import { createSourceProgrammesReels, EchecLectureProgrammes, PROGRAMMES_MAX, SQL_IDS, SQL_PROGRAMME } from "./prototype-lecture";

/**
 * Source des programmes réels (décision 0074) : client `pg` simulé. Lecture seule, barrière avant toute connexion,
 * schéma strict sans positions, aucune durée ni position servie.
 */

const TRIP_ID = "proto_test_20261012_1";
const ctx = { organizationId: PROTOTYPE_ORG_ID, userId: "user_test", role: "owner" as const };

/** Contenu tel qu'écrit par `ecrireProgramme` : la forme réduite de test sans `positions`. */
function contenuEcrit(): Record<string, unknown> {
  const dossier = realpathSync(join(process.cwd(), "prototype", "programmes-test"));
  const programme = ProgrammeReduitSchema.parse(JSON.parse(readFileSync(join(dossier, `${TRIP_ID}.json`), "utf8")));
  const contenu: Partial<typeof programme> = structuredClone(programme);
  delete contenu.positions;
  return contenu;
}

type Requete = { texte: string; valeurs?: readonly unknown[] };

function poolSimule(reponses: { ids?: unknown[]; contenus?: unknown[]; echec?: boolean } = {}) {
  const requetes: Requete[] = [];
  let connexions = 0;
  const client: ClientSql = {
    async query(texte, valeurs) {
      requetes.push({ texte, valeurs });
      if (reponses.echec && texte !== "ROLLBACK") throw Object.assign(new Error("secret de la base"), { code: "08006" });
      if (texte === SQL_IDS) return { rows: (reponses.ids ?? []).map((id) => ({ id })) };
      if (texte === SQL_PROGRAMME) return { rows: (reponses.contenus ?? []).map((contenu) => ({ contenu })) };
      return { rows: [] };
    },
    release: () => undefined,
  };
  const pool: PoolSql = {
    connect: async () => {
      connexions += 1;
      return client;
    },
  };
  return { pool, requetes, connexions: () => connexions };
}

describe("p0: lecture des programmes réels (décision 0074)", () => {
  it("barrière fermée : aucune connexion, liste vide et voyage introuvable", async () => {
    const ouvrir = vi.fn(async () => null);
    const source = createSourceProgrammesReels({ pool: ouvrir });
    expect(await source.ids()).toEqual([]);
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

  it("lecture seule : chaque lecture est une transaction READ ONLY de requêtes SELECT, identifiant en paramètre lié", async () => {
    const simule = poolSimule({ ids: [TRIP_ID], contenus: [contenuEcrit()] });
    const source = createSourceProgrammesReels({ pool: async () => simule.pool });
    expect(await source.ids()).toEqual([TRIP_ID]);
    expect(await source.lire(TRIP_ID)).not.toBeNull();
    expect(simule.requetes.map((r) => r.texte)).toEqual(["BEGIN READ ONLY", SQL_IDS, "COMMIT", "BEGIN READ ONLY", SQL_PROGRAMME, "COMMIT"]);
    expect(simule.requetes.find((r) => r.texte === SQL_PROGRAMME)?.valeurs).toEqual([TRIP_ID]);
    for (const sql of [SQL_IDS, SQL_PROGRAMME]) {
      expect(sql.trimStart().startsWith("SELECT")).toBe(true);
      expect(sql).toContain("FROM prototype.programmes");
      expect(sql).toContain("expires_at > pg_catalog.now()");
      expect(sql).not.toMatch(/place_coordinates|INSERT|UPDATE|DELETE/i);
    }
  });

  it("programme servi sans positions : aucune carte, aucune durée, aucun appel de relecture", async () => {
    const simule = poolSimule({ ids: [TRIP_ID], contenus: [contenuEcrit()] });
    const adapter = createPrototypeAdapter({
      programmes: createSourceProgrammesReels({ pool: async () => simule.pool }),
      relecteurs: { trajets: null },
    });
    const [resume] = await adapter.listTrips(ctx);
    expect(resume?.id).toBe(TRIP_ID);
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

  it("autre organisation que celle du contexte : introuvable", async () => {
    const simule = poolSimule({ ids: [TRIP_ID], contenus: [contenuEcrit()] });
    const adapter = createPrototypeAdapter({ programmes: createSourceProgrammesReels({ pool: async () => simule.pool }), relecteurs: { trajets: null } });
    const autre = { ...ctx, organizationId: "5e1f0000-0000-4000-8000-0000000000ff" };
    expect(await adapter.listTrips(autre)).toEqual([]);
    expect(await adapter.getTrip(autre, TRIP_ID)).toBeNull();
  });

  it("erreur de base : EchecLectureProgrammes sans message de la base, ROLLBACK tenté", async () => {
    const simule = poolSimule({ echec: true });
    const source = createSourceProgrammesReels({ pool: async () => simule.pool });
    const erreur = await source.ids().catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(EchecLectureProgrammes);
    expect(String((erreur as Error).message)).not.toContain("secret");
    expect(simule.requetes.at(-1)?.texte).toBe("ROLLBACK");
  });

  it(`plus de ${PROGRAMMES_MAX} programmes : échec fermé, jamais une liste tronquée`, async () => {
    const ids = Array.from({ length: PROGRAMMES_MAX + 1 }, (_, i) => `proto_x_20261012_${i}`);
    const simule = poolSimule({ ids });
    const source = createSourceProgrammesReels({ pool: async () => simule.pool });
    await expect(source.ids()).rejects.toBeInstanceOf(EchecLectureProgrammes);
  });
});
