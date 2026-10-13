// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ErreurClientGoogle } from "@/grounding/enveloppe-google";
import { COUT_ELEMENT_MICROS, createRoutesClient, MASQUE_MATRICE, ORIGINE_ROUTES, SKU_MATRICE, type OptionsRoutes } from "@/grounding/routes-client";

import { creerHorlogeManuelle } from "../../tests/support/horloge-manuelle";
import { creerPortMemoire } from "../../tests/support/port-consommation-memoire";

/** Client réel de Routes (matrice de durées, P0r1), toujours avec un transport de test. */

const CLE = "SENTINELLE-CLE-GOOGLE-5d0e";
const ENV = { VERCEL_ENV: "development", GOOGLE_MAPS_SERVER_KEY: CLE } as const;
const TOUJOURS = { du: 0, au: Number.MAX_SAFE_INTEGER };
const CONTEXTE = () => ({ nature: "execution" as const, executionId: "exec-1", periodes: { jour: TOUJOURS, mois: TOUJOURS } });

const fetchGlobal = vi.fn(async () => {
  throw new Error("fetch global appelé");
});
beforeAll(() => {
  vi.stubGlobal("fetch", fetchGlobal);
});
afterAll(() => {
  expect(fetchGlobal).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

type Appel = { url: string; init: RequestInit };

function premier(appels: readonly Appel[]): Appel {
  const appel = appels[0];
  if (appel === undefined) throw new Error("aucun appel au transport");
  return appel;
}
const json = (valeur: unknown, statut = 200) => new Response(JSON.stringify(valeur), { status: statut });

function monter(reponses: (() => Promise<Response>)[], options: Partial<OptionsRoutes> = {}) {
  const horloge = creerHorlogeManuelle();
  const port = creerPortMemoire(horloge);
  const appels: Appel[] = [];
  const transport = vi.fn(async (url: string, init: RequestInit) => {
    appels.push({ url, init });
    const suivante = reponses.shift();
    if (suivante === undefined) throw new Error("transport appelé une fois de trop");
    return suivante();
  });
  const client = createRoutesClient({ usage: port, contexte: CONTEXTE, plafonds: [], horloge, environnement: ENV, ...options }, transport);
  return { client, port, horloge, appels, transport };
}

async function erreurDe(promesse: Promise<unknown>): Promise<ErreurClientGoogle> {
  try {
    await promesse;
  } catch (erreur) {
    if (erreur instanceof ErreurClientGoogle) return erreur;
    throw erreur;
  }
  throw new Error("aucune erreur");
}

describe("p0: egress, un seul contrat (Routes)", () => {
  it.each([
    ["production_refused", { VERCEL_ENV: "preview", VADROUILLE_ENV: "production" }],
    ["proxy_env_refused", { VERCEL_ENV: "preview", ALL_PROXY: "socks5://p:1080" }],
    ["tls_env_refused", { VERCEL_ENV: "preview", NODE_OPTIONS: "--use-openssl-ca" }],
  ])("%s : la fabrique ne se construit pas, sans lire la clé", (code, base) => {
    let lue = false;
    const environnement = {
      ...base,
      get GOOGLE_MAPS_SERVER_KEY() {
        lue = true;
        return CLE;
      },
    };
    const horloge = creerHorlogeManuelle();
    let erreur: unknown;
    try {
      createRoutesClient({ usage: creerPortMemoire(horloge), contexte: CONTEXTE, plafonds: [], horloge, environnement }, vi.fn());
    } catch (e) {
      erreur = e;
    }
    expect((erreur as ErreurClientGoogle).code).toBe(code);
    expect(lue).toBe(false);
  });

  it("option TLS de execArgv injecté : tls_env_refused", () => {
    const horloge = creerHorlogeManuelle();
    expect(() =>
      createRoutesClient(
        { usage: creerPortMemoire(horloge), contexte: CONTEXTE, plafonds: [], horloge, environnement: ENV, execArgv: ["--tls-min-v1.0"] },
        vi.fn(),
      ),
    ).toThrow("tls_env_refused");
  });
});

describe("p0: les clients réels n'appellent que leurs hôtes figés ; no-store sur chaque appel Google (Routes)", () => {
  it("matrice : origine figée, masque minimal, identifiants de lieu seulement, éléments réservés", async () => {
    const { client, appels, port } = monter([
      async () =>
        json([
          { originIndex: 0, destinationIndex: 0, duration: "600s", condition: "ROUTE_EXISTS" },
          { originIndex: 0, destinationIndex: 1, condition: "ROUTE_NOT_FOUND" },
          { originIndex: 1, destinationIndex: 0, duration: "1200s", condition: "ROUTE_EXISTS" },
          { originIndex: 1, destinationIndex: 1, duration: "0s", condition: "ROUTE_EXISTS" },
        ]),
    ]);
    const reponse = await client.matrice({ origines: ["A1", "A2"], destinations: ["B1", "B2"], mode: "walk" });
    expect(reponse).toEqual({
      secondes: [
        [600, null],
        [1200, 0],
      ],
    });
    const { url, init } = premier(appels);
    expect(new URL(url).origin).toBe(ORIGINE_ROUTES);
    expect(new URL(url).pathname).toBe("/distanceMatrix/v2:computeRouteMatrix");
    expect(url).not.toContain(CLE);
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("manual");
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe(CLE);
    expect(new Headers(init.headers).get("x-goog-fieldmask")).toBe(MASQUE_MATRICE);
    expect(JSON.parse(String(init.body))).toEqual({
      origins: [{ waypoint: { placeId: "A1" } }, { waypoint: { placeId: "A2" } }],
      destinations: [{ waypoint: { placeId: "B1" } }, { waypoint: { placeId: "B2" } }],
      travelMode: "WALK",
    });
    expect(port.lignes.map((l) => [l.etat, l.demande.sku, l.demande.unites, l.demande.coutEstimeMicros])).toEqual([
      ["confirmee", SKU_MATRICE, { requetes: 1, elements: 4 }, 4 * COUT_ELEMENT_MICROS],
    ]);
  });

  it.each([
    ["transit", "TRANSIT"],
    ["car", "DRIVE"],
  ] as const)("mode %s : %s", async (mode, attendu) => {
    const { client, appels } = monter([async () => json([])]);
    await client.matrice({ origines: ["A"], destinations: ["B"], mode });
    expect(JSON.parse(String(appels[0]?.init.body)).travelMode).toBe(attendu);
  });

  it("requête hors limites ou identifiant mal formé : invalid_request, sans réservation", async () => {
    const { client, transport, port } = monter([]);
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `ID${i}`);
    for (const requete of [
      { origines: [], destinations: ["B"], mode: "walk" as const },
      { origines: ids(26), destinations: ["B"], mode: "walk" as const },
      { origines: ids(11), destinations: ids(10), mode: "transit" as const },
      { origines: ["a/b"], destinations: ["B"], mode: "walk" as const },
    ]) {
      expect((await erreurDe(client.matrice(requete))).code).toBe("invalid_request");
    }
    expect(transport).not.toHaveBeenCalled();
    expect(port.lignes).toEqual([]);
  });

  it("index hors de la matrice : invalid_response", async () => {
    const { client } = monter([async () => json([{ originIndex: 3, destinationIndex: 0, duration: "1s", condition: "ROUTE_EXISTS" }])]);
    expect((await erreurDe(client.matrice({ origines: ["A"], destinations: ["B"], mode: "walk" }))).code).toBe("invalid_response");
  });
});

describe("p0: une réponse 30x ne déclenche aucune requête secondaire (Routes)", () => {
  it.each([301, 302, 303, 307, 308])("%i : upstream_redirect, un seul appel", async (statut) => {
    const { client, appels } = monter([async () => new Response(null, { status: statut, headers: { location: "https://exemple.org/" } }), async () => json([])]);
    expect((await erreurDe(client.matrice({ origines: ["A"], destinations: ["B"], mode: "walk" }))).code).toBe("upstream_redirect");
    expect(appels).toHaveLength(1);
  });

  it("erreur de transport : upstream_unavailable", async () => {
    const { client } = monter([
      async () => {
        throw new TypeError("SENTINELLE-FOURNISSEUR");
      },
    ]);
    const erreur = await erreurDe(client.matrice({ origines: ["A"], destinations: ["B"], mode: "walk" }));
    expect(erreur.code).toBe("upstream_unavailable");
    expect(`${erreur.message} ${erreur.stack ?? ""}`).not.toContain("SENTINELLE-FOURNISSEUR");
  });
});

describe("p0: réservation avant chaque requête (Routes)", () => {
  it("plafond d'éléments du jour : cap_reached avant l'appel", async () => {
    const { client, transport } = monter([], { plafonds: [{ portee: "jour", fournisseur: "google", methode: "routes_matrix", maxElements: 3 }] });
    expect((await erreurDe(client.matrice({ origines: ["A", "B"], destinations: ["C", "D"], mode: "walk" }))).code).toBe("cap_reached");
    expect(transport).not.toHaveBeenCalled();
  });
});
