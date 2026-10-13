// @vitest-environment node
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as adapters from "@/adapters";
import { resetScope } from "@/adapters/simulation";
import SharedDayPage, { dynamic as dayDynamic, generateMetadata as dayMetadata } from "@/app/p/[token]/jour/[n]/page";
import SharedNotFound, { metadata as notFoundMetadata } from "@/app/p/[token]/not-found";
import SharedTripPage, { dynamic as tripDynamic, generateMetadata as tripMetadata } from "@/app/p/[token]/page";
import { metadata as layoutMetadata } from "@/app/p/layout";
import type { SharedShellProps } from "@/features/partage/SharedShell";
import { SHARE_TOKEN_DESACTIVE, SHARE_TOKEN_VALIDE } from "@/mocks/edimbourg-partage";

const scopeName = vi.hoisted(() => ({ value: "pages-partage-1" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-vadrouille-simulation": scopeName.value }) }));
const extraField = vi.hoisted(() => ({ value: false }));
vi.mock("@/adapters/share-projection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters/share-projection")>();
  return {
    ...actual,
    // Régression simulée : un champ privé recopié dans la projection. La validation stricte doit la refuser.
    projectSharedTrip: (trip: Parameters<typeof actual.projectSharedTrip>[0]) =>
      extraField.value ? { ...actual.projectSharedTrip(trip), organizationId: trip.organizationId } : actual.projectSharedTrip(trip),
  };
});
vi.mock("@/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters")>();
  return {
    ...actual,
    getRequestContext: vi.fn(actual.getRequestContext),
    getShareAdapter: vi.fn(actual.getShareAdapter),
    getSimulationScope: vi.fn(actual.getSimulationScope),
    getTripReader: vi.fn(actual.getTripReader),
  };
});

/** Pages `RP` et `RPJ` (spécification F10, F10c : C29, C30, C32, C38, C39 ; F10-PO-15). */

const notFound = { digest: expect.stringContaining("404") };
const NOW = Date.parse("2026-08-30T10:40:00+01:00");

let serial = 0;
beforeEach(() => {
  serial += 1;
  scopeName.value = `pages-partage-${serial}`;
  resetScope(scopeName.value, NOW);
  extraField.value = false;
  for (const spy of [adapters.getShareAdapter, adapters.getSimulationScope, adapters.getRequestContext, adapters.getTripReader]) {
    vi.mocked(spy).mockClear();
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const rp = async (token: string) => (await SharedTripPage({ params: Promise.resolve({ token }) })) as ReactElement<SharedShellProps>;
const rpj = async (token: string, n: string) =>
  (await SharedDayPage({ params: Promise.resolve({ token, n }) })) as ReactElement<SharedShellProps>;

describe("rendu dynamique et non indexé (F10-TL-8)", () => {
  it("pages en force-dynamic ; robots noindex, nofollow sur le layout, les pages et la 404", async () => {
    expect(tripDynamic).toBe("force-dynamic");
    expect(dayDynamic).toBe("force-dynamic");
    expect(layoutMetadata.robots).toEqual({ index: false, follow: false });
    expect(notFoundMetadata.robots).toEqual({ index: false, follow: false });
    expect((await tripMetadata({ params: Promise.resolve({ token: "abc" }) })).robots).toEqual({ index: false, follow: false });
  });
});

describe("RP", () => {
  it("jeton fixe valide : Séjour partagé avec les points de tous les jours ; titre du document", async () => {
    const element = await rp(SHARE_TOKEN_VALIDE);
    expect(element.props.current).toBe("sejour");
    expect(element.props.token).toBe(SHARE_TOKEN_VALIDE);
    expect(element.props.maps.length).toBe(element.props.days.length);
    expect((await tripMetadata({ params: Promise.resolve({ token: SHARE_TOKEN_VALIDE }) })).title).toBe("Édimbourg · Programme partagé");
  });

  it.each([
    ["jeton inconnu de bonne forme", "A".repeat(43)],
    ["jeton désactivé", SHARE_TOKEN_DESACTIVE],
  ])("%s : 404", async (_label, token) => {
    await expect(rp(token)).rejects.toMatchObject(notFound);
  });

  it.each([
    ["abc", "abc"],
    ["300 caractères", "A".repeat(300)],
    ["caractère hors base64url", `${"A".repeat(42)}%`],
  ])("jeton mal formé (%s) : 404 sans appel à l'adaptateur", async (_label, token) => {
    await expect(rp(token)).rejects.toMatchObject(notFound);
    expect(adapters.getShareAdapter).not.toHaveBeenCalled();
    expect(adapters.getSimulationScope).not.toHaveBeenCalled();
  });

  it("partage terminé (2026-10-04 à 00:00, heure d'Édimbourg) : 404 ; la veille à 23:59 : 200", async () => {
    resetScope(scopeName.value, Date.parse("2026-10-03T23:59:00+01:00"));
    await expect(rp(SHARE_TOKEN_VALIDE)).resolves.toBeDefined();
    resetScope(scopeName.value, Date.parse("2026-10-04T00:00:00+01:00"));
    await expect(rp(SHARE_TOKEN_VALIDE)).rejects.toMatchObject(notFound);
  });

  it.each([
    ["DATA_ADAPTER=api", () => vi.stubEnv("DATA_ADAPTER", "api")],
    [
      "déploiement de production",
      () => {
        vi.stubEnv("VADROUILLE_ENV", "production");
        vi.stubEnv("VADROUILLE_DEMO_SHARE", "1");
      },
    ],
  ])("garde fermée (%s) : 404 sans rien lire", async (_label, close) => {
    close();
    await expect(rp(SHARE_TOKEN_VALIDE)).rejects.toMatchObject(notFound);
    await expect(rpj(SHARE_TOKEN_VALIDE, "2")).rejects.toMatchObject(notFound);
    for (const spy of [adapters.getShareAdapter, adapters.getSimulationScope, adapters.getRequestContext, adapters.getTripReader]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("erreur de l'adaptateur : jamais présentée comme une 404 (page d'erreur commune)", async () => {
    vi.mocked(adapters.getShareAdapter).mockImplementationOnce(() => {
      throw new Error("panne");
    });
    await expect(rp(SHARE_TOKEN_VALIDE)).rejects.toThrow("panne");
  });

  it("champ en trop dans la projection : la validation stricte échoue (500), la donnée n'est jamais rendue", async () => {
    extraField.value = true;
    const error = await rp(SHARE_TOKEN_VALIDE).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toMatchObject(notFound);
  });
});

describe("RPJ", () => {
  it("jour 2 : Journée partagée avec ses points ; titre du document", async () => {
    const element = await rpj(SHARE_TOKEN_VALIDE, "2");
    expect(element.props.current).toBe(2);
    expect(element.props.maps).toHaveLength(1);
    expect(element.props.maps[0]!.index).toBe(2);
    expect((await dayMetadata({ params: Promise.resolve({ token: SHARE_TOKEN_VALIDE, n: "2" }) })).title).toBe(
      "Édimbourg · Jour 2 · Programme partagé",
    );
  });

  it.each(["7", "0", "02", "2a", "-1"])("n = %s : 404", async (n) => {
    await expect(rpj(SHARE_TOKEN_VALIDE, n)).rejects.toMatchObject(notFound);
  });

  it("jeton mal formé : 404 sans appel à l'adaptateur", async () => {
    await expect(rpj("abc", "2")).rejects.toMatchObject(notFound);
    expect(adapters.getShareAdapter).not.toHaveBeenCalled();
  });
});

describe("404 de la vue partagée", () => {
  it("mêmes textes pour tous les cas, sans action ; titre du document propre", () => {
    const element = SharedNotFound() as ReactElement<{ children: ReactElement[] }>;
    const text = JSON.stringify(element);
    expect(text).toContain("Ce lien de partage n'est pas valide.");
    expect(text).toContain("Demande un nouveau lien à la personne qui te l'a envoyé.");
    expect(notFoundMetadata.title).toBe("Lien de partage non valide · Vadrouille");
  });
});
