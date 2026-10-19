// @vitest-environment node
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { DayMapSchema, DaySchema, TripSchema } from "@/contracts";
import { cleTrajet, pairesDistinctes, pairesDuProgramme, PROTOTYPE_ORG_ID, ProgrammeReduitSchema } from "@/prototype/programme-reduit";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

import { createPrototypeAdapterReel, type PaireRelecture, type RelecteurTrajets } from "./prototype";
import {
  createSourceProgrammesReels,
  EchecLectureProgrammes,
  PositionsManquantes,
  PROGRAMMES_MAX,
  SQL_DELAI,
  SQL_LISTE,
  SQL_POSITIONS,
  SQL_PROGRAMME,
  SQL_TRAJETS,
  SQL_TRAJETS_PRESENTS,
} from "./prototype-lecture";
import { SQL_TRAJETS_PRESENTS as SQL_TRAJETS_PRESENTS_ECRITURE } from "./prototype-ecriture";

/**
 * Source des programmes réels (décision 0074, complétée par 0079 : P0r4) : client `pg` simulé. Lecture seule bornée,
 * barrière avant toute connexion, schéma unique, positions recomposées depuis `place_coordinates` (une position
 * manquante ou expirée : programme non servi), durées relues par le relecteur injecté.
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

/** Lignes de `place_coordinates` du programme de test (lignes non expirées, comme les rend la politique de lecture). */
function lignesPositions(sauf: readonly string[] = []) {
  return Object.entries(programmeComplet().positions)
    .filter(([placeId]) => !sauf.includes(placeId))
    .map(([place_id, { lat, lng }]) => ({ place_id, lat, lng }));
}

type Requete = { texte: string; valeurs?: readonly unknown[] };

function poolSimule(
  reponses: {
    contenus?: unknown[];
    /** Identifiant (`id`) de chaque programme de `contenus`, dans le même ordre ; absent : ligne sans `id`. */
    ids?: string[];
    positions?: Record<string, unknown>[];
    /** Présence de la table des temps conservés (`to_regclass`) ; temps conservés rendus par `SQL_TRAJETS`. */
    tablePresente?: boolean;
    trajets?: Record<string, unknown>[];
    /** Requête qui échoue (texte exact) ; `echec` : toutes. */
    echecSur?: string;
    echec?: boolean;
    connexionRefusee?: boolean;
  } = {},
) {
  const requetes: Requete[] = [];
  const liberations: unknown[] = [];
  const client: ClientSql = {
    async query(texte, valeurs) {
      requetes.push({ texte, valeurs });
      if ((reponses.echec || texte === reponses.echecSur) && texte !== "ROLLBACK") throw Object.assign(new Error("secret de la base"), { code: "08006" });
      if (texte === SQL_LISTE || texte === SQL_PROGRAMME) {
        return { rows: (reponses.contenus ?? []).map((contenu, rang) => (reponses.ids?.[rang] === undefined ? { contenu } : { id: reponses.ids[rang], contenu })) };
      }
      if (texte === SQL_TRAJETS_PRESENTS) return { rows: [{ presente: reponses.tablePresente ?? false }] };
      if (texte === SQL_TRAJETS) return { rows: reponses.trajets ?? [] };
      if (texte === SQL_POSITIONS) return { rows: reponses.positions ?? lignesPositions() };
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

/** Relecteur double : durée fixe par paire, appels comptés. */
function relecteurFixe(minutes = 11): RelecteurTrajets & { paires: PaireRelecture[][] } {
  const paires: PaireRelecture[][] = [];
  return {
    paires,
    async relireJournee(demandees) {
      paires.push([...demandees]);
      return { ok: true, minutes: demandees.map(() => minutes) };
    },
  };
}

describe("p0: lecture des programmes réels (décisions 0074 et 0079)", () => {
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

  it("lecture seule : transaction READ ONLY bornée par statement_timeout, SELECT fixes, valeurs en paramètres liés", async () => {
    const simule = poolSimule({ contenus: [contenuEcrit()] });
    const source = createSourceProgrammesReels({ pool: async () => simule.pool });
    expect((await source.lister()).map((p) => p.programme.trip.id)).toEqual([TRIP_ID]);
    expect((await source.lire(TRIP_ID))?.programme.trip.id).toBe(TRIP_ID);
    expect(simule.requetes.map((r) => r.texte)).toEqual([
      "BEGIN READ ONLY",
      SQL_DELAI,
      SQL_LISTE,
      SQL_POSITIONS,
      "COMMIT",
      "BEGIN READ ONLY",
      SQL_DELAI,
      SQL_PROGRAMME,
      SQL_POSITIONS,
      "COMMIT",
    ]);
    expect(SQL_DELAI).toMatch(/^SET LOCAL statement_timeout = \d+$/);
    expect(simule.requetes.find((r) => r.texte === SQL_PROGRAMME)?.valeurs).toEqual([TRIP_ID]);
    // Identifiants de lieu en un tableau lié : ceux du programme, triés, sans doublon.
    const ids = Object.keys(programmeComplet().positions).sort();
    expect(simule.requetes.filter((r) => r.texte === SQL_POSITIONS).map((r) => r.valeurs)).toEqual([[ids], [ids]]);
    expect(simule.liberations).toEqual([false, false]);
    for (const sql of [SQL_LISTE, SQL_PROGRAMME]) {
      expect(sql.trimStart().startsWith("SELECT")).toBe(true);
      expect(sql).toContain("FROM prototype.programmes");
      expect(sql).toContain("expires_at > pg_catalog.now()");
      expect(sql).not.toMatch(/place_coordinates|INSERT|UPDATE|DELETE/i);
    }
    expect(SQL_POSITIONS.trimStart().startsWith("SELECT place_id, lat, lng FROM public.place_coordinates")).toBe(true);
    expect(SQL_POSITIONS).toContain("place_id = ANY($1::text[])");
    expect(SQL_POSITIONS).toContain("expires_at > pg_catalog.now()");
    expect(SQL_POSITIONS).not.toMatch(/INSERT|UPDATE|DELETE|\$\{/i);
  });

  it("p0: position manquante ou expirée : programme non servi (état d'erreur existant, aucune position inventée)", async () => {
    const [manquante] = Object.keys(programmeComplet().positions);
    // Ligne absente ou expirée : la politique et le filtre `expires_at > now()` ne la rendent pas (même effet).
    const simule = poolSimule({ contenus: [contenuEcrit()], positions: lignesPositions([manquante!]) });
    const source = createSourceProgrammesReels({ pool: async () => simule.pool });
    expect(await source.lister()).toEqual([]);
    const erreur = await source.lire(TRIP_ID).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(PositionsManquantes);
    expect(String((erreur as Error).message)).not.toContain(manquante!);
    // Par l'adaptateur : absent de « Mes voyages », la page du voyage lève (état d'erreur, « Réessayer »), sans relecture.
    const relecteur = relecteurFixe();
    const adapter = createPrototypeAdapterReel({ programmes: source, relecteurs: { trajets: relecteur } });
    expect(await adapter.listTrips(ctx)).toEqual([]);
    await expect(adapter.getTrip(ctx, TRIP_ID)).rejects.toBeInstanceOf(PositionsManquantes);
    await expect(adapter.getDayMap(ctx, TRIP_ID, 1)).rejects.toBeInstanceOf(PositionsManquantes);
    expect(relecteur.paires).toEqual([]);
    // Position illisible (valeur non numérique) : échec fermé de la lecture, jamais une position corrigée.
    const illisible = lignesPositions().map((ligne, i) => (i === 0 ? { ...ligne, lat: "x" } : ligne));
    const casse = poolSimule({ contenus: [contenuEcrit()], positions: illisible });
    await expect(createSourceProgrammesReels({ pool: async () => casse.pool }).lire(TRIP_ID)).rejects.toBeInstanceOf(EchecLectureProgrammes);
  });

  it("positions d'un autre lieu ignorées ; aucune position de trop dans le programme recomposé", async () => {
    const simule = poolSimule({ contenus: [contenuEcrit()], positions: [...lignesPositions(), { place_id: "lieu_autre_hors_programme", lat: 1, lng: 2 }] });
    const programme = await createSourceProgrammesReels({ pool: async () => simule.pool }).lire(TRIP_ID);
    expect(programme?.programme.positions).toEqual(programmeComplet().positions);
  });

  it("« Mes voyages » : une seule connexion pour toute la liste", async () => {
    const autre = contenuEcrit();
    (autre.trip as { id: string }).id = "proto_test_20261012_2";
    const simule = poolSimule({ contenus: [contenuEcrit(), autre] });
    const relecteur = relecteurFixe();
    const adapter = createPrototypeAdapterReel({ programmes: createSourceProgrammesReels({ pool: async () => simule.pool }), relecteurs: { trajets: relecteur } });
    expect((await adapter.listTrips(ctx)).map((r) => r.id)).toEqual([TRIP_ID, "proto_test_20261012_2"]);
    expect(simule.connect).toHaveBeenCalledTimes(1);
    // Une seule requête de positions pour toute la liste ; la liste ne relit aucune durée (aucune dans `TripSummary`).
    expect(simule.requetes.filter((r) => r.texte === SQL_POSITIONS)).toHaveLength(1);
    expect(relecteur.paires).toEqual([]);
  });

  it("programme réel servi avec sa carte et ses durées relues (une relecture par journée, jamais gardée)", async () => {
    const simule = poolSimule({ contenus: [contenuEcrit()] });
    const relecteur = relecteurFixe(27);
    const adapter = createPrototypeAdapterReel({ programmes: createSourceProgrammesReels({ pool: async () => simule.pool }), relecteurs: { trajets: relecteur } });
    const trip = await adapter.getTrip(ctx, TRIP_ID);
    expect(trip).not.toBeNull();
    TripSchema.parse(trip);
    const segments = trip!.days.flatMap((jour) => jour.items.filter((item) => item.type === "segment"));
    expect(segments.length).toBeGreaterThan(0);
    for (const item of segments) expect(item.type === "segment" && item.segment).toEqual(expect.objectContaining({ minutes: 27, estimated: false }));
    for (const jour of trip!.days) {
      DaySchema.parse(jour);
      const nombre = jour.items.filter((item) => item.type === "segment").length;
      expect(jour.travelMinutes).toBe(27 * nombre);
    }
    // Une relecture par journée qui a des trajets ; chaque paire désigne deux lieux par leur seul identifiant.
    expect(relecteur.paires.length).toBe(trip!.days.filter((jour) => jour.items.some((item) => item.type === "segment")).length);
    // Deuxième affichage : nouvelle relecture, aucune durée gardée.
    await adapter.getTrip(ctx, TRIP_ID);
    expect(relecteur.paires.length).toBe(2 * trip!.days.filter((jour) => jour.items.some((item) => item.type === "segment")).length);
    // Carte : positions du programme recomposé, sur la carte de chaque jour.
    const cartes = await adapter.getTripMap(ctx, TRIP_ID);
    expect(cartes.length).toBeGreaterThan(0);
    for (const carte of cartes) DayMapSchema.parse(carte);
    const positions = Object.values(programmeComplet().positions);
    for (const point of cartes.flatMap((carte) => carte.points)) {
      expect(positions).toContainEqual({ lat: point.lat, lng: point.lng });
    }
  });

  it("relecture refusée : la journée est servie sans ses temps ni son total (décision 0092 § 4), jamais une durée inventée", async () => {
    const simule = poolSimule({ contenus: [contenuEcrit()] });
    for (const raison of ["quota_reached", "unavailable"] as const) {
      const adapter = createPrototypeAdapterReel({
        programmes: createSourceProgrammesReels({ pool: async () => simule.pool }),
        relecteurs: { trajets: { relireJournee: async () => ({ ok: false, raison }) } },
      });
      const trip = await adapter.getTrip(ctx, TRIP_ID);
      TripSchema.parse(trip);
      for (const jour of trip!.days) {
        expect(jour.travelMinutes).toBeNull();
        for (const item of jour.items) if (item.type === "segment") expect(item.segment.minutes).toBeNull();
      }
      expect((await adapter.getDay(ctx, TRIP_ID, 1))?.travelMinutes).toBeNull();
    }
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
    const adapter = createPrototypeAdapterReel({ programmes: createSourceProgrammesReels({ pool: async () => simule.pool }), relecteurs: { trajets: relecteurFixe() } });
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

describe("p0: temps conservés lus avec le programme (décision 0092 § 4 « Lecture » et § 5 point 6)", () => {
  const PROGRAMME_ID = "5e1f0000-0000-4000-8000-0000000000a1";
  const AUTRE_ID = "5e1f0000-0000-4000-8000-0000000000a2";
  const AUTRE_TRIP = "proto_test_20261012_2";

  /** Contenu écrit d'un second voyage (mêmes lieux, autre identifiant de voyage). */
  function contenuAutre(): Record<string, unknown> {
    const contenu = contenuEcrit() as { trip: { id: string } };
    return { ...contenu, trip: { ...contenu.trip, id: AUTRE_TRIP } };
  }

  /** Paires du programme de test, de la seule fonction qui les calcule. */
  const paires = () => pairesDistinctes(pairesDuProgramme(contenuEcrit() as never));
  const ligne = (paire: PaireRelecture, minutes: unknown, programmeId = PROGRAMME_ID) => ({
    programme_id: programmeId,
    mode: paire.mode,
    origine: paire.origine,
    destination: paire.destination,
    minutes,
  });
  const textes = (simule: ReturnType<typeof poolSimule>) => simule.requetes.map((r) => r.texte);

  it("SQL : SELECT fixes, en lecture seule, nom de table composé ; même test de présence que l'écriture", () => {
    expect(SQL_TRAJETS_PRESENTS).toBe(`SELECT pg_catalog.to_regclass('${["prototype", "trajets"].join(".")}') IS NOT NULL AS presente`);
    // Constante écrite deux fois (lecture, écriture) : toute dérive est refusée ici (mineur 7 de la revue de #507).
    expect(SQL_TRAJETS_PRESENTS_ECRITURE).toBe(SQL_TRAJETS_PRESENTS);
    expect(SQL_TRAJETS.trimStart().startsWith(`SELECT programme_id, mode, origine, destination, minutes FROM ${["prototype", "trajets"].join(".")}`)).toBe(true);
    expect(SQL_TRAJETS).toContain("programme_id = ANY($1::uuid[])");
    expect(SQL_TRAJETS).toContain("expires_at > pg_catalog.now()");
    expect(SQL_TRAJETS).not.toMatch(/INSERT|UPDATE|DELETE|\$\{/i);
  });

  it("(a) table absente : aucune requête sur la table, aucune erreur, programme servi sans temps, tout relu", async () => {
    const simule = poolSimule({ contenus: [contenuEcrit()], ids: [PROGRAMME_ID], tablePresente: false });
    const source = createSourceProgrammesReels({ pool: async () => simule.pool });
    const lu = await source.lire(TRIP_ID);
    expect(lu?.programme.trip.id).toBe(TRIP_ID);
    expect(lu?.trajets.size).toBe(0);
    expect(textes(simule)).toEqual(["BEGIN READ ONLY", SQL_DELAI, SQL_PROGRAMME, SQL_POSITIONS, SQL_TRAJETS_PRESENTS, "COMMIT"]);
    const liste = await source.lister();
    expect(liste.map((p) => [p.programme.trip.id, p.trajets.size])).toEqual([[TRIP_ID, 0]]);
    expect(textes(simule).filter((t) => t === SQL_TRAJETS)).toEqual([]);
    // Adaptateur : sans temps conservés, chaque paire est relue.
    const relecteur = relecteurFixe(7);
    const adapter = createPrototypeAdapterReel({ programmes: source, relecteurs: { trajets: relecteur } });
    expect(await adapter.getDay(ctx, TRIP_ID, 1)).not.toBeNull();
    expect(relecteur.paires.flat().length).toBeGreaterThan(0);
  });

  it("(b) table présente : une seule requête pour tous les programmes, identifiants triés en paramètre lié ; temps rendus par programme", async () => {
    const [premiere, seconde] = paires();
    const simule = poolSimule({
      contenus: [contenuEcrit(), contenuAutre()],
      ids: [PROGRAMME_ID, AUTRE_ID],
      tablePresente: true,
      trajets: [ligne(premiere!, 13), ligne(seconde!, 21, AUTRE_ID)],
    });
    const source = createSourceProgrammesReels({ pool: async () => simule.pool });
    const liste = await source.lister();
    const lectures = simule.requetes.filter((r) => r.texte === SQL_TRAJETS);
    expect(lectures).toHaveLength(1);
    expect(lectures[0]?.valeurs).toEqual([[PROGRAMME_ID, AUTRE_ID].sort()]);
    expect(textes(simule)).toEqual(["BEGIN READ ONLY", SQL_DELAI, SQL_LISTE, SQL_POSITIONS, SQL_TRAJETS_PRESENTS, SQL_TRAJETS, "COMMIT"]);
    const parVoyage = new Map(liste.map((p) => [p.programme.trip.id, p.trajets]));
    expect([...(parVoyage.get(TRIP_ID) ?? [])]).toEqual([[cleTrajet(premiere!), 13]]);
    expect([...(parVoyage.get(AUTRE_TRIP) ?? [])]).toEqual([[cleTrajet(seconde!), 21]]);
    // Un seul voyage : même requête, son seul identifiant.
    const seul = poolSimule({ contenus: [contenuEcrit()], ids: [PROGRAMME_ID], tablePresente: true, trajets: [ligne(premiere!, 13)] });
    const lu = await createSourceProgrammesReels({ pool: async () => seul.pool }).lire(TRIP_ID);
    expect(seul.requetes.find((r) => r.texte === SQL_TRAJETS)?.valeurs).toEqual([[PROGRAMME_ID]]);
    expect([...(lu?.trajets ?? [])]).toEqual([[cleTrajet(premiere!), 13]]);
  });

  it("(c) ligne hors forme ignorée, jamais corrigée : la paire est relue", async () => {
    const [valide, autre] = paires();
    const hors = [
      { ...ligne(autre!, 9), mode: "bike" },
      { ...ligne(autre!, 9), origine: "id avec espace" },
      { ...ligne(autre!, 9), destination: "x".repeat(300) },
      ligne(autre!, 2.5),
      ligne(autre!, -1),
      ligne(autre!, 1441),
      ligne(autre!, "9"),
      ligne(autre!, 9, AUTRE_ID),
      { ...ligne(autre!, 9), programme_id: 42 },
    ];
    const simule = poolSimule({ contenus: [contenuEcrit()], ids: [PROGRAMME_ID], tablePresente: true, trajets: [ligne(valide!, 13), ...hors] });
    const source = createSourceProgrammesReels({ pool: async () => simule.pool });
    const lu = await source.lire(TRIP_ID);
    expect([...(lu?.trajets ?? [])]).toEqual([[cleTrajet(valide!), 13]]);
    // L'adaptateur relit la paire écartée (et toute autre paire absente), jamais celle qui est conservée.
    const relecteur = relecteurFixe(7);
    const adapter = createPrototypeAdapterReel({ programmes: source, relecteurs: { trajets: relecteur } });
    await adapter.getTrip(ctx, TRIP_ID);
    const relues = new Set(relecteur.paires.flat().map(cleTrajet));
    expect(relues.has(cleTrajet(autre!))).toBe(true);
    expect(relues.has(cleTrajet(valide!))).toBe(false);
  });

  it("(d) échec de la requête des temps : EchecLectureProgrammes (état d'erreur existant), transaction annulée, client détruit", async () => {
    for (const echecSur of [SQL_TRAJETS_PRESENTS, SQL_TRAJETS]) {
      const simule = poolSimule({ contenus: [contenuEcrit()], ids: [PROGRAMME_ID], tablePresente: true, echecSur });
      const source = createSourceProgrammesReels({ pool: async () => simule.pool });
      const erreur = await source.lire(TRIP_ID).catch((e: unknown) => e);
      expect(erreur, echecSur).toBeInstanceOf(EchecLectureProgrammes);
      expect(String((erreur as Error).message)).not.toContain("secret");
      expect(textes(simule).at(-1)).toBe("ROLLBACK");
      expect(simule.liberations).toEqual([true]);
      await expect(source.lister()).rejects.toBeInstanceOf(EchecLectureProgrammes);
    }
  });
});
