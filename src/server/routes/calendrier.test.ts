import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdapterContext } from "@/adapters";
import type { Trip } from "@/contracts";
import { calendrierRoute } from "@/features/sejour/routes";
import { edimbourg, edimbourgDebloque } from "@/mocks/edimbourg";

import { RATE_LIMITS } from "@/server/config/limites";
import { createRateLimiter, type RateLimitClient } from "@/server/rate-limit";

import { creerRouteCalendrier, type DependancesCalendrier, limiteurCalendrier } from "./calendrier";

/**
 * Route `GET /api/v1/voyages/[id]/calendrier` (spécification M6 § 6.2, critères 1 à 3 ; décision 0157 § 1.6 point 2 et
 * § 2.5, S5 ; ticket 1005, M6b), appelée directement avec des dépendances injectées : aucune base, aucun `process.env`.
 */

const CTX: AdapterContext = { organizationId: "org-a", userId: "user-a", role: "owner" };
const ID = edimbourgDebloque.id;

function route(surcharges: Partial<DependancesCalendrier> = {}, voyages: Record<string, Trip> = { [ID]: edimbourgDebloque, [edimbourg.id]: edimbourg }) {
  const espions = {
    contexte: vi.fn(async () => CTX as AdapterContext | null),
    lireVoyage: vi.fn(async (ctx: AdapterContext, id: string) => (ctx.organizationId === "org-a" ? (voyages[id] ?? null) : null)),
    limiteur: vi.fn(async () => ({ ok: true }) as const),
    version: vi.fn(async () => 5 as number | null),
  };
  const gestionnaire = creerRouteCalendrier({
    adaptateur: () => "mock",
    origine: () => "https://app.exemple.test",
    maintenant: () => new Date("2026-08-01T10:00:00Z"),
    ...espions,
    ...surcharges,
  });
  const appeler = (id: string) => gestionnaire(new Request(`https://app.exemple.test${calendrierRoute(id)}`), { params: Promise.resolve({ id }) });
  return { appeler, espions };
}

async function sansContenu(reponse: Response, statut: number) {
  expect(reponse.status).toBe(statut);
  expect(await reponse.text()).toBe("");
  expect(reponse.headers.get("cache-control")).toBe("private, no-store");
  expect(reponse.headers.get("x-content-type-options")).toBe("nosniff");
  expect(reponse.headers.get("content-disposition")).toBeNull();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("calendrier : route (critères 1 à 3)", () => {
  it("critère 3 : en-têtes du fichier, début BEGIN:VCALENDAR puis VERSION:2.0 ; SEQUENCE = version courante", async () => {
    const { appeler, espions } = route();
    const reponse = await appeler(ID);
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(reponse.headers.get("content-disposition")).toBe('attachment; filename="programme.ics"');
    expect(reponse.headers.get("cache-control")).toBe("private, no-store");
    expect(reponse.headers.get("x-content-type-options")).toBe("nosniff");
    const texte = await reponse.text();
    expect(texte.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(texte).toContain("\r\nX-WR-CALNAME:Édimbourg · Programme\r\n");
    expect(texte).toContain("\r\nSEQUENCE:5\r\n");
    expect(texte).toContain(`\r\nURL:https://app.exemple.test/voyages/${ID}/jour/2\r\n`);
    expect(espions.version).toHaveBeenCalledWith(CTX, ID, "mock");
    // `mock` : aucun limiteur (il est en base).
    expect(espions.limiteur).not.toHaveBeenCalled();
  });

  it("critère 1 : voyage non débloqué → 404 sans contenu", async () => {
    const { appeler } = route();
    await sansContenu(await appeler(edimbourg.id), 404);
  });

  it("critère 2 : sans session, même réponse que le Séjour sans session (redirection vers l'écran 4, suite le Séjour)", async () => {
    const { appeler, espions } = route({ contexte: async () => null });
    const reponse = await appeler(ID);
    await sansContenu(reponse, 307);
    expect(reponse.headers.get("location")).toBe(`/connexion?suite=${encodeURIComponent(`/voyages/${ID}`)}`);
    expect(espions.lireVoyage).not.toHaveBeenCalled();
  });

  it("critère 2 : autre organisation ou voyage inconnu → 404 sans contenu", async () => {
    await sansContenu(await route({ contexte: async () => ({ ...CTX, organizationId: "org-b" }) }).appeler(ID), 404);
    await sansContenu(await route().appeler("voyage-inconnu"), 404);
  });

  it("[id] contrôlé avant toute lecture : hors de TRIP_ID_PATTERN → 404, ni session ni lecture", async () => {
    const { appeler, espions } = route();
    for (const id of ["a/b", "x".repeat(65), "é", "a b", ""]) await sansContenu(await appeler(id), 404);
    expect(espions.contexte).not.toHaveBeenCalled();
    expect(espions.lireVoyage).not.toHaveBeenCalled();
  });

  it("site d'essai (prototype) : 404, sans session ni lecture", async () => {
    const { appeler, espions } = route({ adaptateur: () => "autre" });
    await sansContenu(await appeler(ID), 404);
    expect(espions.contexte).not.toHaveBeenCalled();
    expect(espions.lireVoyage).not.toHaveBeenCalled();
  });

  it("api : limite `calendrier` par voyage, après le contrôle du voyage et avant la version ; au-delà 429 sans programme", async () => {
    const ordre: string[] = [];
    const { appeler, espions } = route({
      adaptateur: () => "api",
      lireVoyage: async (_ctx, id) => {
        ordre.push("voyage");
        return id === ID ? edimbourgDebloque : null;
      },
      limiteur: async (_request, tripId) => {
        ordre.push(`limiteur:${tripId}`);
        return { ok: false, kind: "trip" };
      },
    });
    await sansContenu(await appeler(ID), 429);
    expect(ordre).toEqual(["voyage", `limiteur:${ID}`]);
    expect(espions.version).not.toHaveBeenCalled();

    // Voyage d'une autre organisation : 404 avant le limiteur (aucun débit pour un voyage qui n'est pas le sien).
    ordre.length = 0;
    await sansContenu(await appeler("autre-voyage"), 404);
    expect(ordre).toEqual(["voyage"]);
  });

  it("api : limiteur admis → fichier, SEQUENCE lue sur `api`", async () => {
    const { appeler, espions } = route({ adaptateur: () => "api" });
    const reponse = await appeler(ID);
    expect(reponse.status).toBe(200);
    expect(espions.limiteur).toHaveBeenCalledTimes(1);
    expect(espions.version).toHaveBeenCalledWith(CTX, ID, "api");
  });

  it("critère 10 : toutes les journées en préparation → 404, pas de fichier, sans débit du limiteur (refus gratuit avant lui)", async () => {
    const tout = { ...edimbourgDebloque, days: edimbourgDebloque.days.map((d) => ({ ...d, generating: true })) };
    for (const adaptateur of ["mock", "api"] as const) {
      const { appeler, espions } = route({ adaptateur: () => adaptateur }, { [ID]: tout });
      await sansContenu(await appeler(ID), 404);
      expect(espions.version).not.toHaveBeenCalled();
      expect(espions.limiteur).not.toHaveBeenCalled();
    }
  });

  it("version illisible → 500 sans contenu, une ligne calendrier.version_unavailable sans champ", async () => {
    const lignes: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void lignes.push(args.map(String).join(" ")));
    await sansContenu(await route({ version: async () => null }).appeler(ID), 500);
    expect(lignes.map((l) => JSON.parse(l) as unknown)).toEqual([{ level: "error", event: "calendrier.version_unavailable" }]);
    expect(lignes.join("\n")).not.toContain(ID);
  });

  it("api : limiteur réel branché (RATE_LIMITS, pool simulé) : 30 fichiers par voyage et par heure, puis 429", async () => {
    let compte = 0;
    const client: RateLimitClient = {
      async query(text) {
        if (text.startsWith("INSERT INTO action_rate_limits")) return { rows: [{ count: ++compte }] };
        return { rows: [] };
      },
      release() {},
    };
    const [hmac = ""] = Object.keys({ RATE_LIMIT_HMAC_SECRET: 0 });
    const env = { VADROUILLE_ENV: "ci", TRUSTED_IP_HEADER: "x-vercel-forwarded-for", [hmac]: randomBytes(32).toString("base64url") };
    const limiteur = createRateLimiter({ pool: { connect: async () => client }, env, config: RATE_LIMITS });
    // Sur `api`, l'identifiant d'un voyage est un uuid (le limiteur refuse tout autre identifiant).
    const UUID = "0d000000-0000-4000-8000-0000000000aa";
    const { appeler } = route({ adaptateur: () => "api", limiteur: limiteurCalendrier(limiteur.verdict) }, { [UUID]: { ...edimbourgDebloque, id: UUID } });
    for (let i = 0; i < 30; i += 1) expect((await appeler(UUID)).status).toBe(200);
    await sansContenu(await appeler(UUID), 429);
    expect(compte).toBe(31);
  });

  it("sans APP_URL : fichier servi, sans URL ni lien", async () => {
    const texte = await (await route({ origine: () => null }).appeler(ID)).text();
    expect(texte.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(texte).not.toMatch(/^URL:/m);
    expect(texte).not.toContain("http");
  });
});
