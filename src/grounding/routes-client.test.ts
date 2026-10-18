// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ErreurClientGoogle } from "@/grounding/enveloppe-google";
import { COUT_ELEMENT_MICROS, createRoutesClient, MASQUE_MATRICE, ORIGINE_ROUTES, SKU_MATRICE, type OptionsRoutes } from "@/grounding/routes-client";
import { chargerTrajets } from "@/grounding/trajets";

import { creerHorlogeManuelle } from "../../tests/support/horloge-manuelle";
import { creerPortMemoire } from "../../tests/support/port-consommation-memoire";

// 0046 D21 : la barrière de sortie lit aussi le vrai `process.env` ; ces tests le posent en préversion, puis le rétablissent.
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_TARGET_ENV", undefined);
  vi.stubEnv("VADROUILLE_ENV", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

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


/** Prix d'un SKU dans la table commitée (`prototype/config/prix-google.json`), en micro-USD par unité (0049 E2). */
function prixUnitaireMicros(sku: string): number {
  const table = z
    .object({ skus: z.record(z.string(), z.object({ prixPour1000: z.number() })) })
    .parse(JSON.parse(readFileSync(path.join(import.meta.dirname, "../../prototype/config/prix-google.json"), "utf8")));
  const ligne = new Map(Object.entries(table.skus)).get(sku);
  if (ligne === undefined) throw new Error(`SKU absent de la table : ${sku}`);
  return ligne.prixPour1000 * 1_000;
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
    const { client, appels } = monter([async () => json([{ originIndex: 0, destinationIndex: 0, duration: "60s", condition: "ROUTE_EXISTS" }])]);
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

  // Ticket 493 : une réponse lisible ne lève plus ; toute incertitude donne une durée inconnue (null), jamais une durée
  // attribuée à une autre paire. Requête : origine A ; destinations B (index 0) et C (index 1).
  it.each([
    ["matrice incomplète (une paire manquante)", [{ originIndex: 0, destinationIndex: 1, duration: "60s", condition: "ROUTE_EXISTS" }], [[null, 60]]],
    [
      "paire répétée (même durée ou non) : inconnue",
      [
        { originIndex: 0, destinationIndex: 0, duration: "30s", condition: "ROUTE_EXISTS" },
        { originIndex: 0, destinationIndex: 1, duration: "60s", condition: "ROUTE_EXISTS" },
        { originIndex: 0, destinationIndex: 1, duration: "90s", condition: "ROUTE_EXISTS" },
      ],
      [[30, null]],
    ],
    [
      "index absent qui répète une paire (lu 0, déjà présente) : cette paire inconnue",
      [
        { originIndex: 0, destinationIndex: 0, duration: "60s", condition: "ROUTE_EXISTS" },
        { originIndex: 0, duration: "90s", condition: "ROUTE_EXISTS" },
        { originIndex: 0, destinationIndex: 1, duration: "120s", condition: "ROUTE_EXISTS" },
      ],
      [[null, 120]],
    ],
    [
      "élément en erreur sans index (forme possible d'un élément en échec) : il ne prend jamais la place de 0:0",
      [{}, { originIndex: 0, destinationIndex: 0, duration: "60s", condition: "ROUTE_EXISTS" }, { destinationIndex: 1, duration: "45s", condition: "ROUTE_EXISTS" }],
      [[null, 45]],
    ],
    [
      "statut d'erreur par élément (google.rpc.Status) : inconnue, même avec une durée",
      [
        { originIndex: 0, destinationIndex: 0, status: { code: 5, message: "SENTINELLE" }, duration: "60s", condition: "ROUTE_EXISTS" },
        { originIndex: 0, destinationIndex: 1, status: {}, duration: "75s", condition: "ROUTE_EXISTS" },
      ],
      [[null, 75]],
    ],
    [
      "sans route (ROUTE_NOT_FOUND) ou condition omise (UNSPECIFIED) : inconnue",
      [
        { originIndex: 0, destinationIndex: 0, condition: "ROUTE_NOT_FOUND" },
        { originIndex: 0, destinationIndex: 1, duration: "75s" },
      ],
      [[null, null]],
    ],
    [
      "durée fractionnaire documentée (« 3.5s »)",
      [
        { originIndex: 0, destinationIndex: 0, duration: "3.5s", condition: "ROUTE_EXISTS" },
        { originIndex: 0, destinationIndex: 1, duration: "1754.000000001s", condition: "ROUTE_EXISTS" },
      ],
      [[3.5, 1754.000000001]],
    ],
    [
      "durée mal formée (négative, sans unité, nombre) : inconnue",
      [
        { originIndex: 0, destinationIndex: 0, duration: "-3s", condition: "ROUTE_EXISTS" },
        { originIndex: 0, destinationIndex: 1, duration: 60, condition: "ROUTE_EXISTS" },
      ],
      [[null, null]],
    ],
    [
      "champs en plus (localizedValues, fallbackInfo, travelAdvisory, condition inconnue)",
      [
        {
          originIndex: 0,
          destinationIndex: 0,
          duration: "600s",
          condition: "ROUTE_EXISTS",
          localizedValues: { duration: { text: "10 min" }, transitFare: { text: "1,50 €" } },
          fallbackInfo: { routingMode: "FALLBACK_TRAFFIC_UNAWARE" },
          travelAdvisory: { transitFare: { currencyCode: "EUR", units: "1" } },
        },
        { originIndex: 0, destinationIndex: 1, duration: "60s", condition: "ROUTE_CONDITION_FUTURE" },
      ],
      [[600, null]],
    ],
    [
      "élément illisible (pas un objet, index non entier) : ignoré",
      [null, "x", { originIndex: "0", destinationIndex: 1, duration: "60s", condition: "ROUTE_EXISTS" }, { originIndex: 0, destinationIndex: 0, duration: "60s", condition: "ROUTE_EXISTS" }],
      [[60, null]],
    ],
    ["réponse vide", [], [[null, null]]],
  ] as const)("%s", async (_nom, elements, attendu) => {
    const { client } = monter([async () => json(elements)]);
    expect(await client.matrice({ origines: ["A"], destinations: ["B", "C"], mode: "transit" })).toEqual({ secondes: attendu });
  });

  it("index absent (valeur par défaut omise par le JSON de proto3) : lu 0, dans une matrice complète", async () => {
    const { client } = monter([
      async () =>
        json([
          { destinationIndex: 1, duration: "90s", condition: "ROUTE_EXISTS" },
          { duration: "60s", condition: "ROUTE_EXISTS" },
        ]),
    ]);
    expect(await client.matrice({ origines: ["A"], destinations: ["B", "C"], mode: "walk" })).toEqual({ secondes: [[60, 90]] });
  });

  it("éléments dans le désordre (exemple documenté en transports en commun) : chacun à sa paire", async () => {
    const { client } = monter([
      async () =>
        json([
          { originIndex: 1, destinationIndex: 1, status: {}, duration: "2754s", condition: "ROUTE_EXISTS" },
          { originIndex: 0, destinationIndex: 0, status: {}, duration: "394s", condition: "ROUTE_EXISTS" },
          { originIndex: 1, destinationIndex: 0, status: {}, duration: "740s", condition: "ROUTE_EXISTS" },
          { originIndex: 0, destinationIndex: 1, status: {}, duration: "3049s", condition: "ROUTE_EXISTS" },
        ]),
    ]);
    expect(await client.matrice({ origines: ["A1", "A2"], destinations: ["B1", "B2"], mode: "transit" })).toEqual({
      secondes: [
        [394, 3049],
        [740, 2754],
      ],
    });
  });

  it("index hors de la matrice : la réponse ne correspond pas à la requête, toute la matrice inconnue (aucune erreur)", async () => {
    const { client } = monter([
      async () =>
        json([
          { originIndex: 0, destinationIndex: 0, duration: "60s", condition: "ROUTE_EXISTS" },
          { originIndex: 3, destinationIndex: 0, duration: "1s", condition: "ROUTE_EXISTS" },
        ]),
    ]);
    expect(await client.matrice({ origines: ["A"], destinations: ["B"], mode: "walk" })).toEqual({ secondes: [[null]] });
  });

  it.each([
    ["objet au lieu d'un tableau", { originIndex: 0 }],
    ["texte", "SENTINELLE"],
    ["plus de 625 éléments", Array.from({ length: 626 }, () => ({}))],
  ])("%s : invalid_response", async (_nom, corps) => {
    const { client } = monter([async () => json(corps)]);
    expect((await erreurDe(client.matrice({ origines: ["A"], destinations: ["B"], mode: "walk" }))).code).toBe("invalid_response");
  });

  it("matrice TRANSIT de 10 × 10 avec des paires sans route et en erreur : jamais d'erreur, chaque durée à sa paire", async () => {
    const ids = (prefixe: string) => Array.from({ length: 10 }, (_, i) => `${prefixe}${i}`);
    const elements: unknown[] = [];
    for (let de = 0; de < 10; de += 1) {
      for (let vers = 0; vers < 10; vers += 1) {
        const element: Record<string, unknown> = { ...(de === 0 ? {} : { originIndex: de }), ...(vers === 0 ? {} : { destinationIndex: vers }) };
        if ((de + vers) % 7 === 3) element.condition = "ROUTE_NOT_FOUND";
        else if ((de * vers) % 11 === 5) element.status = { code: 3 };
        else Object.assign(element, { condition: "ROUTE_EXISTS", duration: `${100 * de + vers}s` });
        elements.push(element);
      }
    }
    const { client } = monter([async () => json(elements.reverse())]);
    const { secondes } = await client.matrice({ origines: ids("O"), destinations: ids("D"), mode: "transit" });
    for (let de = 0; de < 10; de += 1) {
      for (let vers = 0; vers < 10; vers += 1) {
        const attendu = (de + vers) % 7 === 3 || (de * vers) % 11 === 5 ? null : 100 * de + vers;
        expect(secondes.at(de)?.at(vers)).toBe(attendu);
      }
    }
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

describe("p0: coût estimé de la matrice égal à la table de prix (décision 0049 E2)", () => {
  it("élément de matrice : constante du client = prix du SKU de la table", () => {
    expect(COUT_ELEMENT_MICROS).toBe(prixUnitaireMicros(SKU_MATRICE));
  });
});

// B8a (décision 0085 § 2 point c) : l'option `introuvableSur404` est réservée aux méthodes Place Details.
describe("fiches: introuvable du client réel (Routes inchangé)", () => {
  it("Routes 404 : upstream_error, jamais upstream_not_found", async () => {
    const { client } = monter([async () => json({ error: { message: "SENTINELLE-FOURNISSEUR" } }, 404)]);
    expect((await erreurDe(client.matrice({ origines: ["A"], destinations: ["B"], mode: "walk" }))).code).toBe("upstream_error");
  });
});

// B8a : `ancrage: erreur de Google réduite à son code` pour `chargerTrajets` sur le client Routes réel.
describe("ancrage: erreur de Google réduite à son code (client Routes réel)", () => {
  it("chargerTrajets : réponse 403 à corps sentinelle → upstream_error, sans sentinelle ni durée", async () => {
    const { client } = monter([async () => json({ error: { message: `SENTINELLE-FOURNISSEUR ${CLE}` } }, 403)]);
    const points = [
      { placeId: "SENTINELLE_A", position: { lat: 48.85, lng: 2.35 } },
      { placeId: "SENTINELLE_B", position: { lat: 48.86, lng: 2.35 } },
    ];
    const resultat = await chargerTrajets(points, ["walk"], client);
    expect(resultat).toEqual({ ok: false, code: "upstream_error", retryable: false });
    expect(JSON.stringify(resultat)).not.toContain("SENTINELLE-FOURNISSEUR");
  });
});
