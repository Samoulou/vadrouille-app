// @vitest-environment node
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DecisionVue } from "@/server/partage/limite-vue";

import { nextConfig } from "../../../../next.config";
import { ROUTES } from "../../../e2e/routes";

/**
 * Proxy de Next.js limité à `/p/…` (ticket 1013, M6a ; décision 0157 § 2.1 ; spécification M6 § 3.4) : adresses
 * couvertes (inventaire des routes, barre finale, requête RSC, sous-routes), en-têtes internes retirés de toute requête
 * reçue, garde fermée sans décompte, et réponse pour chaque décision du limiteur. La décision elle-même est éprouvée par
 * `limite-vue.test.ts`.
 */

const decision = vi.fn<(requete: { pathname: string; headers: { get(nom: string): string | null } }) => Promise<DecisionVue>>();
// Double complet (aucun chargement du module réel, qui atteint l'environnement et la base) : constantes recopiées de
// `limite-vue.ts`, éprouvées là par `limite-vue.test.ts`.
vi.mock("@/server/partage/limite-vue", () => ({
  EN_TETE_COMPTE: "x-vadrouille-partage-compte",
  EN_TETE_SOUS_REQUETE: "x-middleware-subrequest",
  RETRY_AFTER_SECONDES: 60,
  EN_TETES_CONFIDENTIALITE: { "Cache-Control": "private, no-store", "Referrer-Policy": "strict-origin", "X-Robots-Tag": "noindex, nofollow" },
  pageLimite: () => "<p>Trop de visites sur ce lien pour le moment.</p>",
  decisionVuePartagee: (requete: { pathname: string; headers: { get(nom: string): string | null } }) => decision(requete),
}));

const JETON = "D".repeat(43);
const COMPTE = "x-vadrouille-partage-compte";
const SOUS_REQUETE = "x-middleware-subrequest";

/** Garde du partage `api` ouverte (`ci`). */
function ouvrirApi() {
  vi.stubEnv("DATA_ADAPTER", "api");
  vi.stubEnv("AUTH_ADAPTER", "better-auth");
  vi.stubEnv("VADROUILLE_ENV", "ci");
}

async function charger() {
  return import("@/proxy");
}

function requete(chemin: string, entetes: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000${chemin}`, { headers: entetes });
}

/** En-têtes de la requête transmise à la page (`NextResponse.next({ request: { headers } })`). */
function transmis(reponse: Response): Record<string, string | null> {
  const nom = (n: string) => reponse.headers.get(`x-middleware-request-${n}`);
  return { compte: nom(COMPTE), sousRequete: nom(SOUS_REQUETE), surcharges: reponse.headers.get("x-middleware-override-headers") };
}

beforeEach(() => {
  vi.resetModules();
  decision.mockReset();
  vi.stubEnv("DATA_ADAPTER", "");
  vi.stubEnv("AUTH_ADAPTER", "");
  vi.stubEnv("VADROUILLE_ENV", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("VERCEL_TARGET_ENV", "");
  vi.stubEnv("TRUSTED_IP_HEADER", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy : adresses couvertes (config.matcher)", () => {
  it("toutes les routes /p/ de l'inventaire, avec barre finale, requête RSC et sous-routes", async () => {
    const { config } = await charger();
    const routesP = ROUTES.filter((r) => r.path.startsWith("/p/")).map((r) => r.path.replace("[token]", JETON));
    expect(routesP.length).toBeGreaterThanOrEqual(2);
    for (const chemin of [...routesP, `/p/${JETON}/`, `/p/${JETON}?_rsc=abc`, `/p/${JETON}/jour/12`, "/p", "/p/autre"]) {
      expect(unstable_doesMiddlewareMatch({ config, url: chemin }), chemin).toBe(true);
      expect(unstable_doesMiddlewareMatch({ config, url: chemin, headers: { rsc: "1", "next-router-state-tree": "x" } }), `${chemin} (RSC)`).toBe(true);
    }
  });

  it("aucune autre adresse : le proxy ne s'exécute pas ailleurs", async () => {
    const { config } = await charger();
    const autres = ROUTES.filter((r) => !r.path.startsWith("/p/")).map((r) => r.path.replace(/\[[^\]]+\]/g, "x"));
    for (const chemin of [...autres, "/pp", "/prototype/executions", "/api/calendrier/x", "/x/p/y"]) {
      expect(unstable_doesMiddlewareMatch({ config, url: chemin }), chemin).toBe(false);
    }
  });
});

describe("proxy : garde du réglage skipProxyUrlNormalize (ticket 1029, décision 0161)", () => {
  it("garde de configuration : skipProxyUrlNormalize reste à true dans next.config.ts", () => {
    // Garde du réglage seulement : ce test ne vérifie que sa valeur. Pourquoi il faut : `next/dist/server/web/adapter.js`
    // retire les en-têtes de `FLIGHT_HEADERS` (dont `Next-Router-Prefetch`) de la requête du proxy, sauf si
    // `__NEXT_NO_MIDDLEWARE_URL_NORMALIZE` (posé au build par `skipProxyUrlNormalize`) est vrai. Le comportement réel est
    // éprouvé par `tests/e2e/partage-api.api.spec.ts` (« préchargement du routeur : 204 sans corps, sans lecture »).
    expect(nextConfig.skipProxyUrlNormalize).toBe(true);
  });
});

describe("proxy : en-têtes internes retirés, garde et décisions", () => {
  const recus = { [COMPTE]: "v1.forge", [SOUS_REQUETE]: "middleware:middleware:middleware:middleware:middleware" };

  it("garde fermée (mock) : la requête passe sans décompte, en-têtes internes retirés", async () => {
    vi.stubEnv("DATA_ADAPTER", "mock");
    const { proxy } = await charger();
    const reponse = await proxy(requete(`/p/${JETON}`, { ...recus, "x-autre": "garde" }));
    expect(decision).not.toHaveBeenCalled();
    // Témoin : un autre en-tête est bien transmis par le même mécanisme.
    expect(reponse.headers.get("x-middleware-request-x-autre")).toBe("garde");
    expect(reponse.headers.get("x-middleware-next")).toBe("1");
    expect(transmis(reponse).compte).toBeNull();
    expect(transmis(reponse).sousRequete).toBeNull();
    expect(transmis(reponse).surcharges?.split(",")).not.toContain(COMPTE);
  });

  it("garde ouverte, décision « passer » : en-têtes internes retirés, rien posé", async () => {
    ouvrirApi();
    decision.mockResolvedValue({ type: "passer" });
    const { proxy } = await charger();
    const reponse = await proxy(requete(`/p/${JETON}`, recus));
    expect(decision).toHaveBeenCalledTimes(1);
    // La décision ne voit jamais l'en-tête « compté » reçu du client.
    expect(decision.mock.calls[0]?.[0].headers.get(COMPTE)).toBeNull();
    expect(decision.mock.calls[0]?.[0].pathname).toBe(`/p/${JETON}`);
    expect(transmis(reponse)).toMatchObject({ compte: null, sousRequete: null });
  });

  it("décision « compte » : l'en-tête posé sur la requête transmise, jamais sur la réponse", async () => {
    ouvrirApi();
    decision.mockResolvedValue({ type: "compte", valeur: "v1.valeur" });
    const { proxy } = await charger();
    const reponse = await proxy(requete(`/p/${JETON}/jour/2`, recus));
    expect(transmis(reponse).compte).toBe("v1.valeur");
    expect(transmis(reponse).sousRequete).toBeNull();
    expect(reponse.headers.get(COMPTE)).toBeNull();
  });

  it("décision « prechargement » : 204 sans corps, en-têtes de F10-TL-8", async () => {
    ouvrirApi();
    decision.mockResolvedValue({ type: "prechargement" });
    const { proxy } = await charger();
    const reponse = await proxy(requete(`/p/${JETON}`, { "next-router-prefetch": "1" }));
    expect(reponse.status).toBe(204);
    expect(await reponse.text()).toBe("");
    expect(reponse.headers.get("cache-control")).toBe("private, no-store");
    expect(reponse.headers.get("referrer-policy")).toBe("strict-origin");
    expect(reponse.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("décision « limite » : 429, page minimale, Retry-After et en-têtes de F10-TL-8, sans jeton", async () => {
    ouvrirApi();
    decision.mockResolvedValue({ type: "limite" });
    const { proxy } = await charger();
    const reponse = await proxy(requete(`/p/${JETON}`));
    expect(reponse.status).toBe(429);
    expect(reponse.headers.get("retry-after")).toBe("60");
    expect(reponse.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(reponse.headers.get("cache-control")).toBe("private, no-store");
    expect(reponse.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const corps = await reponse.text();
    expect(corps).toContain("Trop de visites sur ce lien pour le moment.");
    expect(corps).not.toContain(JETON);
  });
});
