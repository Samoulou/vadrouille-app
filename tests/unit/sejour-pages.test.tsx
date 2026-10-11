import { afterEach, describe, expect, it, vi } from "vitest";

import DevJourneePage, { generateMetadata as devJourneeMetadata } from "@/app/dev/voyages/[id]/jour/[n]/page";
import DevTripLayout from "@/app/dev/voyages/[id]/layout";
import DevSejourPage from "@/app/dev/voyages/[id]/page";
import JourneePage, { generateMetadata as journeeMetadata } from "@/app/voyages/[id]/(programme)/jour/[n]/page";
import ProgrammeLayout from "@/app/voyages/[id]/(programme)/layout";
import SejourPage, { generateMetadata as sejourMetadata } from "@/app/voyages/[id]/(programme)/page";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useParams: () => ({}),
}));

const params = <T,>(value: T) => Promise.resolve(value);

type Node = { type?: unknown; props?: { children?: unknown } } | null | undefined;

/**
 * Exécute les composants serveur asynchrones de l'arbre rendu (pages, layouts et écrans de
 * `features/sejour/screens`), sans monter les composants client : un `notFound()` est ainsi levé.
 */
async function serverRender(element: Promise<unknown> | unknown): Promise<unknown> {
  let node = (await element) as Node;
  while (node && typeof node.type === "function" && node.type.constructor.name === "AsyncFunction") {
    node = (await (node.type as (props: unknown) => Promise<unknown>)(node.props)) as Node;
  }
  const children = node?.props?.children as Node;
  if (children && typeof children === "object" && "type" in children) await serverRender(children);
  return node;
}
const TRIP = "mock_trip_edimbourg";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sejour: 404 hors organisation ou hors limites (routes)", () => {
  it("voyage inconnu : 404 au layout et aux pages", async () => {
    await expect(serverRender(ProgrammeLayout({ params: params({ id: "inconnu" }), children: null }))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(serverRender(SejourPage({ params: params({ id: "inconnu" }) }))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(serverRender(JourneePage({ params: params({ id: "inconnu", n: "2" }) }))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each(["0", "7", "02", "abc"])("/jour/%s : 404", async (n) => {
    await expect(serverRender(JourneePage({ params: params({ id: TRIP, n }) }))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("voyage et jour connus : rendu", async () => {
    await expect(serverRender(ProgrammeLayout({ params: params({ id: TRIP }), children: null }))).resolves.toBeTruthy();
    await expect(serverRender(SejourPage({ params: params({ id: TRIP }) }))).resolves.toBeTruthy();
    await expect(serverRender(JourneePage({ params: params({ id: TRIP, n: "2" }) }))).resolves.toBeTruthy();
  });

  it("titres du document : « Édimbourg · Séjour », « Édimbourg · Jour 2 »", async () => {
    expect((await sejourMetadata({ params: params({ id: TRIP }) })).title).toBe("Édimbourg · Séjour");
    expect((await journeeMetadata({ params: params({ id: TRIP, n: "2" }), searchParams: params({}) })).title).toBe("Édimbourg · Jour 2");
    expect((await journeeMetadata({ params: params({ id: TRIP, n: "9" }), searchParams: params({}) })).title).toBeUndefined();
  });

  it("titre du document, fiche ouverte : « {nom de l'étape} · Jour {n} » ; étape absente du jour : titre du jour", async () => {
    const title = async (etape: string) =>
      (await journeeMetadata({ params: params({ id: TRIP, n: "2" }), searchParams: params({ etape }) })).title;
    expect(await title("j2-dean-village")).toBe("[Dean Village] · Jour 2");
    expect(await title("j2-concert-orgue")).toBe("[Concert d'orgue à St Giles] · Jour 2");
    expect(await title("j5-distillerie")).toBe("Édimbourg · Jour 2");
    expect(await title("inconnue")).toBe("Édimbourg · Jour 2");
  });
});

describe("/dev/voyages (F5-TL-1)", () => {
  it("répond 404 en production sans VADROUILLE_DEV_PAGES=1", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEV_PAGES", "");
    await expect(serverRender(DevTripLayout({ params: params({ id: TRIP }), children: null }))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(serverRender(DevSejourPage({ params: params({ id: TRIP }) }))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(serverRender(DevJourneePage({ params: params({ id: TRIP, n: "2" }) }))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await devJourneeMetadata({ params: params({ id: TRIP, n: "2" }), searchParams: params({}) })).toEqual({});
  });

  it("s'affiche en développement, avec les mêmes 404 que les routes produit", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(serverRender(DevTripLayout({ params: params({ id: TRIP }), children: null }))).resolves.toBeTruthy();
    await expect(serverRender(DevJourneePage({ params: params({ id: TRIP, n: "2" }) }))).resolves.toBeTruthy();
    await expect(serverRender(DevJourneePage({ params: params({ id: TRIP, n: "02" }) }))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
