// @vitest-environment node
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import type { PortPositions, PositionGoogleFraiche } from "@/grounding/port-positions";
import { creerPortPositions } from "@/server/positions/cache-positions";
import { EchecPositions, lirePositions } from "@/server/positions/lecture";

/**
 * Port du cache de positions et sa lecture, sur un client `pg` simulé (décision 0060 § 1.2, § 1.3 et § 4) : tests
 * `coordonnées:` sans base. Les tests de la base sont dans `tests/db/coordonnees.test.ts`.
 */

/** Sentinelles : aucune ne doit apparaître dans le texte d'une requête ni dans un journal. */
const SENTINELLE_PLACE = "ChIJSentinelleB8c";
const SENTINELLE_LAT = 12.3456789;
const SENTINELLE_LNG = -98.7654321;

type Appel = { texte: string; valeurs: readonly unknown[] };

/** Client simulé : enregistre chaque requête ; `reponse` rend les lignes ou lève l'erreur voulue. */
function client(reponse: (appel: Appel) => readonly Record<string, unknown>[] | Error = () => []) {
  const appels: Appel[] = [];
  return {
    appels,
    async query(texte: string, valeurs: readonly unknown[]) {
      const appel = { texte, valeurs };
      appels.push(appel);
      const r = reponse(appel);
      if (r instanceof Error) throw r;
      return { rows: r };
    },
  };
}

const erreurSql = (code: string) => Object.assign(new Error(`échec ${SENTINELLE_PLACE} ${SENTINELLE_LAT}`), { code, detail: SENTINELLE_PLACE });
const fraiches = (entrees: [string, number, number][]) =>
  new Map(entrees.map(([placeId, lat, lng]) => [placeId, { lat, lng } as PositionGoogleFraiche]));
const ids = (n: number, prefixe = "ChIJ") => Array.from({ length: n }, (_, i) => `${prefixe}${i}`);

const MAINTENANT = Date.UTC(2026, 9, 17, 12, 0, 0);
const MINUTE = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MAINTENANT);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("coordonnées: écrites par un seul module, en paramètres liés", () => {
  it("aucune sentinelle de placeId ni de coordonnée dans le texte des requêtes de lecture.ts et cache-positions.ts", async () => {
    const c = client(({ texte }) => (texte.startsWith("SELECT place_id") ? [{ place_id: SENTINELLE_PLACE, lat: SENTINELLE_LAT, lng: SENTINELLE_LNG }] : []));
    const port = creerPortPositions(c);
    expect(await port.lire([SENTINELLE_PLACE])).toEqual({ ok: true, valeur: new Map([[SENTINELLE_PLACE, { lat: SENTINELLE_LAT, lng: SENTINELLE_LNG }]]) });
    expect(await port.ecrire(fraiches([[SENTINELLE_PLACE, SENTINELLE_LAT, SENTINELLE_LNG]]), MAINTENANT)).toEqual({ ok: true, valeur: undefined });
    expect(c.appels).toHaveLength(2);
    for (const { texte } of c.appels) {
      expect(texte).not.toContain(SENTINELLE_PLACE);
      expect(texte).not.toContain(String(SENTINELLE_LAT));
      expect(texte).not.toContain(String(SENTINELLE_LNG));
    }
    expect(c.appels[0]).toEqual({
      texte: "SELECT place_id, lat, lng FROM public.place_coordinates WHERE place_id = ANY($1::text[])",
      valeurs: [[SENTINELLE_PLACE]],
    });
    expect(c.appels[1]).toEqual({
      texte: "SELECT public.store_place_coordinates(p, la, ln) FROM unnest($1::text[], $2::double precision[], $3::double precision[]) AS t(p, la, ln)",
      valeurs: [[SENTINELLE_PLACE], [SENTINELLE_LAT], [SENTINELLE_LNG]],
    });
  });

  it("aucun appel de journal qui porte une sentinelle, en succès comme en échec", async () => {
    const espions = (["log", "info", "warn", "error", "debug", "trace"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const succes = client(() => [{ place_id: SENTINELLE_PLACE, lat: SENTINELLE_LAT, lng: SENTINELLE_LNG }]);
    await creerPortPositions(succes).lire([SENTINELLE_PLACE]);
    await creerPortPositions(client(() => [])).ecrire(fraiches([[SENTINELLE_PLACE, SENTINELLE_LAT, SENTINELLE_LNG]]), MAINTENANT);
    const echec = client(() => erreurSql("08006"));
    await creerPortPositions(echec).lire([SENTINELLE_PLACE]);
    await creerPortPositions(echec).ecrire(fraiches([[SENTINELLE_PLACE, SENTINELLE_LAT, SENTINELLE_LNG]]), MAINTENANT);
    await expect(lirePositions(echec, [SENTINELLE_PLACE])).rejects.toBeInstanceOf(EchecPositions);
    for (const espion of espions) {
      for (const args of espion.mock.calls) {
        const texte = args.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
        expect(texte).not.toContain(SENTINELLE_PLACE);
        expect(texte).not.toContain(String(SENTINELLE_LAT));
      }
    }
  });
});

describe("coordonnées: lot refusé en entier", () => {
  const verifierRefus = async (positions: Map<string, PositionGoogleFraiche>, obtenuesA: number, code: string) => {
    const c = client();
    expect(await creerPortPositions(c).ecrire(positions, obtenuesA), code).toEqual({ ok: false, code, retryable: false });
    expect(c.appels).toEqual([]);
  };
  const ecrit = async (obtenuesA: number) => {
    const c = client();
    expect(await creerPortPositions(c).ecrire(fraiches([["ChIJa", 1, 1]]), obtenuesA)).toEqual({ ok: true, valeur: undefined });
    expect(c.appels).toHaveLength(1);
  };

  it("entrée hors forme, coordonnée hors bornes ou plus de 500 entrées : entree_invalide, aucune requête", async () => {
    await verifierRefus(fraiches([["ChIJa", 1, 1], ["hors forme!", 1, 1]]), MAINTENANT, "entree_invalide");
    await verifierRefus(fraiches([["", 1, 1]]), MAINTENANT, "entree_invalide");
    await verifierRefus(fraiches([["x".repeat(257), 1, 1]]), MAINTENANT, "entree_invalide");
    await verifierRefus(fraiches([["ChIJa", 90.0001, 1]]), MAINTENANT, "entree_invalide");
    await verifierRefus(fraiches([["ChIJa", 1, -180.0001]]), MAINTENANT, "entree_invalide");
    await verifierRefus(fraiches([["ChIJa", Number.NaN, 1]]), MAINTENANT, "entree_invalide");
    await verifierRefus(fraiches([["ChIJa", 1, Number.POSITIVE_INFINITY]]), MAINTENANT, "entree_invalide");
    await verifierRefus(fraiches(ids(501).map((id) => [id, 1, 1])), MAINTENANT, "entree_invalide");
    await verifierRefus(fraiches([["ChIJa", 1, 1]]), MAINTENANT + 0.5, "entree_invalide");
    // 500 entrées passent, en une requête.
    const c = client();
    expect(await creerPortPositions(c).ecrire(fraiches(ids(500).map((id) => [id, 90, -180])), MAINTENANT)).toEqual({ ok: true, valeur: undefined });
    expect(c.appels).toHaveLength(1);
  });

  it("fraîcheur : 60 min 1 s perimees, 59 min écriture ; 61 s dans le futur perimees, 59 s écriture (horloge simulée)", async () => {
    await verifierRefus(fraiches([["ChIJa", 1, 1]]), MAINTENANT - 60 * MINUTE - 1_000, "perimees");
    await ecrit(MAINTENANT - 59 * MINUTE);
    await verifierRefus(fraiches([["ChIJa", 1, 1]]), MAINTENANT + 61_000, "perimees");
    await ecrit(MAINTENANT + 59_000);
  });

  it("Map vide : ok, aucune requête, aucun contrôle de fraîcheur", async () => {
    const c = client();
    expect(await creerPortPositions(c).ecrire(new Map(), 0)).toEqual({ ok: true, valeur: undefined });
    expect(c.appels).toEqual([]);
  });
});

describe("coordonnées: lecture par lots", () => {
  const echo = () => client(({ valeurs }) => (valeurs[0] as string[]).map((placeId) => ({ place_id: placeId, lat: 1, lng: 2 })));

  it("501 identifiants distincts : 2 requêtes, résultats fusionnés", async () => {
    const c = echo();
    const r = await creerPortPositions(c).lire(ids(501));
    expect(c.appels.map((a) => (a.valeurs[0] as string[]).length)).toEqual([500, 1]);
    expect(r.ok && r.valeur.size).toBe(501);
  });

  it("1 000 identifiants dont 500 doublons : 1 requête", async () => {
    const c = echo();
    const r = await creerPortPositions(c).lire([...ids(500), ...ids(500)]);
    expect(c.appels).toHaveLength(1);
    expect(r.ok && r.valeur.size).toBe(500);
  });

  it("5 001 identifiants distincts : entree_invalide, aucune requête ; 5 000 : 10 requêtes", async () => {
    const c = echo();
    expect(await creerPortPositions(c).lire(ids(5_001))).toEqual({ ok: false, code: "entree_invalide", retryable: false });
    expect(c.appels).toEqual([]);
    const r = await creerPortPositions(c).lire(ids(5_000));
    expect(c.appels).toHaveLength(10);
    expect(r.ok && r.valeur.size).toBe(5_000);
  });

  it("liste vide : Map vide, aucune requête ; identifiant hors forme : entree_invalide, aucune requête", async () => {
    const c = echo();
    expect(await creerPortPositions(c).lire([])).toEqual({ ok: true, valeur: new Map() });
    expect(await creerPortPositions(c).lire(["ChIJa", "a b"])).toEqual({ ok: false, code: "entree_invalide", retryable: false });
    expect(c.appels).toEqual([]);
  });

  it("absent du cache : absent de la Map ; ligne illisible : base", async () => {
    const c = client(() => [{ place_id: "ChIJa", lat: 1, lng: 2 }]);
    expect(await creerPortPositions(c).lire(["ChIJa", "ChIJb"])).toEqual({ ok: true, valeur: new Map([["ChIJa", { lat: 1, lng: 2 }]]) });
    for (const ligne of [{ place_id: "ChIJautre", lat: 1, lng: 2 }, { place_id: "ChIJa", lat: "1", lng: 2 }, { place_id: "ChIJa", lat: 91, lng: 2 }]) {
      expect(await creerPortPositions(client(() => [ligne])).lire(["ChIJa"])).toEqual({ ok: false, code: "base", retryable: false });
    }
  });
});

describe("coordonnées: erreur réduite à son code", () => {
  it("ni message, ni paramètre ; retryable pour les seules classes 08 et 40", async () => {
    for (const [sqlstate, retryable] of [
      ["08006", true],
      ["40001", true],
      ["40P01", true],
      ["42501", false],
      ["23514", false],
      ["57014", false],
      ["XX000", false],
    ] as const) {
      const ecriture = await creerPortPositions(client(() => erreurSql(sqlstate))).ecrire(fraiches([[SENTINELLE_PLACE, SENTINELLE_LAT, 1]]), MAINTENANT);
      expect(ecriture, sqlstate).toEqual({ ok: false, code: "base", retryable });
      const lecture = await creerPortPositions(client(() => erreurSql(sqlstate))).lire([SENTINELLE_PLACE]);
      expect(lecture, sqlstate).toEqual({ ok: false, code: "base", retryable });
      expect(JSON.stringify([ecriture, lecture])).not.toMatch(new RegExp(`${SENTINELLE_PLACE}|${SENTINELLE_LAT}|${sqlstate}|échec`));
    }
    // Erreur sans code, ou code hors forme : base, non rejouable.
    for (const erreur of [new Error(SENTINELLE_PLACE), Object.assign(new Error("x"), { code: "08006 ; DROP" }), Object.assign(new Error("x"), { code: 8006 })]) {
      expect(await creerPortPositions(client(() => erreur)).ecrire(fraiches([["ChIJa", 1, 1]]), MAINTENANT)).toEqual({ ok: false, code: "base", retryable: false });
      expect(await creerPortPositions(client(() => erreur)).lire(["ChIJa"])).toEqual({ ok: false, code: "base", retryable: false });
    }
  });

  it("EchecPositions : code fermé et SQLSTATE seuls, jamais l'erreur d'origine", async () => {
    const erreur = await lirePositions(client(() => erreurSql("42501")), ["ChIJa"]).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(EchecPositions);
    expect(erreur).toMatchObject({ code: "base", sqlstate: "42501" });
    expect(String((erreur as Error).message)).not.toContain(SENTINELLE_PLACE);
    expect(Object.keys(erreur as object).sort()).toEqual(["code", "name", "sqlstate"]);
    const horsForme = await lirePositions(client(() => Object.assign(new Error("x"), { code: "pas un code" })), ["ChIJa"]).catch((e: unknown) => e);
    expect(horsForme).toMatchObject({ code: "base", sqlstate: undefined });
  });
});

describe("coordonnées: marque de fraîcheur", () => {
  it("passer à ecrire la valeur rendue par lire ne compile pas", async () => {
    const port: PortPositions = creerPortPositions(client());
    const lu = await port.lire(["ChIJa"]);
    if (lu.ok) {
      // @ts-expect-error — une position lue n'est jamais réécrite (0060 § 1.1 et § 1.3).
      await port.ecrire(lu.valeur, MAINTENANT);
      // @ts-expect-error — une coordonnée sans marque non plus.
      await port.ecrire(new Map([["ChIJa", { lat: 1, lng: 2 }]]), MAINTENANT);
    }
    expectTypeOf<ReadonlyMap<string, { lat: number; lng: number }>>().not.toMatchTypeOf<ReadonlyMap<string, PositionGoogleFraiche>>();
    expectTypeOf<PositionGoogleFraiche>().toMatchTypeOf<{ lat: number; lng: number }>();
  });
});
