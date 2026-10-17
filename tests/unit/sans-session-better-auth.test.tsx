import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_DEMO_TRIP } from "@/adapters";
import { brancherConnexionReelle, debrancherConnexionReellePourTests } from "@/adapters/better-auth";
import MesVoyagesPage from "@/app/voyages/page";
import SejourPage from "@/app/voyages/[id]/(programme)/page";
import PresentationPage from "@/app/voyages/[id]/presentation/page";
import { getGenerationStatus } from "@/server/actions/creation";
import { startCheckout } from "@/server/actions/paiement";
import { createShareLink, getShareStatus } from "@/server/actions/partage";

/**
 * Critère C7 de B3 (B3c point 5 ; 0017 § 4) : avec `AUTH_ADAPTER=better-auth` et sans session, une page de voyage
 * redirige vers `/connexion?suite=<chemin>` et une action authentifiée renvoie `unauthenticated`, sans lire l'entrée
 * ni aucune donnée. La connexion réelle est branchée comme au démarrage, avec un contexte de session vide. La partie
 * de bout en bout est le projet Playwright `auth` (`tests/e2e/sans-session.auth.spec.ts`).
 */

// `redirect` de `next/navigation` lève, comme dans Next.js.
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect, notFound: vi.fn(), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/" }));

const contexte = vi.fn(async () => null);
const operations = vi.fn();
const limiter = vi.fn();

beforeEach(() => {
  vi.stubEnv("AUTH_ADAPTER", "better-auth");
  vi.stubEnv("VADROUILLE_ENV", "ci");
  vi.stubEnv("VADROUILLE_DEMO_PAYMENT", "1");
  vi.stubEnv("VADROUILLE_DEMO_SHARE", "1");
  debrancherConnexionReellePourTests();
  brancherConnexionReelle({ operations, limiter, contexte });
});

afterEach(() => {
  vi.unstubAllEnvs();
  redirect.mockClear();
  contexte.mockClear();
});

describe("better-auth sans session", () => {
  it("pages : redirection vers l'écran 4 avec la suite de la page", async () => {
    const id = MOCK_DEMO_TRIP.tripId;
    await expect(MesVoyagesPage()).rejects.toThrow(`redirect:/connexion?suite=${encodeURIComponent("/voyages")}`);
    await expect(SejourPage({ params: Promise.resolve({ id }) })).rejects.toThrow(`redirect:/connexion?suite=${encodeURIComponent(`/voyages/${id}`)}`);
    await expect(PresentationPage({ params: Promise.resolve({ id }) })).rejects.toThrow(
      `redirect:/connexion?suite=${encodeURIComponent(`/voyages/${id}/presentation`)}`,
    );
    expect(contexte).toHaveBeenCalled();
  });

  it("actions : unauthenticated, avant la lecture de l'entrée", async () => {
    // Entrée invalide : `unauthenticated` passe avant `validation_failed` (aucune lecture sans session).
    expect(await getShareStatus({ inconnu: true })).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(await createShareLink({ tripId: MOCK_DEMO_TRIP.tripId })).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(await startCheckout({ tripId: MOCK_DEMO_TRIP.tripId })).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(await getGenerationStatus({ inconnu: true })).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(operations).not.toHaveBeenCalled();
    expect(limiter).not.toHaveBeenCalled();
  });
});
