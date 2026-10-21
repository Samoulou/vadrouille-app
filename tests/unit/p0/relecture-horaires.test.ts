// @vitest-environment node
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPrototypeAdapter, type RelecteurTrajets, type ReponseHoraires } from "@/adapters/prototype";
import type { DetailsLieu } from "@/grounding/interfaces";
import { ErreurAncrage } from "@/grounding/interfaces";
import { ProgrammeReduitSchema, PROTOTYPE_ORG_ID, type ProgrammeReduit } from "@/prototype/programme-reduit";
import { valeurCookieAcces } from "@/server/p0/acces";
import { creerRelecteurReel, SQL_PURGE_RECENTE, type DependancesRelecteur } from "@/server/p0/relecture";
import { TablePrixGoogleSchema } from "@/server/usage/cout-google";
import { forfaitRelecture, LIMITES_PROTOTYPE, type Forfait } from "@/server/usage/forfait";
import type { ClientSql, PoolSql, ReglesForfait } from "@/server/usage/neon";
import type { Plafond } from "@/server/usage/port";
import { PLAFONDS_RELECTURE, SKUS_FORFAIT } from "@/workflows/p0-run";
import prixGoogle from "../../../prototype/config/prix-google.json";

/**
 * T8 — relecture des horaires à l'affichage (décision 0116 § 5.3, admise par 0117) : une fiche par `placeId` distinct
 * d'une Journée, en mémoire, sous la même barrière et la même réservation que la relecture des trajets, sur la part
 * `details` du forfait de relecture ; seul le badge « à confirmer » en sort, calculé à la lecture et jamais écrit.
 */

const logEvent = vi.fn();
vi.mock("@/server/log", () => ({
  logEvent: (...args: unknown[]) => logEvent(...args),
  errorNameOf: (erreur: unknown) => (erreur instanceof Error ? erreur.name : undefined),
}));
vi.mock("@/server/p0/base", () => ({
  poolPrototype: () => {
    throw new Error("pool réel interdit dans les tests");
  },
}));

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_TARGET_ENV", undefined);
  vi.stubEnv("VADROUILLE_ENV", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  logEvent.mockClear();
});

const [NOM_CODE = "", NOM_BASE = ""] = Object.keys({ P0_RUN_TOKEN: 0, P0_DATABASE_URL: 0 });
const T0 = Date.UTC(2026, 9, 16, 15);
const CODE = randomBytes(32);
const COOKIE = valeurCookieAcces(CODE, T0);
const ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "p0-reel",
  P0_REAL_RUNS: "enabled",
  [NOM_BASE]: "postgres://exemple.invalid/p0",
  [NOM_CODE]: CODE.toString("hex"),
};

const TABLE = TablePrixGoogleSchema.parse(prixGoogle);
/** Forfait de relecture tel que configuré (part `details` à 0 : aucune valeur relevée). */
const FORFAIT_CONFIGURE: Forfait = forfaitRelecture(TABLE, SKUS_FORFAIT, PLAFONDS_RELECTURE);
/** Forfait propre au test, avec une part `details` : il ne relève aucun plafond de la configuration. */
const FORFAIT_TEST: Forfait = forfaitRelecture(TABLE, SKUS_FORFAIT, { ...PLAFONDS_RELECTURE, placesDetails: 8 });
const REGLES: ReglesForfait = { limites: LIMITES_PROTOTYPE, uniteQuotaRoutes: "elements", dureeMaxMs: 900_000 };

function poolSimule() {
  const requetes: string[] = [];
  const client: ClientSql = {
    async query(texte) {
      requetes.push(texte);
      if (texte === SQL_PURGE_RECENTE) return { rows: [{ recente: true }] };
      if (texte.includes("FROM bornes AS b LEFT JOIN prototype.forfaits")) {
        return {
          rows: [
            { jour_text_search: 0, jour_place_details: 0, jour_routes_requetes: 0, jour_routes_elements: 0, mois_google: 0, enveloppe_google: 0, mois_modeles: 0, enveloppe_modeles: 0 },
          ],
        };
      }
      return { rows: [] };
    },
    release: () => undefined,
  };
  const connect = vi.fn(async () => client);
  const pool: PoolSql = { connect };
  return { pool, requetes, connect, forfaitInscrit: () => requetes.some((r) => r.startsWith("INSERT INTO prototype.forfaits")) };
}

/** 2026-11-23 est un lundi (jour 1). Fiches doubles, en mémoire du test seulement. */
const DATE_LUNDI = "2026-11-23";
const FICHES: Record<string, Omit<DetailsLieu, "placeId"> | "introuvable"> = {
  lieu_ouvert: { statut: "OPERATIONAL", position: { lat: 55.95, lng: -3.19 }, horaires: [{ jour: 1, debut: 540, fin: 1080 }] },
  lieu_ferme_lundi: { statut: "OPERATIONAL", position: { lat: 55.95, lng: -3.19 }, horaires: [{ jour: 2, debut: 540, fin: 1080 }] },
  lieu_definitif: { statut: "CLOSED_PERMANENTLY", position: { lat: 55.95, lng: -3.19 }, horaires: [{ jour: 1, debut: 540, fin: 1080 }] },
  lieu_temporaire: { statut: "CLOSED_TEMPORARILY", position: { lat: 55.95, lng: -3.19 }, horaires: [{ jour: 1, debut: 540, fin: 1080 }] },
  lieu_horaires_inconnus: { position: { lat: 55.95, lng: -3.19 }, horaires: null },
  lieu_nuit: { statut: "OPERATIONAL", position: { lat: 55.95, lng: -3.19 }, horaires: [{ jour: 1, debut: 1200, fin: 1440, finLendemain: 120 }] },
  lieu_disparu: "introuvable",
};

function placesSimulees(echec?: Error) {
  const appels: string[] = [];
  const client = {
    async details(placeId: string): Promise<DetailsLieu> {
      appels.push(placeId);
      if (echec) throw echec;
      const fiche = FICHES[placeId];
      if (fiche === undefined || fiche === "introuvable") throw new ErreurAncrage("place_not_found");
      return { placeId, ...fiche };
    },
  };
  return { client, appels };
}

function relecteur(extra: Partial<DependancesRelecteur> = {}, places = placesSimulees()) {
  const base = poolSimule();
  const plafondsRecus: (readonly Plafond[])[] = [];
  const fabrique = vi.fn(async (_garde: unknown, _usage: unknown, plafonds: readonly Plafond[]) => {
    plafondsRecus.push(plafonds);
    return places.client;
  });
  const routes = vi.fn(async () => ({ matrice: async () => ({ secondes: [] }) }));
  const r = creerRelecteurReel({
    env: ENV,
    execArgv: [],
    maintenant: () => T0,
    cookie: async () => COOKIE,
    pool: () => base.pool,
    relecture: async () => ({ forfait: FORFAIT_TEST, regles: REGLES }),
    horaires: fabrique,
    routes,
    ...extra,
  });
  return { relecteur: r, base, fabrique, routes, places, plafondsRecus };
}

/** Programme de test avec la deuxième étape du premier jour sans `placeId` (lieu non vérifié, 0116 § 5.1). */
function programmeAvecEtapeSansLieu(): ProgrammeReduit {
  const brut = JSON.parse(readFileSync(join(process.cwd(), "prototype", "programmes-test", "proto_test_20261012_1.json"), "utf8")) as ProgrammeReduit;
  const jour = brut.trip.days[0]!;
  const rang = jour.items.findIndex((ligne) => ligne.type === "stop" && ligne.stop.placeId === "SENTINELLE_PLACE_ID_2");
  const ligne = jour.items[rang]!;
  if (ligne.type !== "stop") throw new Error("fixture");
  const stop = { ...ligne.stop };
  delete stop.placeId;
  // Aucun trajet vers une étape sans `placeId` : le segment qui la précède est retiré (pairesDuProgramme la saute).
  jour.items = [...jour.items.slice(0, rang - 1), { ...ligne, stop }, ...jour.items.slice(rang + 1)];
  return ProgrammeReduitSchema.parse(brut);
}

const ctx = { organizationId: PROTOTYPE_ORG_ID, userId: "user_test", role: "owner" as const };

describe("T8 : relecture des horaires à l'affichage (décision 0116 § 5.3)", () => {
  it("prototype: relecture des horaires à l'affichage, une fiche par placeId distinct, dans la part details du forfait de relecture", async () => {
    const { relecteur: r, base, fabrique, routes, places, plafondsRecus } = relecteur();
    const demandes = ["lieu_ouvert", "lieu_ferme_lundi", "lieu_ouvert", "lieu_definitif", "lieu_temporaire", "lieu_horaires_inconnus", "lieu_nuit", "lieu_disparu"];
    const reponse = await r.relireHoraires!(demandes, DATE_LUNDI);
    // Badge : fermé définitivement, ou fermé toute la journée (temporairement fermé compris) ; horaires inconnus,
    // ouverture après minuit du jour même ou lieu introuvable : aucun badge.
    expect(reponse).toEqual({ ok: true, aConfirmer: [false, true, false, true, true, false, false, false] });
    // Une fiche par placeId distinct, une seule réservation du forfait de relecture, aucun client Routes.
    expect(places.appels).toEqual([...new Set(demandes)]);
    expect(fabrique).toHaveBeenCalledTimes(1);
    expect(routes).not.toHaveBeenCalled();
    expect(base.forfaitInscrit()).toBe(true);
    expect(base.requetes.filter((texte) => texte.startsWith("INSERT INTO prototype.forfaits"))).toHaveLength(1);
    // Part `details` du forfait de relecture, seule.
    expect(plafondsRecus).toEqual([[{ portee: "execution", fournisseur: "google", methode: "places_details", maxRequetes: FORFAIT_TEST.placeDetailsRequetes, maxElements: 0 }]]);
    // Rien n'est journalisé ni écrit d'autre que la réservation.
    expect(logEvent).not.toHaveBeenCalled();
    expect(base.requetes.every((texte) => !Object.keys(FICHES).some((placeId) => texte.includes(placeId)))).toBe(true);

    // À l'affichage : badge sur l'étape sans placeId et sur l'étape fermée ; jamais dans le programme lu.
    const programme = programmeAvecEtapeSansLieu();
    const lu = JSON.stringify(programme);
    const appelsHoraires: { placeIds: readonly string[]; date: string }[] = [];
    const relecteurAffichage: RelecteurTrajets = {
      relireJournee: async (paires) => ({ ok: true, minutes: paires.map(() => 7) }),
      relireHoraires: async (placeIds, date): Promise<ReponseHoraires> => {
        appelsHoraires.push({ placeIds, date });
        return { ok: true, aConfirmer: placeIds.map((placeId) => placeId === "SENTINELLE_PLACE_ID_3") };
      },
    };
    const adaptateur = createPrototypeAdapter({
      programmes: { ids: async () => [programme.trip.id], lire: async (id) => (id === programme.trip.id ? structuredClone(programme) : null) },
      relecteurs: { trajets: relecteurAffichage },
    });
    const jour = await adaptateur.getDay(ctx, programme.trip.id, 1);
    const etapes = (jour?.items ?? []).flatMap((ligne) => (ligne.type === "stop" ? [ligne.stop] : []));
    expect(appelsHoraires).toEqual([{ placeIds: ["SENTINELLE_PLACE_ID_1", "SENTINELLE_PLACE_ID_3", "SENTINELLE_PLACE_ID_4"], date: programme.trip.days[0]!.date }]);
    expect(etapes.map((stop) => stop.exceptions.includes("toConfirm"))).toEqual([false, true, true, false]);
    expect(etapes[1]?.placeId).toBeUndefined();
    // p0: toConfirm jamais stocké, calculé à la lecture (A7).
    expect(lu).not.toContain("toConfirm");
    expect(JSON.stringify(programme)).toBe(lu);
  });

  it("prototype: relecture des horaires refusée ou part épuisée, page rendue sans badge horaire, rien d'écrit ni journalisé", async () => {
    // Part `details` du forfait configuré (0 aujourd'hui, aucune valeur relevée) : refus avant la garde, sans connexion,
    // sans réservation, sans fiche ni journal.
    const epuisee = relecteur({ relecture: async () => ({ forfait: FORFAIT_CONFIGURE, regles: REGLES }) });
    expect(FORFAIT_CONFIGURE.placeDetailsRequetes).toBe(PLAFONDS_RELECTURE.placesDetails);
    expect(await epuisee.relecteur.relireHoraires!(["lieu_ouvert"], DATE_LUNDI)).toEqual({ ok: false, raison: "quota_reached" });
    expect(epuisee.base.connect).not.toHaveBeenCalled();
    expect(epuisee.fabrique).not.toHaveBeenCalled();
    expect(epuisee.places.appels).toEqual([]);

    // Garde fermée (sans cookie) : aucune connexion, aucune fiche.
    const sansCookie = relecteur({ cookie: async () => undefined });
    expect(await sansCookie.relecteur.relireHoraires!(["lieu_ferme_lundi"], DATE_LUNDI)).toEqual({ ok: false, raison: "unavailable" });
    expect(sansCookie.base.connect).not.toHaveBeenCalled();
    expect(sansCookie.places.appels).toEqual([]);

    // Fiche en échec (Google indisponible) : refus, aucun badge, aucun journal (ni identifiant, ni statut, ni horaire).
    const enEchec = relecteur({}, placesSimulees(Object.assign(new Error("SENTINELLE lieu_ferme_lundi"), { code: "upstream_unavailable" })));
    expect(await enEchec.relecteur.relireHoraires!(["lieu_ferme_lundi"], DATE_LUNDI)).toEqual({ ok: false, raison: "unavailable" });
    expect(logEvent).not.toHaveBeenCalled();
    expect(enEchec.base.requetes.some((texte) => texte.includes("lieu_ferme_lundi"))).toBe(false);

    // Page rendue sans badge horaire : seul le badge d'une étape sans placeId reste (fait stocké, 0116 § 5.1).
    const programme = programmeAvecEtapeSansLieu();
    for (const relireHoraires of [
      async (): Promise<ReponseHoraires> => ({ ok: false, raison: "quota_reached" }),
      async (): Promise<ReponseHoraires> => ({ ok: false, raison: "unavailable" }),
      async (): Promise<ReponseHoraires> => {
        throw new Error("relecteur");
      },
      async (): Promise<ReponseHoraires> => ({ ok: true, aConfirmer: [true] }),
      undefined,
    ]) {
      const adaptateur = createPrototypeAdapter({
        programmes: { ids: async () => [programme.trip.id], lire: async (id) => (id === programme.trip.id ? structuredClone(programme) : null) },
        relecteurs: { trajets: { relireJournee: async (paires) => ({ ok: true, minutes: paires.map(() => 7) }), ...(relireHoraires ? { relireHoraires } : {}) } },
      });
      const jour = await adaptateur.getDay(ctx, programme.trip.id, 1);
      const badges = (jour?.items ?? []).flatMap((ligne) => (ligne.type === "stop" ? [ligne.stop.exceptions.includes("toConfirm")] : []));
      expect(badges).toEqual([false, true, false, false]);
    }
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("p0: toConfirm jamais stocké, calculé à la lecture", async () => {
    const programme = programmeAvecEtapeSansLieu();
    // Stocké : aucune étape ne porte toConfirm ; l'étape sans placeId n'a ni position ni trajet.
    expect(JSON.stringify(programme)).not.toContain("toConfirm");
    const sansLieu = programme.trip.days[0]!.items.find((ligne) => ligne.type === "stop" && ligne.stop.placeId === undefined);
    expect(sansLieu).toBeDefined();
    const rang = programme.trip.days[0]!.items.indexOf(sansLieu!);
    expect(programme.trip.days[0]!.items[rang - 1]?.type).not.toBe("segment");
    // Lu : badge sur l'étape sans placeId, aucun autre sans relecture des horaires ; le programme source reste intact.
    const adaptateur = createPrototypeAdapter({
      programmes: { ids: async () => [programme.trip.id], lire: async (id) => (id === programme.trip.id ? structuredClone(programme) : null) },
      relecteurs: { trajets: { relireJournee: async (paires) => ({ ok: true, minutes: paires.map(() => 7) }) } },
    });
    const voyage = await adaptateur.getTrip(ctx, programme.trip.id);
    const badges = voyage!.days[0]!.items.flatMap((ligne) => (ligne.type === "stop" ? [ligne.stop.placeId === undefined, ligne.stop.exceptions.includes("toConfirm")] : []));
    for (let i = 0; i < badges.length; i += 2) expect(badges[i + 1]).toBe(badges[i]);
    expect(JSON.stringify(programme)).not.toContain("toConfirm");
  });
});
