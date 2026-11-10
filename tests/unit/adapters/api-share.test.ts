// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiShareAdapter, type PartageApi, type VuePartageeApi } from "@/adapters/api-share";
import { apiShareAdapter, brancherPartageApi, debrancherPartageApiPourTests, PartageDejaBrancheError } from "@/adapters/api-share-instance";
import { projectSharedTrip } from "@/adapters/share-projection";
import type { AdapterContext } from "@/adapters/types";
import { edimbourgDebloque } from "@/mocks/edimbourg";

/**
 * Adaptateur de partage `api` (ticket 1013, M6a ; décision 0157 § 1.2 à § 1.4 ; critère 13 de M6a) : jeton de forme
 * aléatoire seulement (un jeton signé du site d'essai répond 404 sans lecture), règle de date de F10-TL-7 à l'heure de
 * la destination, validation stricte, branchement au démarrage.
 */

const JETON = "E".repeat(43);
const SIGNE = "v1.eyJ0IjoiMSJ9.c2lnbmF0dXJl";
const trip = projectSharedTrip(edimbourgDebloque);
const VUE: VuePartageeApi = { trip, maps: trip.days.map((d) => ({ index: d.index, points: [] })), timeZone: "Europe/London" };

function monter(vue: VuePartageeApi | null = VUE, maintenant = Date.parse(`${trip.end}T12:00:00Z`)) {
  const partage: PartageApi = {
    creer: vi.fn(),
    desactiver: vi.fn(),
    etat: vi.fn(),
    lireVue: vi.fn(async () => vue),
  };
  return { partage, adaptateur: createApiShareAdapter(partage, { now: () => maintenant, accessDaysAfterReturn: 30 }) };
}

afterEach(() => {
  debrancherPartageApiPourTests();
  vi.unstubAllEnvs();
});

describe("adaptateur de partage api", () => {
  it.each([SIGNE, "court", `${JETON}x`, ""])("jeton %j d'une autre forme : null sans aucune lecture", async (jeton) => {
    const { partage, adaptateur } = monter();
    expect(await adaptateur.getSharedTrip(jeton)).toBeNull();
    expect(await adaptateur.getSharedDay(jeton, 1)).toBeNull();
    expect(partage.lireVue).not.toHaveBeenCalled();
  });

  it("vue lue pour le chemin de la requête, validée par le schéma strict", async () => {
    const { partage, adaptateur } = monter();
    expect(await adaptateur.getSharedTrip(JETON)).toEqual({ trip, maps: VUE.maps });
    expect(partage.lireVue).toHaveBeenCalledWith(JETON, `/p/${JETON}`);
    const jour = await adaptateur.getSharedDay(JETON, 2);
    expect(jour).toEqual({ trip, dayIndex: 2, points: [] });
    expect(partage.lireVue).toHaveBeenLastCalledWith(JETON, `/p/${JETON}/jour/2`);
    expect(await adaptateur.getSharedDay(JETON, 99)).toBeNull();
  });

  it("serveur sans vue (jeton inconnu, désactivé, expiré, voyage reverrouillé) : null", async () => {
    const { adaptateur } = monter(null);
    expect(await adaptateur.getSharedTrip(JETON)).toBeNull();
    expect(await adaptateur.getSharedDay(JETON, 1)).toBeNull();
  });

  it("règle de date (0157 § 1.3 point 2) : dernier jour du partage admis jusqu'à minuit à l'heure de la destination", async () => {
    // Fin du voyage + 30 jours : début octobre, Londres à UTC+1 (heure d'été).
    const [a, m, j] = trip.end.split("-").map(Number);
    const fin = new Date(Date.UTC(a ?? 0, (m ?? 1) - 1, (j ?? 1) + 30)).toISOString().slice(0, 10);
    expect(fin.slice(5, 7)).toBe("10");
    // 23 h 30 à Londres, le dernier jour : admis.
    expect(await monter(VUE, Date.parse(`${fin}T22:30:00Z`)).adaptateur.getSharedTrip(JETON)).not.toBeNull();
    // 0 h 30 à Londres le lendemain (encore le dernier jour en UTC) : refusé.
    expect(await monter(VUE, Date.parse(`${fin}T23:30:00Z`)).adaptateur.getSharedTrip(JETON)).toBeNull();
  });

  it("champ en trop dans la vue lue : erreur (page d'erreur commune), jamais une donnée en trop à l'écran", async () => {
    const { adaptateur } = monter({ ...VUE, trip: { ...trip, budget: 1200 } });
    await expect(adaptateur.getSharedTrip(JETON)).rejects.toThrow();
    const autre = monter({ ...VUE, maps: [{ index: 1, points: [{ key: "1", lat: 1, lng: 2, placeId: "ChIJ" }] }] });
    await expect(autre.adaptateur.getSharedTrip(JETON)).rejects.toThrow();
  });

  it("création, désactivation et état délégués au serveur avec l'horloge de la portée", async () => {
    const { partage, adaptateur } = monter(VUE, 1234);
    const ctx = { organizationId: "o", userId: "u" } as AdapterContext;
    await adaptateur.createLink(ctx, "t");
    await adaptateur.revokeLink(ctx, "t");
    await adaptateur.getStatus(ctx, "t");
    expect(partage.creer).toHaveBeenCalledWith(ctx, "t", 1234);
    expect(partage.desactiver).toHaveBeenCalledWith(ctx, "t");
    expect(partage.etat).toHaveBeenCalledWith(ctx, "t", 1234);
  });
});

describe("branchement du partage api", () => {
  const ouvrir = () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    vi.stubEnv("AUTH_ADAPTER", "better-auth");
    vi.stubEnv("VADROUILLE_ENV", "ci");
  };

  it("hors de la garde api : apiShareAdapter lève (sans repli vers mock)", () => {
    vi.stubEnv("DATA_ADAPTER", "mock");
    expect(() => apiShareAdapter(() => 0)).toThrow();
  });

  it("non branché : chaque méthode rejette sans rien lire", async () => {
    ouvrir();
    const adaptateur = apiShareAdapter(() => 0);
    await expect(adaptateur.getSharedTrip(JETON)).rejects.toThrow("non branché");
    await expect(adaptateur.createLink({} as AdapterContext, "t")).rejects.toThrow("non branché");
  });

  it("branché une fois : utilisé ; un second branchement est refusé", async () => {
    ouvrir();
    const { partage } = monter();
    brancherPartageApi(partage);
    expect(() => brancherPartageApi(partage)).toThrow(PartageDejaBrancheError);
    await apiShareAdapter(() => Date.parse(`${trip.end}T12:00:00Z`)).getSharedTrip(JETON);
    expect(partage.lireVue).toHaveBeenCalledTimes(1);
  });
});
