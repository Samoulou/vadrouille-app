// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { CODES_ERREUR_GOOGLE, ErreurClientGoogle } from "@/grounding/enveloppe-google";
import { createPlacesClient, MASQUE_DETAILS, MASQUE_TEXT_SEARCH, ORIGINE_PLACES, SKU_DETAILS, SKU_TEXT_SEARCH, type OptionsPlaces } from "@/grounding/places-client";
import { CODE_CLE_ABSENTE } from "@/server/env/egress";

import { creerHorlogeManuelle } from "../../tests/support/horloge-manuelle";
import { creerPortMemoire } from "../../tests/support/port-consommation-memoire";

/**
 * Client réel de Places (P0r1), toujours avec un transport de test. Valeurs sentinelles pour chaque champ Google et
 * pour la clé : aucune ne sort dans un message, un code ou une exception.
 */

const CLE = "SENTINELLE-CLE-GOOGLE-91c2";
const ENV = { VERCEL_ENV: "preview", GOOGLE_MAPS_SERVER_KEY: CLE } as const;
const TOUJOURS = { du: 0, au: Number.MAX_SAFE_INTEGER };
const CONTEXTE = () => ({ nature: "execution" as const, executionId: "exec-1", periodes: { jour: TOUJOURS, mois: TOUJOURS } });
const PLACE_ID = "SENTINELLE_PLACE_ID_42";

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

const json = (valeur: unknown, statut = 200) => new Response(JSON.stringify(valeur), { status: statut, headers: { "content-type": "application/json" } });

function monter(reponses: (() => Promise<Response>)[], options: Partial<OptionsPlaces> = {}) {
  const horloge = creerHorlogeManuelle();
  const port = creerPortMemoire(horloge);
  const appels: Appel[] = [];
  const transport = vi.fn(async (url: string, init: RequestInit) => {
    appels.push({ url, init });
    const suivante = reponses.shift();
    if (suivante === undefined) throw new Error("transport appelé une fois de trop");
    return suivante();
  });
  const client = createPlacesClient({ usage: port, contexte: CONTEXTE, plafonds: [], horloge, environnement: ENV, ...options }, transport);
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

const DETAILS = {
  id: PLACE_ID,
  businessStatus: "OPERATIONAL",
  location: { latitude: 48.8566123, longitude: 2.3522456 },
  regularOpeningHours: {
    periods: [
      { open: { day: 1, hour: 9, minute: 30 }, close: { day: 1, hour: 18, minute: 0 } },
      { open: { day: 5, hour: 20, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } },
    ],
  },
  displayName: { text: "SENTINELLE-NOM" },
  formattedAddress: "SENTINELLE-ADRESSE",
};

describe("p0: egress, un seul contrat (Places)", () => {
  it.each([
    ["production_refused", { VERCEL_ENV: "production" }],
    ["proxy_env_refused", { VERCEL_ENV: "preview", https_proxy: "http://p:3128" }],
    ["tls_env_refused", { VERCEL_ENV: "preview", NODE_TLS_REJECT_UNAUTHORIZED: "0" }],
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
    const transport = vi.fn();
    let erreur: unknown;
    try {
      createPlacesClient({ usage: creerPortMemoire(horloge), contexte: CONTEXTE, plafonds: [], horloge, environnement }, transport);
    } catch (e) {
      erreur = e;
    }
    expect((erreur as ErreurClientGoogle).code).toBe(code);
    expect(lue).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });

  it("clé absente : code fermé", () => {
    const horloge = creerHorlogeManuelle();
    expect(() => createPlacesClient({ usage: creerPortMemoire(horloge), contexte: CONTEXTE, plafonds: [], horloge, environnement: { VERCEL_ENV: "preview" } }, vi.fn())).toThrow(
      CODE_CLE_ABSENTE,
    );
  });

  it("les codes de la barrière font partie des codes fermés du client", () => {
    for (const code of ["production_refused", "proxy_env_refused", "tls_env_refused", CODE_CLE_ABSENTE]) {
      expect(CODES_ERREUR_GOOGLE).toContain(code);
    }
  });
});

describe("p0: les clients réels n'appellent que leurs hôtes figés ; no-store sur chaque appel Google (Places)", () => {
  it("Text Search IDs only : POST sur l'origine figée, clé en en-tête, masque places.id, no-store, redirect manual", async () => {
    const { client, appels, port } = monter([async () => json({ places: [{ id: PLACE_ID }, { id: "AUTRE_ID" }] })]);
    const reponse = await client.textSearch({ texte: "musée", biais: { lat: 48.85, lng: 2.35, rayonMetres: 5_000 } });
    expect(reponse).toEqual({ placeIds: [PLACE_ID, "AUTRE_ID"] });
    expect(appels).toHaveLength(1);
    const { url, init } = premier(appels);
    expect(new URL(url).origin).toBe(ORIGINE_PLACES);
    expect(new URL(url).pathname).toBe("/v1/places:searchText");
    expect(new URL(url).search).toBe("");
    expect(url).not.toContain(CLE);
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("manual");
    const entetes = new Headers(init.headers);
    expect(entetes.get("x-goog-api-key")).toBe(CLE);
    expect(entetes.get("x-goog-fieldmask")).toBe(MASQUE_TEXT_SEARCH);
    expect(JSON.parse(String(init.body))).toEqual({
      textQuery: "musée",
      pageSize: 5,
      locationBias: { circle: { center: { latitude: 48.85, longitude: 2.35 }, radius: 5_000 } },
    });
    expect(port.lignes.map((l) => [l.etat, l.demande.methode, l.demande.sku, l.demande.coutEstimeMicros])).toEqual([["confirmee", "places_text_search", SKU_TEXT_SEARCH, 0]]);
  });

  it("Place Details : GET de l'identifiant, masque minimal, horaires convertis, champs non demandés ignorés", async () => {
    const { client, appels, port } = monter([async () => json(DETAILS)]);
    const details = await client.details(PLACE_ID);
    expect(details).toEqual({
      placeId: PLACE_ID,
      statut: "OPERATIONAL",
      position: { lat: 48.8566123, lng: 2.3522456 },
      horaires: [
        { jour: 1, debut: 570, fin: 1080 },
        { jour: 5, debut: 1200, fin: 1440 },
      ],
    });
    expect(JSON.stringify(details)).not.toContain("SENTINELLE-NOM");
    const { url, init } = premier(appels);
    expect(new URL(url).origin).toBe(ORIGINE_PLACES);
    expect(new URL(url).pathname).toBe(`/v1/places/${PLACE_ID}`);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.cache).toBe("no-store");
    expect(new Headers(init.headers).get("x-goog-fieldmask")).toBe(MASQUE_DETAILS);
    expect(port.lignes.map((l) => [l.etat, l.demande.sku])).toEqual([["confirmee", SKU_DETAILS]]);
  });

  it("ouvert en permanence (une période sans fermeture) : sept plages pleines", async () => {
    const { client } = monter([async () => json({ ...DETAILS, regularOpeningHours: { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] } })]);
    expect((await client.details(PLACE_ID)).horaires).toHaveLength(7);
  });

  it("identifiant de lieu mal formé : invalid_request, ni réservation ni requête (aucun chemin construit)", async () => {
    const { client, transport, port } = monter([]);
    for (const id of ["../x", "a/b", "a?key=1", "", "x".repeat(257), "a#b"]) {
      expect((await erreurDe(client.details(id))).code).toBe("invalid_request");
    }
    expect(transport).not.toHaveBeenCalled();
    expect(port.lignes).toEqual([]);
  });

  it("réponse dont l'identifiant diffère ou mal formée : invalid_response", async () => {
    const { client } = monter([async () => json({ ...DETAILS, id: "AUTRE" }), async () => json({ places: "x" }), async () => new Response("pas du json")]);
    expect((await erreurDe(client.details(PLACE_ID))).code).toBe("invalid_response");
    expect((await erreurDe(client.textSearch({ texte: "x", biais: null }))).code).toBe("invalid_response");
    expect((await erreurDe(client.details(PLACE_ID))).code).toBe("invalid_response");
  });
});

describe("p0: une réponse 30x ne déclenche aucune requête secondaire (Places)", () => {
  it.each([301, 302, 303, 307, 308])("%i : upstream_redirect, un seul appel, corps abandonné", async (statut) => {
    const { client, appels, port } = monter([
      async () => new Response("SENTINELLE-CORPS", { status: statut, headers: { location: "https://exemple.org/" } }),
      async () => json(DETAILS),
    ]);
    const erreur = await erreurDe(client.details(PLACE_ID));
    expect(erreur.code).toBe("upstream_redirect");
    expect(appels).toHaveLength(1);
    expect(port.lignes.map((l) => l.etat)).toEqual(["abandonnee"]);
  });

  it.each([
    [
      "erreur de transport",
      async () => {
        throw new TypeError("SENTINELLE-FOURNISSEUR");
      },
      "upstream_unavailable",
      true,
    ],
    ["429", async () => json({ error: { message: "SENTINELLE-FOURNISSEUR" } }, 429), "upstream_rate_limited", true],
    ["500", async () => json({ error: { message: "SENTINELLE-FOURNISSEUR" } }, 500), "upstream_unavailable", true],
    ["403", async () => json({ error: { message: `SENTINELLE-FOURNISSEUR ${CLE} ${PLACE_ID}` } }, 403), "upstream_error", false],
  ] as [string, () => Promise<Response>, string, boolean][])("%s : code fermé, aucune sentinelle ni clé dans l'erreur", async (_nom, reponse, code, reessayable) => {
    const { client, appels } = monter([reponse]);
    const erreur = await erreurDe(client.details(PLACE_ID));
    expect(erreur.code).toBe(code);
    expect(erreur.retryable).toBe(reessayable);
    expect(appels).toHaveLength(1);
    const texte = `${erreur.message} ${JSON.stringify(erreur)} ${erreur.stack ?? ""}`;
    for (const sentinelle of ["SENTINELLE-FOURNISSEUR", CLE, "SENTINELLE-NOM"]) expect(texte).not.toContain(sentinelle);
  });
});

describe("p0: réservation avant chaque requête (Places)", () => {
  it("quota du jour atteint : cap_reached, transport jamais appelé", async () => {
    const { client, transport } = monter([async () => json(DETAILS)], {
      plafonds: [{ portee: "jour", fournisseur: "google", methode: "places_details", maxRequetes: 1 }],
    });
    await client.details(PLACE_ID);
    expect((await erreurDe(client.details(PLACE_ID))).code).toBe("cap_reached");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("enveloppe atteinte : envelope_reached", async () => {
    const { client, transport } = monter([], { plafonds: [{ portee: "enveloppe", fournisseur: "google", maxCoutMicros: 10_000 }] });
    expect((await erreurDe(client.details(PLACE_ID))).code).toBe("envelope_reached");
    expect(transport).not.toHaveBeenCalled();
  });

  it("port muet : usage_unavailable, transport jamais appelé", async () => {
    const horloge = creerHorlogeManuelle();
    const usage = { ...creerPortMemoire(horloge), reserve: () => new Promise<never>(() => undefined) };
    const transport = vi.fn();
    const client = createPlacesClient({ usage, contexte: CONTEXTE, plafonds: [], horloge, environnement: ENV }, transport);
    const issue = erreurDe(client.textSearch({ texte: "x", biais: null }));
    await horloge.avancer(2_000);
    expect((await issue).code).toBe("usage_unavailable");
    expect(transport).not.toHaveBeenCalled();
  });

  it("délai de 10 s : upstream_timeout, réservation abandonnée", async () => {
    const { client, horloge, port, appels } = monter([
      () =>
        new Promise<Response>((_resolve, rejeter) => {
          appels[0]?.init.signal?.addEventListener("abort", () => rejeter(new DOMException("abandon", "AbortError")), { once: true });
        }),
    ]);
    const issue = erreurDe(client.details(PLACE_ID));
    await horloge.avancer(10_000);
    expect((await issue).code).toBe("upstream_timeout");
    expect(port.lignes.map((l) => l.etat)).toEqual(["abandonnee"]);
  });
});
