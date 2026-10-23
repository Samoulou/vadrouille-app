// @vitest-environment node
import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClientPhotosLieu, PhotoLieu } from "@/grounding/interfaces";
import { ErreurClientGoogle } from "@/grounding/enveloppe-google";
import { valeurCookieAcces } from "@/server/p0/acces";
import { ErreurAncrage } from "@/grounding/interfaces";
import { creerPhotosEssai, LARGEUR_PHOTO_PX, MAX_PHOTOS_PAR_HEURE, SKUS_PHOTO, type DependancesPhotos } from "@/server/p0/photos";
import { TablePrixGoogleSchema } from "@/server/usage/cout-google";
import { forfaitPhoto, LIMITES_PROTOTYPE, type LimitesForfait } from "@/server/usage/forfait";
import type { ClientSql, PoolSql, ReglesForfait } from "@/server/usage/neon";
import prixGoogle from "../../../prototype/config/prix-google.json";

/**
 * Photos du tri d'un voyage d'essai (décision 0128) : même barrière que la relecture (garde du mode réel, cookie
 * d'accès), forfait de photo réservé en base, puis le client des photos ; aucune connexion ni aucun appel avant la
 * barrière ; jamais une levée ni une donnée Google dans le journal.
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
const T0 = Date.UTC(2026, 9, 23, 15);
const CODE = randomBytes(32);
const COOKIE = valeurCookieAcces(CODE, T0);
const PLACE_ID = "SENTINELLE_PLACE_PHOTO";
/** Lieu de la proposition du voyage demandé, tel que l'adaptateur le lit (`photoLieuEssai`). */
const LIEU = async () => PLACE_ID;
const PHOTO: PhotoLieu = {
  uri: "https://lh3.googleusercontent.com/place-photos/SENTINELLE-IMAGE",
  auteurs: [{ nom: "Ana Sentinelle", lien: "https://maps.google.com/maps/contrib/1" }, { nom: "Luís" }],
  lienGoogleMaps: "https://www.google.com/maps/SENTINELLE",
};

function preversion(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "p0-reel",
    P0_REAL_RUNS: "enabled",
    [NOM_BASE]: "postgres://exemple.invalid/p0",
    [NOM_CODE]: CODE.toString("hex"),
    ...extra,
  };
}

const TABLE = TablePrixGoogleSchema.parse(prixGoogle);
const FORFAIT = forfaitPhoto(TABLE, SKUS_PHOTO);
const regles = (limites: LimitesForfait = LIMITES_PROTOTYPE): ReglesForfait => ({ limites, uniteQuotaRoutes: "elements", dureeMaxMs: 900_000 });

/**
 * Base simulée : sommes des forfaits, et photos de l'heure (`photosDeLHeure` au départ, plus une par forfait de la forme
 * d'une photo inscrit ensuite), comme la requête de `reserverPhoto` les compterait.
 */
function poolSimule({ moisGoogle = 0, photosDeLHeure = 0 } = {}) {
  const requetes: string[] = [];
  const parametres: unknown[][] = [];
  let photos = photosDeLHeure;
  const client: ClientSql = {
    async query(texte, valeurs) {
      requetes.push(texte);
      parametres.push([...(valeurs ?? [])]);
      if (texte.includes("AND created_at > pg_catalog.now() - interval '1 hour'")) return { rows: [{ n: String(photos) }] };
      if (texte.startsWith("INSERT INTO prototype.forfaits")) photos += 1;
      if (texte.includes("FROM bornes AS b LEFT JOIN prototype.forfaits")) {
        return {
          rows: [
            {
              jour_text_search: 0,
              jour_place_details: 0,
              jour_routes_requetes: 0,
              jour_routes_elements: 0,
              mois_google: moisGoogle,
              enveloppe_google: 0,
              mois_modeles: 0,
              enveloppe_modeles: 0,
            },
          ],
        };
      }
      return { rows: [] };
    },
    release: () => undefined,
  };
  const connect = vi.fn(async () => client);
  const inscrits = () => requetes.filter((r) => r.startsWith("INSERT INTO prototype.forfaits")).length;
  return { pool: { connect } as PoolSql, requetes, parametres, connect, inscrits, forfaitInscrit: () => inscrits() > 0 };
}

function service(extra: Partial<DependancesPhotos> = {}, client: ClientPhotosLieu = { photo: vi.fn(async () => PHOTO) }, base = poolSimule()) {
  const fabrique = vi.fn(async () => client);
  const photos = creerPhotosEssai({
    env: preversion(),
    execArgv: [],
    maintenant: () => T0,
    cookie: async () => COOKIE,
    pool: () => base.pool,
    reglage: async () => ({ forfait: FORFAIT, regles: regles() }),
    photos: fabrique,
    ...extra,
  });
  return { photos, fabrique, client, base };
}

describe("essai: forfait d'une photo (décision 0128)", () => {
  it("nature relecture, deux fiches, 0,007 USD au prix plein (liste IDs only gratuite, média 7 USD les 1 000)", () => {
    // Mêmes SKU que le client (`SKU_PHOTOS`, `SKU_MEDIA_PHOTO` de `places-client.ts`, vérifiés par son test).
    expect(SKUS_PHOTO).toEqual({ liste: "places_details_essentials_ids_only", media: "places_details_photos" });
    expect(FORFAIT).toEqual({
      nature: "relecture",
      textSearchRequetes: 0,
      placeDetailsRequetes: 2,
      routesRequetes: 0,
      routesElements: 0,
      coutGoogleMicros: 7_000,
      coutModelesMicros: null,
    });
    expect(TABLE.skus.places_details_photos).toEqual({ methode: "places_details", unite: "requete", gratuitParMois: 1000, prixPour1000: 7 });
  });
});

describe("essai: photo sans barrière : null, aucune connexion, aucun appel", () => {
  it.each<[string, Partial<DependancesPhotos>]>([
    ["sans cookie", { cookie: async () => undefined }],
    ["cookie signé par un autre code", { cookie: async () => valeurCookieAcces(randomBytes(32), T0) }],
    ["cookie expiré", { maintenant: () => T0 + 12 * 3_600_000 }],
    ["autre branche", { env: preversion({ VERCEL_GIT_COMMIT_REF: "main" }) }],
    ["mode réel non activé", { env: preversion({ P0_REAL_RUNS: undefined }) }],
    ["production", { env: preversion({ VERCEL_ENV: "production" }) }],
    ["cookies() hors requête", { cookie: async () => Promise.reject(new Error("hors requête")) }],
  ])("%s", async (_cas, extra) => {
    const reglage = vi.fn(async () => ({ forfait: FORFAIT, regles: regles() }));
    const lieu = vi.fn(LIEU);
    const { photos, fabrique, base } = service({ ...extra, reglage });
    expect(await photos.photo(lieu)).toBeNull();
    // Aucune lecture du voyage avant la garde et le cookie.
    expect(lieu).not.toHaveBeenCalled();
    expect(base.connect).not.toHaveBeenCalled();
    expect(reglage).not.toHaveBeenCalled();
    expect(fabrique).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });
});

describe("essai: lieu hors du voyage demandé (F13-TL-2, bloquant 2 de la revue du head `8232ddb`)", () => {
  it("lieu lu garde ouverte, avant la réservation ; null (autre voyage, sans lieu) : aucune réservation, aucun appel, aucun journal", async () => {
    const { photos, fabrique, base } = service();
    const lieu = vi.fn(async () => null);
    expect(await photos.photo(lieu)).toBeNull();
    expect(lieu).toHaveBeenCalledTimes(1);
    expect(base.connect).not.toHaveBeenCalled();
    expect(base.forfaitInscrit()).toBe(false);
    expect(fabrique).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("lecture du voyage qui lève : null, aucune réservation ni appel", async () => {
    const { photos, fabrique, base } = service();
    expect(await photos.photo(async () => Promise.reject(new Error("base")))).toBeNull();
    expect(base.forfaitInscrit()).toBe(false);
    expect(fabrique).not.toHaveBeenCalled();
  });
});

describe("essai: photo servie", () => {
  it("forfait inscrit en base, client appelé avec la largeur de la carte, contrat rendu (noms anglais, liens gardés)", async () => {
    const { photos, client, base } = service();
    expect(await photos.photo(LIEU)).toEqual({
      url: PHOTO.uri,
      authors: [{ name: "Ana Sentinelle", profileUrl: "https://maps.google.com/maps/contrib/1" }, { name: "Luís" }],
      mapsUrl: "https://www.google.com/maps/SENTINELLE",
    });
    expect(client.photo).toHaveBeenCalledWith(PLACE_ID, LARGEUR_PHOTO_PX);
    expect(base.forfaitInscrit()).toBe(true);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("aucune photo du lieu : null, forfait inscrit, aucun journal", async () => {
    const { photos } = service({}, { photo: vi.fn(async () => null) });
    expect(await photos.photo(LIEU)).toBeNull();
    expect(logEvent).not.toHaveBeenCalled();
  });
});

describe("essai: cadence des photos, comptée en base (F13-TL-2, bloquant 3 de la revue du head `8232ddb`)", () => {
  it("borne de 40 photos par heure glissante", () => {
    expect(MAX_PHOTOS_PAR_HEURE).toBe(40);
  });

  it("Nème appel refusé : null sans appel Google (40 servies dans l'heure, la 41e refusée, rien d'inscrit)", async () => {
    const base = poolSimule();
    const client: ClientPhotosLieu = { photo: vi.fn(async () => PHOTO) };
    const { photos, fabrique } = service({}, client, base);
    for (let i = 0; i < MAX_PHOTOS_PAR_HEURE; i++) expect(await photos.photo(LIEU)).not.toBeNull();
    expect(client.photo).toHaveBeenCalledTimes(MAX_PHOTOS_PAR_HEURE);
    expect(base.inscrits()).toBe(MAX_PHOTOS_PAR_HEURE);

    expect(await photos.photo(LIEU)).toBeNull();
    expect(client.photo).toHaveBeenCalledTimes(MAX_PHOTOS_PAR_HEURE);
    expect(fabrique).toHaveBeenCalledTimes(MAX_PHOTOS_PAR_HEURE);
    expect(base.inscrits()).toBe(MAX_PHOTOS_PAR_HEURE);
    expect(base.requetes).toContain("ROLLBACK");
    expect(logEvent).toHaveBeenCalledWith("essai.photo_unavailable", { errorName: "PlafondAtteint" }, "warn");
  });

  it("compte sous le verrou des forfaits, avant les sommes, sur la forme exacte du forfait de photo", async () => {
    const base = poolSimule({ photosDeLHeure: 3 });
    const { photos } = service({}, undefined, base);
    expect(await photos.photo(LIEU)).not.toBeNull();
    const verrou = base.requetes.findIndex((r) => r.includes("pg_advisory_xact_lock"));
    const compte = base.requetes.findIndex((r) => r.includes("interval '1 hour'"));
    const sommes = base.requetes.findIndex((r) => r.includes("FROM bornes AS b LEFT JOIN prototype.forfaits"));
    expect(verrou).toBeGreaterThan(-1);
    expect(compte).toBeGreaterThan(verrou);
    expect(sommes).toBeGreaterThan(compte);
    expect(base.requetes[compte]).toContain("nature = 'relecture' AND run_id IS NULL");
    expect(base.parametres[compte]).toEqual([0, 2, 0, 0, 7_000]);
  });

  it("compte illisible : échec fermé, aucun appel", async () => {
    const base = poolSimule();
    const lecture = base.pool.connect;
    const pool: PoolSql = {
      connect: async () => {
        const client = await lecture();
        return { ...client, query: async (texte, valeurs) => (texte.includes("interval '1 hour'") ? { rows: [] } : client.query(texte, valeurs)) };
      },
    };
    const { photos, fabrique } = service({ pool: () => pool });
    expect(await photos.photo(LIEU)).toBeNull();
    expect(fabrique).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith("essai.photo_unavailable", { errorName: "ReservationImpossible" }, "warn");
  });
});

describe("essai: photo refusée ou en échec : null, sans levée ni donnée Google journalisée", () => {
  it("plafond du mois atteint : aucun appel, PlafondAtteint", async () => {
    const base = poolSimule({ moisGoogle: 1 });
    const { photos, fabrique } = service({ pool: () => base.pool, reglage: async () => ({ forfait: FORFAIT, regles: regles({ ...LIMITES_PROTOTYPE, moisGoogleMicros: 5_000 }) }) });
    expect(await photos.photo(LIEU)).toBeNull();
    expect(fabrique).not.toHaveBeenCalled();
    expect(base.forfaitInscrit()).toBe(false);
    expect(logEvent).toHaveBeenCalledWith("essai.photo_unavailable", { errorName: "PlafondAtteint" }, "warn");
  });

  it("réglage indisponible : aucun appel, ReservationImpossible", async () => {
    const { photos, fabrique } = service({ reglage: async () => null });
    expect(await photos.photo(LIEU)).toBeNull();
    expect(fabrique).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith("essai.photo_unavailable", { errorName: "ReservationImpossible" }, "warn");
  });

  it.each([
    ["quota Google (429)", new ErreurClientGoogle("upstream_rate_limited"), "ErreurClientGoogle"],
    ["erreur quelconque", new Error(`SENTINELLE ${PLACE_ID}`), "Error"],
  ])("%s : null, nom de classe seulement", async (_cas, erreur, nom) => {
    const { photos } = service({}, { photo: vi.fn(async () => Promise.reject(erreur)) });
    expect(await photos.photo(LIEU)).toBeNull();
    expect(logEvent).toHaveBeenCalledWith("essai.photo_unavailable", { errorName: nom }, "warn");
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain(PLACE_ID);
  });

  it("lieu introuvable chez Google (404) : null, aucun journal (mineur 17)", async () => {
    const { photos } = service({}, { photo: vi.fn(async () => Promise.reject(new ErreurAncrage("place_not_found"))) });
    expect(await photos.photo(LIEU)).toBeNull();
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("forme rendue invalide (image non https) : null", async () => {
    const { photos } = service({}, { photo: vi.fn(async () => ({ ...PHOTO, uri: "http://lh3.googleusercontent.com/x" })) });
    expect(await photos.photo(LIEU)).toBeNull();
  });
});
