// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { CODES_ERREUR_GOOGLE, ErreurClientGoogle } from "@/grounding/enveloppe-google";
import { ancrerLogement as ancrerLogementP0, RAYON_BIAIS_METRES } from "@/grounding/ancrage";
import { ancrerCandidats, ancrerLogementsSuggeres, verifierLogement, zoneEtDepart } from "@/grounding/ancrage-production";
import { chargerFiches, ficherSerie, rafraichirPlaceId } from "@/grounding/fiches";
import { fichesEtapeFinale, fichesLogementsEtapeFinale } from "@/grounding/fiches-finales";
import { ErreurAncrage } from "@/grounding/interfaces";
import { CODES_ANCRAGE } from "@/grounding/resultat";
import { zoneDuSejour } from "@/grounding/zone";
import {
  COUT_ESTIME_MICROS,
  createPlacesClient,
  MASQUE_DETAILS,
  MASQUE_IDENTIFIANT,
  MASQUE_POSITION,
  MASQUE_TEXT_SEARCH,
  ORIGINE_PLACES,
  SKU_DETAILS,
  SKU_IDENTIFIANT,
  SKU_POSITION,
  SKU_TEXT_SEARCH,
  type OptionsPlaces,
} from "@/grounding/places-client";
import { CODE_CLE_ABSENTE } from "@/server/env/egress";

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


/** Prix d'un SKU dans la table commitée (`prototype/config/prix-google.json`), en micro-USD par unité (0049 E2). */
function prixUnitaireMicros(sku: string): number {
  const table = z
    .object({ skus: z.record(z.string(), z.object({ prixPour1000: z.number() })) })
    .parse(JSON.parse(readFileSync(path.join(import.meta.dirname, "../../prototype/config/prix-google.json"), "utf8")));
  const ligne = new Map(Object.entries(table.skus)).get(sku);
  if (ligne === undefined) throw new Error(`SKU absent de la table : ${sku}`);
  return ligne.prixPour1000 * 1_000;
}

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
        // B8a (0085 § 2 point d) : `fin` reste 1 440 (P0) ; la fermeture du lendemain est portée à part.
        { jour: 5, debut: 1200, fin: 1440, finLendemain: 120 },
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

  it("fiche sans businessStatus (quartier, parc, site naturel ; Q460) : acceptée, sans statut ni horaires", async () => {
    const quartier: Record<string, unknown> = { ...DETAILS };
    delete quartier.businessStatus;
    delete quartier.regularOpeningHours;
    const { client, port } = monter([async () => json(quartier), async () => json({ ...quartier, businessStatus: "BUSINESS_STATUS_UNSPECIFIED" })]);
    for (let i = 0; i < 2; i += 1) {
      const details = await client.details(PLACE_ID);
      expect(details).toStrictEqual({ placeId: PLACE_ID, position: { lat: 48.8566123, lng: 2.3522456 }, horaires: null });
      expect("statut" in details).toBe(false);
    }
    expect(port.lignes.map((l) => l.etat)).toEqual(["confirmee", "confirmee"]);
  });

  it("JSON proto3 (Q460) : day, hour et minute absents valent 0 (période sans minute, ouverture dimanche minuit)", async () => {
    const periodes = [
      // Lundi 9 h – 18 h, heures pile : aucune minute écrite.
      { open: { day: 1, hour: 9 }, close: { day: 1, hour: 18 } },
      // Dimanche minuit (ni day, ni hour, ni minute) – dimanche 12 h.
      { open: {}, close: { hour: 12 } },
    ];
    const { client } = monter([
      async () => json({ ...DETAILS, regularOpeningHours: { periods: periodes } }),
      async () => json({ ...DETAILS, regularOpeningHours: { periods: [{ open: {} }] } }),
    ]);
    expect((await client.details(PLACE_ID)).horaires).toEqual([
      { jour: 1, debut: 540, fin: 1080 },
      { jour: 0, debut: 0, fin: 720 },
    ]);
    // Ouvert en permanence, ouverture sans aucun champ : sept plages pleines.
    expect((await client.details(PLACE_ID)).horaires).toHaveLength(7);
  });

  it("point d'horaire hors bornes ou non entier : toujours invalid_response", async () => {
    const { client } = monter([
      async () => json({ ...DETAILS, regularOpeningHours: { periods: [{ open: { day: 7 } }] } }),
      async () => json({ ...DETAILS, regularOpeningHours: { periods: [{ open: { minute: 1.5 } }] } }),
    ]);
    expect((await erreurDe(client.details(PLACE_ID))).code).toBe("invalid_response");
    expect((await erreurDe(client.details(PLACE_ID))).code).toBe("invalid_response");
  });

  it("businessStatus inconnu de l'énumération : toujours invalid_response", async () => {
    const { client } = monter([async () => json({ ...DETAILS, businessStatus: "STATUT_INCONNU" })]);
    expect((await erreurDe(client.details(PLACE_ID))).code).toBe("invalid_response");
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

describe("p0: Text Search restreint à la zone (Places, 0055 § 6 point 3)", () => {
  const ZONE = { sudOuest: { lat: 48.6, lng: 2.0 }, nordEst: { lat: 49.1, lng: 2.7 } };

  it("restriction : locationRestriction en rectangle, sans biais, même origine, masque et SKU", async () => {
    const { client, appels, port } = monter([async () => json({ places: [{ id: PLACE_ID }] })]);
    const reponse = await client.textSearch({ texte: "musée", biais: null, restriction: ZONE });
    expect(reponse).toEqual({ placeIds: [PLACE_ID] });
    const { url, init } = premier(appels);
    expect(new URL(url).origin).toBe(ORIGINE_PLACES);
    expect(new URL(url).pathname).toBe("/v1/places:searchText");
    expect(new Headers(init.headers).get("x-goog-fieldmask")).toBe(MASQUE_TEXT_SEARCH);
    expect(JSON.parse(String(init.body))).toEqual({
      textQuery: "musée",
      pageSize: 5,
      locationRestriction: { rectangle: { low: { latitude: 48.6, longitude: 2.0 }, high: { latitude: 49.1, longitude: 2.7 } } },
    });
    expect(port.lignes.map((l) => [l.etat, l.demande.methode, l.demande.sku])).toEqual([["confirmee", "places_text_search", SKU_TEXT_SEARCH]]);
  });

  it("sans restriction : corps inchangé (biais seul ou rien), aucun champ locationRestriction", async () => {
    const { client, appels } = monter([async () => json({}), async () => json({})]);
    await client.textSearch({ texte: "a", biais: null });
    await client.textSearch({ texte: "b", biais: { lat: 1, lng: 2, rayonMetres: 3 } });
    expect(appels.map((appel) => JSON.parse(String(appel.init.body)))).toEqual([
      { textQuery: "a", pageSize: 5 },
      { textQuery: "b", pageSize: 5, locationBias: { circle: { center: { latitude: 1, longitude: 2 }, radius: 3 } } },
    ]);
  });

  it.each([
    ["biais et restriction ensemble", { biais: { lat: 48.8, lng: 2.3, rayonMetres: 1_000 }, restriction: ZONE }],
    ["sud au nord du nord", { biais: null, restriction: { sudOuest: { lat: 49.2, lng: 2.0 }, nordEst: { lat: 49.1, lng: 2.7 } } }],
    ["ouest à l'est de l'est", { biais: null, restriction: { sudOuest: { lat: 48.6, lng: 3.0 }, nordEst: { lat: 49.1, lng: 2.7 } } }],
    ["latitude hors bornes", { biais: null, restriction: { sudOuest: { lat: -91, lng: 2.0 }, nordEst: { lat: 49.1, lng: 2.7 } } }],
    ["longitude hors bornes", { biais: null, restriction: { sudOuest: { lat: 48.6, lng: 2.0 }, nordEst: { lat: 49.1, lng: 181 } } }],
    ["NaN", { biais: null, restriction: { sudOuest: { lat: Number.NaN, lng: 2.0 }, nordEst: { lat: 49.1, lng: 2.7 } } }],
    ["infini", { biais: null, restriction: { sudOuest: { lat: 48.6, lng: 2.0 }, nordEst: { lat: 49.1, lng: Number.POSITIVE_INFINITY } } }],
  ])("%s : invalid_request avant toute réservation, transport jamais appelé", async (_cas, champs) => {
    const { client, transport, port } = monter([]);
    expect((await erreurDe(client.textSearch({ texte: "x", ...champs }))).code).toBe("invalid_request");
    expect(transport).not.toHaveBeenCalled();
    expect(port.lignes).toEqual([]);
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

describe("p0: coûts estimés de Places égaux à la table de prix (décision 0049 E2)", () => {
  it("Text Search et Details : constante du client = prix du SKU de la table", () => {
    expect(COUT_ESTIME_MICROS.textSearch).toBe(prixUnitaireMicros(SKU_TEXT_SEARCH));
    expect(COUT_ESTIME_MICROS.details).toBe(prixUnitaireMicros(SKU_DETAILS));
  });

  it("B8a : position et identifiant, constante du client = prix du SKU de la table", () => {
    expect(COUT_ESTIME_MICROS.position).toBe(prixUnitaireMicros(SKU_POSITION));
    expect(COUT_ESTIME_MICROS.identifiant).toBe(prixUnitaireMicros(SKU_IDENTIFIANT));
  });
});

/** Appel d'une méthode Place Details nommée (sans accès calculé). */
function appelerMethode(client: ReturnType<typeof createPlacesClient>, methode: "details" | "position" | "identifiant", placeId: string): Promise<unknown> {
  if (methode === "details") return client.details(placeId);
  if (methode === "position") return client.position(placeId);
  return client.identifiant(placeId);
}

/** Erreur levée par une promesse (toute classe). */
async function leve(promesse: Promise<unknown>): Promise<unknown> {
  try {
    await promesse;
  } catch (erreur) {
    return erreur;
  }
  throw new Error("aucune erreur");
}

// B8a (décision 0085 § 2 points a et b, soumis au verdict de la Sécurité).
describe("places: un masque par méthode", () => {
  const POSITION = { id: PLACE_ID, location: { latitude: 48.8566123, longitude: 2.3522456 }, displayName: { text: "SENTINELLE-NOM" } };

  it.each([
    ["details", MASQUE_DETAILS, SKU_DETAILS, DETAILS],
    ["position", MASQUE_POSITION, SKU_POSITION, POSITION],
    ["identifiant", MASQUE_IDENTIFIANT, SKU_IDENTIFIANT, { id: PLACE_ID }],
  ] as const)("%s : GET /v1/places/{id}, exactement son masque, réservation places_details à son SKU", async (methode, masque, sku, reponse) => {
    const { client, appels, port } = monter([async () => json(reponse)]);
    await appelerMethode(client, methode, PLACE_ID);
    const { url, init } = premier(appels);
    expect(new URL(url).pathname).toBe(`/v1/places/${PLACE_ID}`);
    expect(init.method).toBe("GET");
    expect(new Headers(init.headers).get("x-goog-fieldmask")).toBe(masque);
    expect(port.lignes.map((l) => [l.demande.methode, l.demande.sku, l.etat])).toEqual([["places_details", sku, "confirmee"]]);
  });

  it("position : identifiant et position seulement ; un autre id est refusé (invalid_response)", async () => {
    const { client } = monter([async () => json(POSITION), async () => json({ ...POSITION, id: "SENTINELLE_AUTRE_ID" })]);
    const lu = await client.position(PLACE_ID);
    expect(lu).toEqual({ placeId: PLACE_ID, position: { lat: 48.8566123, lng: 2.3522456 } });
    expect(JSON.stringify(lu)).not.toContain("SENTINELLE-NOM");
    expect((await erreurDe(client.position(PLACE_ID))).code).toBe("invalid_response");
  });

  it("identifiant : un autre id valide est rendu (rafraîchissement) ; un id mal formé est refusé", async () => {
    const { client } = monter([async () => json({ id: "SENTINELLE_NOUVEL_ID" }), async () => json({ id: "pas valide !" })]);
    expect(await client.identifiant(PLACE_ID)).toEqual({ placeId: "SENTINELLE_NOUVEL_ID" });
    expect((await erreurDe(client.identifiant(PLACE_ID))).code).toBe("invalid_response");
  });

  it("details : un autre id reste refusé (invalid_response)", async () => {
    const { client } = monter([async () => json({ ...DETAILS, id: "SENTINELLE_AUTRE_ID" })]);
    expect((await erreurDe(client.details(PLACE_ID))).code).toBe("invalid_response");
  });
});

// B8a (décision 0085 § 2 point c, soumis au verdict de la Sécurité).
describe("fiches: introuvable du client réel", () => {
  const corps404 = () => {
    const annule = vi.fn();
    const reponse = new Response(new ReadableStream({ cancel: annule }), { status: 404 });
    return { reponse, annule };
  };

  it.each(["details", "position", "identifiant"] as const)("%s : 404 → ErreurAncrage(place_not_found), corps abandonné, réservation comptée", async (methode) => {
    const { reponse, annule } = corps404();
    const { client, port } = monter([async () => reponse]);
    const erreur = await leve(appelerMethode(client, methode, PLACE_ID));
    expect(erreur).toBeInstanceOf(ErreurAncrage);
    expect((erreur as ErreurAncrage).code).toBe("place_not_found");
    expect(annule).toHaveBeenCalled();
    // Requête partie : la réservation est abandonnée, donc comptée (jamais libérée).
    expect(port.lignes.map((l) => l.etat)).toEqual(["abandonnee"]);
  });

  it("Text Search 404 inchangé : upstream_error ; upstream_not_found ne sort jamais du client", async () => {
    const { client } = monter([async () => json({ error: { message: "SENTINELLE-FOURNISSEUR" } }, 404)]);
    const erreur = await erreurDe(client.textSearch({ texte: "x", biais: null }));
    expect(erreur.code).toBe("upstream_error");
    for (const methode of ["details", "position", "identifiant"] as const) {
      const { client: autre } = monter([async () => json({}, 404)]);
      const levee = await leve(appelerMethode(autre, methode, PLACE_ID));
      expect((levee as { code?: string }).code).not.toBe("upstream_not_found");
    }
  });
});

// B8a : `ancrage: erreur de Google réduite à son code` sur le client réel (corps de réponse sentinelle).
describe("ancrage: erreur de Google réduite à son code (client Places réel)", () => {
  const ZONE = zoneDuSejour([{ lat: 48.8566123, lng: 2.3522456 }], RAYON_BIAIS_METRES);
  const corps = () => json({ error: { message: `SENTINELLE-FOURNISSEUR ${CLE} ${PLACE_ID}` } }, 403);
  it.each([
    ["ancrerCandidats", (c: ReturnType<typeof createPlacesClient>) => ancrerCandidats([{ id: "c", nom: "Lieu maison" }], "Ville", ZONE, c)],
    ["verifierLogement", (c: ReturnType<typeof createPlacesClient>) => verifierLogement({ kind: "known", label: "Hôtel maison" }, "Ville", c)],
    ["zoneEtDepart", (c: ReturnType<typeof createPlacesClient>) => zoneEtDepart({ kind: "area", label: "Vieille ville" }, "Ville", c)],
    ["ancrerLogementsSuggeres", (c: ReturnType<typeof createPlacesClient>) => ancrerLogementsSuggeres({ zone: { centre: { lat: 48.8566123, lng: 2.3522456 }, rayonM: 800 }, logements: [{ nom: "Hôtel" }] }, "Ville", c)],
    ["rafraichirPlaceId", (c: ReturnType<typeof createPlacesClient>) => rafraichirPlaceId({ placeId: PLACE_ID, reference: 0 }, Date.UTC(2026, 9, 17), c)],
    ["chargerFiches", (c: ReturnType<typeof createPlacesClient>) => chargerFiches([PLACE_ID], c)],
    ["ficherSerie", (c: ReturnType<typeof createPlacesClient>) => ficherSerie([{ id: "c", placeId: PLACE_ID }], { premiereSerie: 1, marge: 0 }, ZONE, c)],
  ] as const)("%s : réponse 403 à corps sentinelle → upstream_error, sans sentinelle", async (_nom, appeler) => {
    const { client, transport } = monter([async () => corps()]);
    const resultat = await appeler(client);
    expect(resultat).toEqual({ ok: false, code: "upstream_error", retryable: false });
    expect(CODES_ANCRAGE).toContain("upstream_error");
    for (const sentinelle of ["SENTINELLE-FOURNISSEUR", CLE, PLACE_ID]) expect(JSON.stringify(resultat)).not.toContain(sentinelle);
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

// B8a (décision 0085 § 2 point c, « Conséquences testables ») : effet sur `p0Run` en mode réel, soumis au verdict.
describe("p0: fiche introuvable écartée en mode réel", () => {
  const ZONE = zoneDuSejour([{ lat: 48.8566123, lng: 2.3522456 }], RAYON_BIAIS_METRES);
  const fiche = (id: string) => async () => json({ ...DETAILS, id });

  it("404 sur la fiche d'un lieu de la série : écarté, remplacé par le suivant du classement, l'exécution continue", async () => {
    const { client } = monter([fiche("SENTINELLE_P1"), async () => json({}, 404), fiche("SENTINELLE_P3")]);
    const classement = ["SENTINELLE_P1", "SENTINELLE_P2", "SENTINELLE_P3", "SENTINELLE_P4"].map((placeId, i) => ({ id: `c${i + 1}`, placeId }));
    const issue = await fichesEtapeFinale(classement, client, ZONE, { premiereSerie: 2, marge: 1 });
    expect(issue.retenus.map((r) => r.id)).toEqual(["c1", "c3"]);
    expect(issue.fiches).toBe(3);
    expect(issue.complete).toBe(true);
  });

  it("404 sur la fiche d'un logement : lodging_unresolved, comme avec le double", async () => {
    const { client } = monter([async () => json({}, 404)]);
    const erreur = await leve(fichesLogementsEtapeFinale([PLACE_ID], client));
    expect((erreur as ErreurAncrage).code).toBe("lodging_unresolved");
    const { client: ancrage } = monter([async () => json({ places: [{ id: PLACE_ID }] }), async () => json({}, 404)]);
    const viaP0 = await leve(ancrerLogementP0({ texte: "Hôtel maison", nuits: 1 }, "Ville", ancrage));
    expect((viaP0 as ErreurAncrage).code).toBe("lodging_unresolved");
  });
});

describe("places: horaires qui passent minuit (B8-PO-17)", () => {
  it("vendredi 22 h – samedi 2 h : fin 1 440 et finLendemain 120 ; deux minuits ou plus : coupée à 1 440, sans lendemain", async () => {
    const { client } = monter([
      async () => json({ ...DETAILS, regularOpeningHours: { periods: [{ open: { day: 5, hour: 22, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } }] } }),
      async () => json({ ...DETAILS, regularOpeningHours: { periods: [{ open: { day: 5, hour: 22, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } }] } }),
    ]);
    expect((await client.details(PLACE_ID)).horaires).toEqual([{ jour: 5, debut: 1320, fin: 1440, finLendemain: 120 }]);
    expect((await client.details(PLACE_ID)).horaires).toEqual([{ jour: 5, debut: 1320, fin: 1440 }]);
  });
});
