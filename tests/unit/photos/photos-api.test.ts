// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { RATE_LIMITS } from "@/server/config/limites";
import { ACTION_LIMITEUR_PHOTO, creerPhotosApi, photosApiOuvertes, type ClientPhotosApi, type DependancesPhotosApi } from "@/server/photos/api";
import type { EtatBarriere } from "@/server/generation/barriere";

/**
 * Photos du tri sur `api` (PR 879, M1e ; décision 0128 généralisée) : barrière B9-TL-8 d'abord, puis le lieu lu sur la
 * proposition du voyage, le limiteur, puis le client ; sous la barrière fermée, ni lecture du voyage, ni limiteur, ni
 * client. Doubles seulement : aucune base, aucun en-tête, aucun appel Google.
 */

const PHOTO = { url: "https://lh3.googleusercontent.com/p/abc", authors: [{ name: "Ana", profileUrl: "https://maps.google.com/contrib/1" }] };

function doubles(etat: EtatBarriere, options: { lieu?: string | null; admis?: boolean; photo?: unknown; client?: null } = {}) {
  const ordre: string[] = [];
  const lieu = vi.fn(async () => {
    ordre.push("lieu");
    return options.lieu === undefined ? "ChIJ-abc_9" : options.lieu;
  });
  const photo = vi.fn(async (placeId: string) => {
    ordre.push(`photo:${placeId}`);
    return (options.photo === undefined ? PHOTO : options.photo) as never;
  });
  const fabrique = vi.fn(async (): Promise<ClientPhotosApi> => {
    ordre.push("client");
    return { photo };
  });
  const dependances: DependancesPhotosApi = {
    barriere: async () => {
      ordre.push("barriere");
      return etat;
    },
    limiteur: async () => {
      ordre.push("limiteur");
      return options.admis ?? true;
    },
    client: options.client === null ? null : fabrique,
  };
  return { ordre, lieu, photo, fabrique, dependances };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("photos du tri sur api (PR 879)", () => {
  it("barrière fermée (production, simulée) : null, ni lecture du voyage, ni limiteur, ni client", async () => {
    for (const etat of ["production", "simulee"] as const) {
      const d = doubles(etat);
      expect(await creerPhotosApi(d.dependances).photo(d.lieu)).toBeNull();
      expect(d.ordre).toEqual(["barriere"]);
      expect(await photosApiOuvertes(d.dependances)).toBe(false);
    }
  });

  it("barrière par défaut (aucun crochet d'accès), même avec toutes les conditions d'environnement : fermée, sans appel", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VADROUILLE_ENV", undefined);
    vi.stubEnv("GENERATION_APPELS_REELS", "1");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "claude/879-m1e-photos-api");
    const d = doubles("reelle");
    const sansBarriere: DependancesPhotosApi = { limiteur: d.dependances.limiteur, client: d.dependances.client };
    expect(await creerPhotosApi(sansBarriere).photo(d.lieu)).toBeNull();
    expect(d.lieu).not.toHaveBeenCalled();
    expect(d.fabrique).not.toHaveBeenCalled();
    expect(await photosApiOuvertes({ client: d.fabrique })).toBe(false);
  });

  it("client par défaut non branché : null même barrière ouverte, sans limiteur ; l'écran ne demande rien", async () => {
    const d = doubles("reelle");
    const sansClient: DependancesPhotosApi = { barriere: d.dependances.barriere, limiteur: d.dependances.limiteur };
    expect(await creerPhotosApi(sansClient).photo(d.lieu)).toBeNull();
    expect(d.ordre).toEqual(["barriere", "lieu"]);
    expect(await photosApiOuvertes({ barriere: d.dependances.barriere })).toBe(false);
  });

  it("barrière ouverte (injectée) : barrière, lieu, limiteur, client, puis la photo du lieu de la proposition", async () => {
    const d = doubles("reelle");
    expect(await creerPhotosApi(d.dependances).photo(d.lieu)).toEqual(PHOTO);
    expect(d.ordre).toEqual(["barriere", "lieu", "limiteur", "client", "photo:ChIJ-abc_9"]);
    expect(await photosApiOuvertes(d.dependances)).toBe(true);
  });

  it("lieu hors du voyage (null) : refus sans limiteur ni client", async () => {
    const d = doubles("reelle", { lieu: null });
    expect(await creerPhotosApi(d.dependances).photo(d.lieu)).toBeNull();
    expect(d.ordre).toEqual(["barriere", "lieu"]);
  });

  it("limiteur refusé (cadence de 40 par heure atteinte) : null, aucun client construit", async () => {
    const d = doubles("reelle", { admis: false });
    expect(await creerPhotosApi(d.dependances).photo(d.lieu)).toBeNull();
    expect(d.ordre).toEqual(["barriere", "lieu", "limiteur"]);
    expect(d.fabrique).not.toHaveBeenCalled();
  });

  it("photo hors contrat (hôte non Google), client ou barrière qui lève : null, sans levée", async () => {
    const d = doubles("reelle", { photo: { url: "https://exemple.test/x.jpg", authors: [] } });
    expect(await creerPhotosApi(d.dependances).photo(d.lieu)).toBeNull();
    const panne = doubles("reelle");
    panne.photo.mockRejectedValueOnce(new Error("panne"));
    expect(await creerPhotosApi(panne.dependances).photo(panne.lieu)).toBeNull();
    const barriere = vi.fn(async (): Promise<EtatBarriere> => {
      throw new Error("panne");
    });
    expect(await creerPhotosApi({ ...panne.dependances, barriere }).photo(panne.lieu)).toBeNull();
    expect(await photosApiOuvertes({ ...panne.dependances, barriere })).toBe(false);
  });

  it("même plafond que le site d'essai : 40 photos par heure, action photo-tri du limiteur", () => {
    expect(ACTION_LIMITEUR_PHOTO).toBe("photo-tri");
    expect(RATE_LIMITS[ACTION_LIMITEUR_PHOTO]).toEqual([{ kind: "ip", windowSeconds: 3600, threshold: 40 }]);
  });
});
