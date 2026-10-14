// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { RequeteModele } from "@/ai/client";
import { createOpenRouterClient, ErreurOpenRouter } from "@/ai/openrouter-client";
import { ErreurClientGoogle } from "@/grounding/enveloppe-google";
import type { ClientPlaces, ClientRoutes } from "@/grounding/interfaces";
import { createPlacesClient } from "@/grounding/places-client";
import { dureeSimulee } from "@/grounding/routes.simule";
import { createRoutesClient } from "@/grounding/routes-client";
import type { Periode } from "@/server/usage/port";

import { creerHorlogeManuelle } from "../../support/horloge-manuelle";
import { creerPortMemoire } from "../../support/port-consommation-memoire";
import { charger, executerCapture, type Capture } from "./harnais";

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
 * Tests par **valeurs sentinelles** de P0r1 (spécification `specs/P0-suite-executions-reelles.md`, « Prompts et contenu
 * web » et « Tests attendus » ; mineur 12 de la revue du head `d97c72a`) :
 * - `prompts: aucun prompt ne contient de donnée Google` : l'orchestrateur tourne avec les **clients réels** Places et
 *   Routes de P0r1, sur un transport de test qui joue Google et renvoie une valeur unique pour **chaque** champ (nom,
 *   adresse, coordonnées, identifiant de lieu, note, prix, durées, distances, polylignes), champs hors masque compris ;
 *   la clé de test est une sentinelle. Ni les prompts (requêtes capturées, puis corps émis par le client réel de
 *   modèles), ni les requêtes de recherche web, ni le journal, ni le rapport n'en contiennent une seule ; le programme
 *   réduit ne garde que l'identifiant de lieu, type maison prévu pour lui.
 * - `journaux: ni donnée Google, ni brief, ni clé` : journal du script et sorties de la console (exportateur simulé :
 *   tout ce qui est écrit par `console`) pendant l'exécution et pendant les erreurs des trois clients réels.
 * - `p0: erreur de fournisseur réduite à un code` : réponses d'erreur simulées qui contiennent ces sentinelles et la clé
 *   de test, pour Places (Text Search, Place Details), Routes et le client de modèles.
 * Aucun service réel : le `fetch` global est remplacé par un double qui échoue s'il est appelé.
 */

const CLE_GOOGLE = "SENTINELLE-CLE-GOOGLE-5e8d";
const CLE_MODELES = "SENTINELLE-CLE-MODELES-c41b";
const ENV_GOOGLE = { VERCEL_ENV: "preview", GOOGLE_MAPS_SERVER_KEY: CLE_GOOGLE } as const;
const ENV_MODELES = { VERCEL_ENV: "preview", OPENROUTER_API_KEY: CLE_MODELES } as const;
const TOUJOURS: Periode = { du: 0, au: Number.MAX_SAFE_INTEGER };
const CONTEXTE = () => ({ nature: "execution" as const, executionId: "exec-sentinelles", periodes: { jour: TOUJOURS, mois: TOUJOURS } });

const fetchGlobal = vi.fn(async () => {
  throw new Error("fetch global appelé");
});

/** Tout ce qui passe par `console` pendant le fichier (exportateur simulé des journaux). */
const console_: string[] = [];
beforeAll(() => {
  vi.stubGlobal("fetch", fetchGlobal);
  for (const methode of ["log", "info", "warn", "error", "debug", "trace"] as const) {
    vi.spyOn(console, methode).mockImplementation((...args: unknown[]) => {
      console_.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack ?? ""}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
  }
});
afterAll(() => {
  expect(fetchGlobal).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const { brief, fixtures } = charger();
const lieux = Object.entries(fixtures.places.lieux);

// --- Google simulé : une valeur unique par champ ---------------------------------------------------------------

/** Valeurs Google propres à chaque lieu (index dans les fixtures) : nom, adresse, note, nombre d'avis, prix. */
const nomGoogle = (i: number) => `SENTINELLE-G-NOM-${i}`;
const adresseGoogle = (i: number) => `SENTINELLE-G-ADRESSE-${i}`;
const noteGoogle = (i: number) => Number(`2.7${String(i).padStart(2, "0")}81`);
const avisGoogle = (i: number) => 908_070_000 + i;
const prixGoogle = (i: number) => `PRICE_LEVEL_SENTINELLE_${i}`;
/** Valeurs Routes propres à chaque élément : distance, polyligne, durée statique. */
const DISTANCE_BASE = 876_540_000;
const POLYLIGNE = "SENTINELLE_POLYLIGNE_";
const DUREE_STATIQUE = "7654321s";

/** Toutes les sentinelles Google, identifiants de lieu à part (seuls admis, dans les types maison prévus). */
function sentinellesGoogle(): { placeIds: string[]; autres: string[] } {
  const autres = new Set<string>(["SENTINELLE-G-", "PRICE_LEVEL_SENTINELLE", POLYLIGNE, "87654", "7654321", "4321", "908070"]);
  lieux.forEach(([, lieu], i) => {
    autres.add(nomGoogle(i));
    autres.add(adresseGoogle(i));
    autres.add(String(noteGoogle(i)));
    autres.add(String(Math.abs(lieu.position.lat)));
    autres.add(String(Math.abs(lieu.position.lng)));
  });
  return { placeIds: lieux.map(([, lieu]) => lieu.placeId), autres: [...autres] };
}

/** Plages maison (minutes) vers les périodes de Places (jour, heure, minute) ; 1 440 : fermeture le lendemain à 0 h. */
function periodesDe(horaires: readonly { jour: number; debut: number; fin: number }[]) {
  const point = (jour: number, minutes: number) => ({ day: jour, hour: Math.floor(minutes / 60), minute: minutes % 60 });
  return horaires.map(({ jour, debut, fin }) => ({
    open: point(jour, debut),
    close: fin >= 1440 ? point((jour + 1) % 7, 0) : point(jour, fin),
  }));
}

const json = (valeur: unknown, statut = 200) => new Response(JSON.stringify(valeur), { status: statut, headers: { "content-type": "application/json" } });

type AppelGoogle = { url: string; init: RequestInit };

/** Transport qui joue Places et Routes à partir des fixtures, avec tous les champs (masque ignoré). */
function transportGoogle(appels: AppelGoogle[]) {
  const parNom = new Map(lieux.map(([nom, lieu], i) => [nom, { lieu, i }]));
  const parId = new Map(lieux.map(([, lieu], i) => [lieu.placeId, { lieu, i }]));
  let element = 0;
  return async (url: string, init: RequestInit): Promise<Response> => {
    appels.push({ url, init });
    const { pathname } = new URL(url);
    const corps = typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    if (pathname === "/v1/places:searchText") {
      const texte = String(corps.textQuery ?? "");
      const nom = texte.lastIndexOf(", ") === -1 ? texte : texte.slice(0, texte.lastIndexOf(", "));
      const trouve = parNom.get(nom);
      if (trouve === undefined) return json({});
      return json({
        places: [
          {
            id: trouve.lieu.placeId,
            displayName: { text: nomGoogle(trouve.i), languageCode: "fr" },
            formattedAddress: adresseGoogle(trouve.i),
            location: { latitude: trouve.lieu.position.lat, longitude: trouve.lieu.position.lng },
            rating: noteGoogle(trouve.i),
          },
        ],
      });
    }
    if (pathname.startsWith("/v1/places/")) {
      const trouve = parId.get(pathname.slice("/v1/places/".length));
      if (trouve === undefined) return json({ error: { message: `${CLE_GOOGLE} SENTINELLE-G-INCONNU` } }, 404);
      const { lieu, i } = trouve;
      return json({
        id: lieu.placeId,
        businessStatus: lieu.statut,
        location: { latitude: lieu.position.lat, longitude: lieu.position.lng },
        ...(lieu.horaires === null ? {} : { regularOpeningHours: { periods: periodesDe(lieu.horaires), weekdayDescriptions: [nomGoogle(i)] } }),
        displayName: { text: nomGoogle(i), languageCode: "fr" },
        formattedAddress: adresseGoogle(i),
        shortFormattedAddress: adresseGoogle(i),
        rating: noteGoogle(i),
        userRatingCount: avisGoogle(i),
        priceLevel: prixGoogle(i),
      });
    }
    if (pathname === "/distanceMatrix/v2:computeRouteMatrix") {
      const ids = (cote: unknown) => (cote as { waypoint: { placeId: string } }[]).map((w) => w.waypoint.placeId);
      const origines = ids(corps.origins);
      const destinations = ids(corps.destinations);
      const elements = origines.flatMap((de, a) =>
        destinations.map((vers, b) => {
          element += 1;
          return {
            originIndex: a,
            destinationIndex: b,
            duration: `${dureeSimulee(fixtures.routes, de, vers)}s`,
            staticDuration: DUREE_STATIQUE,
            distanceMeters: DISTANCE_BASE + element,
            polyline: { encodedPolyline: `${POLYLIGNE}${element}` },
            condition: "ROUTE_EXISTS",
          };
        }),
      );
      return json(elements);
    }
    return json({ error: "chemin inattendu" }, 400);
  };
}

function clientsGoogle(transport: (url: string, init: RequestInit) => Promise<Response>): { places: ClientPlaces; routes: ClientRoutes } {
  const horloge = creerHorlogeManuelle();
  const usage = creerPortMemoire(horloge);
  const options = { usage, contexte: CONTEXTE, plafonds: [], horloge, environnement: ENV_GOOGLE };
  return { places: createPlacesClient(options, transport), routes: createRoutesClient(options, transport) };
}

/** Sentinelles trouvées dans un texte (vide si aucune). */
const presentes = (texte: string, valeurs: readonly string[]) => valeurs.filter((v) => texte.includes(v));

/** Textes du brief qu'un journal ne doit jamais contenir (5 caractères au moins, pour éviter les faux positifs). */
function textesDuBrief(): string[] {
  const textes = [brief.destination, ...brief.logements.map((l) => l.texte), ...(brief.recit === undefined ? [] : [brief.recit])];
  return textes.filter((t) => t.length >= 5);
}

/** Erreur, message, pile, cause et sérialisation : tout ce qui peut sortir d'une exception. */
function texteErreur(erreur: unknown): string {
  if (!(erreur instanceof Error)) return String(erreur);
  return [erreur.message, erreur.stack ?? "", JSON.stringify(erreur), String(erreur.cause ?? ""), String(erreur)].join(" ");
}

afterEach(() => {
  fetchGlobal.mockClear();
});

// --- Exécution complète avec les clients réels Places et Routes --------------------------------------------------

let execution: { capture: Capture; resultat: Awaited<ReturnType<typeof executerCapture>>["resultat"]; appelsGoogle: AppelGoogle[] } | undefined;
async function executerAvecClientsReels() {
  if (execution !== undefined) return execution;
  const appelsGoogle: AppelGoogle[] = [];
  const { capture, resultat } = await executerCapture({ google: clientsGoogle(transportGoogle(appelsGoogle)) });
  execution = { capture, resultat, appelsGoogle };
  return execution;
}

describe("prompts: aucun prompt ne contient de donnée Google", () => {
  it("l'exécution passe par les clients réels Places et Routes (transport de test) et va jusqu'au programme", async () => {
    const { resultat, appelsGoogle, capture } = await executerAvecClientsReels();
    expect(resultat.programme).toBeDefined();
    const chemins = appelsGoogle.map((a) => new URL(a.url).pathname);
    expect(chemins.some((c) => c === "/v1/places:searchText")).toBe(true);
    expect(chemins.some((c) => c.startsWith("/v1/places/"))).toBe(true);
    expect(chemins.some((c) => c === "/distanceMatrix/v2:computeRouteMatrix")).toBe(true);
    // Les réponses servies portaient chaque champ sentinelle : elles sont filtrées par les clients, pas absentes.
    expect(appelsGoogle.length).toBeGreaterThan(10);
    for (const etape of ["plan", "recherche", "notation", "raisons"]) expect(capture.requetes.some((r) => r.etape === etape), etape).toBe(true);
  });

  it("ni les prompts (étapes plan, recherche, notation, raisons) ni les requêtes de recherche web ne contiennent une sentinelle Google ou la clé", async () => {
    const { capture } = await executerAvecClientsReels();
    const { placeIds, autres } = sentinellesGoogle();
    const interdits = [...autres, ...placeIds, "SENTINELLE_PLACE_ID", CLE_GOOGLE];
    expect(presentes(JSON.stringify(capture.requetes), interdits)).toEqual([]);
    expect(capture.recherches.length).toBeGreaterThan(0);
    expect(presentes(JSON.stringify(capture.recherches), interdits)).toEqual([]);
    // Les pages lues sont celles de la recherche web, jamais une adresse construite à partir de Google.
    expect(presentes(JSON.stringify(capture.lectures), interdits)).toEqual([]);
  });

  it("les corps émis par le client réel de modèles (mêmes prompts) ne contiennent aucune sentinelle Google ni clé Google", async () => {
    const { capture } = await executerAvecClientsReels();
    const corps: string[] = [];
    const horloge = creerHorlogeManuelle();
    const client = createOpenRouterClient(
      { usage: creerPortMemoire(horloge), contexte: CONTEXTE, plafonds: [], coutEstimeMicros: 1, horloge, environnement: ENV_MODELES },
      async (_url, init) => {
        corps.push(typeof init.body === "string" ? init.body : "");
        return reponseModeleOk();
      },
    );
    for (const requete of capture.requetes) await client.envoyer(requete);
    expect(corps).toHaveLength(capture.requetes.length);
    const { placeIds, autres } = sentinellesGoogle();
    expect(presentes(corps.join("\n"), [...autres, ...placeIds, "SENTINELLE_PLACE_ID", CLE_GOOGLE])).toEqual([]);
  });

  it("le rapport n'en contient aucune ; le programme réduit ne garde que l'identifiant de lieu (types maison prévus) et, dans positions seulement, ses coordonnées", async () => {
    const { resultat } = await executerAvecClientsReels();
    const { autres, placeIds } = sentinellesGoogle();
    expect(presentes(JSON.stringify(resultat.rapport), [...autres, ...placeIds, CLE_GOOGLE])).toEqual([]);
    // `positions` (placeId → coordonnées, limitée au programme : réponse de Samuel à P0-Q8) est le seul endroit des coordonnées.
    const { positions, ...reste } = resultat.programme as unknown as { positions: Record<string, { lat: number; lng: number }> };
    expect(presentes(JSON.stringify(reste), [...autres, CLE_GOOGLE])).toEqual([]);
    for (const [placeId, position] of Object.entries(positions)) {
      expect(placeIds).toContain(placeId);
      expect(Object.keys(position).sort()).toEqual(["lat", "lng"]);
    }
  });
});

describe("journaux: ni donnée Google, ni brief, ni clé", () => {
  it("journal du script et console : aucune sentinelle Google, aucun texte du brief, aucune clé (clients réels)", async () => {
    const { capture } = await executerAvecClientsReels();
    const { placeIds, autres } = sentinellesGoogle();
    const interdits = [...autres, ...placeIds, "SENTINELLE_PLACE_ID", CLE_GOOGLE, CLE_MODELES, ...textesDuBrief()];
    expect(capture.journal.length).toBeGreaterThan(0);
    expect(presentes(capture.journal.join("\n"), interdits)).toEqual([]);
    for (const ligne of capture.journal) expect(Object.keys(JSON.parse(ligne) as object).every((cle) => cle === "code" || cle === "compteurs")).toBe(true);
    expect(presentes(console_.join("\n"), interdits)).toEqual([]);
  });

  it("aucun client réel n'écrit dans la console, en succès comme en erreur", async () => {
    const avant = console_.length;
    const { places, routes } = clientsGoogle(async () => json({ error: { message: `${CLE_GOOGLE} SENTINELLE-G-NOM-0` } }, 500));
    await expect(places.details("SENTINELLE_PLACE_ID_001")).rejects.toBeInstanceOf(ErreurClientGoogle);
    await expect(routes.matrice({ origines: ["SENTINELLE_PLACE_ID_001"], destinations: ["SENTINELLE_PLACE_ID_002"], mode: "walk" })).rejects.toBeInstanceOf(
      ErreurClientGoogle,
    );
    const modeles = clientModeles(async () => json({ error: { message: `${CLE_MODELES} SENTINELLE-G-NOM-0` } }, 500));
    await expect(modeles.envoyer(requeteModele())).rejects.toBeInstanceOf(ErreurOpenRouter);
    expect(console_.slice(avant)).toEqual([]);
  });
});

// --- Erreurs de fournisseur -----------------------------------------------------------------------------------

const PLACE_ID = "SENTINELLE_PLACE_ID_001";
const AUTRE_ID = "SENTINELLE_PLACE_ID_002";
/** Corps d'erreur simulé : la clé de test, l'identifiant de lieu et une valeur de chaque champ Google. */
const MESSAGE_FOURNISSEUR = `${CLE_GOOGLE} ${CLE_MODELES} ${PLACE_ID} ${nomGoogle(0)} ${adresseGoogle(0)} 55.9533123 ${POLYLIGNE}1 ${DUREE_STATIQUE} ${DISTANCE_BASE + 1}`;
const INTERDITS_ERREUR = [CLE_GOOGLE, CLE_MODELES, PLACE_ID, nomGoogle(0), adresseGoogle(0), "55.9533123", POLYLIGNE, "7654321", String(DISTANCE_BASE + 1)];

const REPONSES_ERREUR: [string, () => Promise<Response>][] = [
  ["400", async () => json({ error: { code: 400, message: MESSAGE_FOURNISSEUR, status: "INVALID_ARGUMENT" } }, 400)],
  ["403", async () => json({ error: { message: MESSAGE_FOURNISSEUR } }, 403)],
  ["404", async () => json({ error: { message: MESSAGE_FOURNISSEUR } }, 404)],
  ["429", async () => json({ error: { message: MESSAGE_FOURNISSEUR } }, 429)],
  ["500", async () => new Response(MESSAGE_FOURNISSEUR, { status: 500 })],
  ["302", async () => new Response(MESSAGE_FOURNISSEUR, { status: 302, headers: { location: `https://exemple.org/${PLACE_ID}?key=${CLE_GOOGLE}` } })],
  ["200 illisible", async () => new Response(MESSAGE_FOURNISSEUR, { status: 200 })],
  ["200 hors schéma", async () => json({ id: MESSAGE_FOURNISSEUR, places: MESSAGE_FOURNISSEUR, originIndex: MESSAGE_FOURNISSEUR })],
  [
    "erreur réseau",
    async () => {
      throw new TypeError(MESSAGE_FOURNISSEUR);
    },
  ],
];

function clientModeles(transport: (url: string, init: RequestInit) => Promise<Response>) {
  const horloge = creerHorlogeManuelle();
  return createOpenRouterClient({ usage: creerPortMemoire(horloge), contexte: CONTEXTE, plafonds: [], coutEstimeMicros: 1, horloge, environnement: ENV_MODELES }, transport);
}

function requeteModele(): RequeteModele {
  return {
    etape: "notation",
    modele: "fournisseur/modele-test",
    routage: { data_collection: "deny" },
    prompt: { id: "notation", version: 1 },
    messages: [
      { role: "system", contenu: "Consigne." },
      { role: "user", contenu: "Question." },
    ],
  };
}

function reponseModeleOk() {
  return json({
    id: "gen-1",
    object: "chat.completion",
    created: 1,
    model: "fournisseur/modele-test",
    choices: [{ index: 0, message: { role: "assistant", content: "{}" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: 0.000001 },
  });
}

async function erreurDe(promesse: Promise<unknown>): Promise<unknown> {
  try {
    await promesse;
  } catch (erreur) {
    return erreur;
  }
  throw new Error("aucune erreur");
}

describe("p0: erreur de fournisseur réduite à un code", () => {
  const appels: [string, (transport: (url: string, init: RequestInit) => Promise<Response>) => Promise<unknown>][] = [
    ["Places Text Search", (t) => clientsGoogle(t).places.textSearch({ texte: "Nom maison, Édimbourg", biais: null })],
    ["Places Details", (t) => clientsGoogle(t).places.details(PLACE_ID)],
    ["Routes", (t) => clientsGoogle(t).routes.matrice({ origines: [PLACE_ID], destinations: [AUTRE_ID], mode: "walk" })],
    ["modèles", (t) => clientModeles(t).envoyer(requeteModele())],
  ];

  for (const [client, appeler] of appels) {
    it.each(REPONSES_ERREUR)(`${client}, réponse %s : code fermé, ni clé, ni identifiant de lieu, ni valeur Google dans l'erreur`, async (_nom, reponse) => {
      const erreur = await erreurDe(appeler(reponse));
      expect(erreur instanceof ErreurClientGoogle || erreur instanceof ErreurOpenRouter).toBe(true);
      const code = (erreur as ErreurClientGoogle | ErreurOpenRouter).code;
      expect(code).toMatch(/^[a-z_]+$/);
      expect((erreur as Error).message).toBe(code);
      expect((erreur as Error).cause).toBeUndefined();
      expect(presentes(texteErreur(erreur), INTERDITS_ERREUR)).toEqual([]);
    });
  }
});
