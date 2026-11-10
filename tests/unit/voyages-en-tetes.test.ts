// @vitest-environment node
import { describe, expect, it } from "vitest";

import { pagesLegalesRoutes } from "@/features/accueil/routes";

import { nextConfig, RESPONSE_HEADERS } from "../../next.config";

/**
 * En-têtes des pages du voyage (B6b, Q524 ; handover « Partie Q5 », règles de relecture : réponses qui servent des
 * données relues en `Cache-Control: private, no-store`). La règle couvre `/voyages` (écran 17), le Séjour, la Journée et
 * les autres pages du voyage ; la vérification sur le serveur de l'adaptateur `api` est faite par
 * `tests/e2e/lecture-api.api.spec.ts`.
 */
describe("en-têtes des pages du voyage (B6b, Q524)", () => {
  it("/voyages/:path* : privé et no-store, sans autre directive de cache", async () => {
    expect(await nextConfig.headers?.()).toEqual(RESPONSE_HEADERS);
    const rule = RESPONSE_HEADERS.find((entry) => entry.source === "/voyages/:path*");
    expect(rule?.headers).toEqual([{ key: "Cache-Control", value: "private, no-store" }]);
  });

  it("aucune règle de cache public, s-maxage ni stale-while-revalidate", () => {
    const valeurs = RESPONSE_HEADERS.flatMap((entry) => entry.headers.filter((h) => h.key === "Cache-Control").map((h) => h.value));
    for (const valeur of valeurs) expect(valeur).not.toMatch(/public|s-maxage|stale-while-revalidate/);
  });
});

// B4e (décision 0144 § 5.3 point 7) : `R9-recu`, seul HTML qui porte le lien du reçu de Stripe. Vérification sur le serveur
// mesuré par le projet `api` : `tests/e2e/debloquer-api.api.spec.ts`.
describe("en-têtes du reçu R9-recu (B4e)", () => {
  it("/voyages/:id/debloquer/recu : privé et no-store, aucun référent ; aucun en-tête Link ni Location", () => {
    const rule = RESPONSE_HEADERS.find((entry) => entry.source === "/voyages/:id/debloquer/recu");
    expect(rule?.headers).toEqual([
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ]);
    const cles = RESPONSE_HEADERS.flatMap((entry) => entry.headers.map((h) => h.key.toLowerCase()));
    expect(cles).not.toContain("link");
    expect(cles).not.toContain("location");
    expect(JSON.stringify(RESPONSE_HEADERS)).not.toMatch(/stripe/i);
  });
});


// Précommande (décision 0168) : redirection vers le paiement hébergé et page de retour.
describe("en-têtes de `/precommande`", () => {
  it("ni cache ni indexation, seule l'origine en référent", () => {
    expect(RESPONSE_HEADERS.find((entry) => entry.source === "/precommande/:path*")?.headers).toEqual([
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Referrer-Policy", value: "strict-origin" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ]);
  });

  // Ticket 1125 : les trois pages légales dépendent de variables lues à chaque requête ; elles restent sous la règle
  // de la précommande (ni cache ni indexation), sans règle à elles.
  it("pages légales : sous `/precommande/`, couvertes par la même règle", () => {
    const adresses = Object.values(pagesLegalesRoutes);
    expect(adresses).toHaveLength(3);
    for (const adresse of adresses) expect(adresse).toMatch(/^\/precommande\/[a-z-]+$/);
    expect(RESPONSE_HEADERS.filter((entry) => entry.source.startsWith("/precommande"))).toHaveLength(1);
  });
});
