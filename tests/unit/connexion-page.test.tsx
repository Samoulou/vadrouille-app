import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as adapters from "@/adapters";
import ConnexionPage, { dynamic } from "@/app/(creation)/connexion/page";
import { DraftProvider } from "@/features/creation/DraftProvider";
import * as messages from "@/i18n/messages";
import { hasSession } from "@/server/actions/compte";

// `redirect` de `next/navigation` lève, comme dans Next.js ; `next/navigation` n'est importé que par `src/` (confinement).
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), redirect }));
vi.mock("@/server/actions/compte", () => ({ requestCode: vi.fn(), verifyCode: vi.fn(), hasSession: vi.fn(async () => false) }));
vi.mock("@/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters")>();
  return { ...actual, getAuthAdapter: vi.fn(actual.getAuthAdapter) };
});

/** `R4` (spécification F8, écran 4 ; décision 0017 § 3.5 et § 11.2). */

const t = messages.connexion;

async function renderPage(suite?: string | string[]) {
  const element = await ConnexionPage({ searchParams: Promise.resolve(suite === undefined ? {} : { suite }) });
  render(<DraftProvider>{element}</DraftProvider>);
  return element;
}

afterEach(() => {
  vi.unstubAllEnvs();
  redirect.mockClear();
  vi.mocked(adapters.getAuthAdapter).mockClear();
});

describe("/connexion", () => {
  it("rendu à chaque requête", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("adaptateur simulé : avertissement visible, durée du code lue de la configuration de l'adaptateur", async () => {
    const element = await renderPage("/voyages/nouveau/lancer");
    expect(element.props).toMatchObject({ suite: "/voyages/nouveau/lancer", codeTtlMs: 600_000, authMode: "simulated" });
    expect(screen.getByText(t.simulee)).toBeVisible();
  });

  it("adaptateur non simulé : aucun avertissement (valeur serveur, jamais déduite côté client)", async () => {
    const actual = await vi.importActual<typeof import("@/adapters")>("@/adapters");
    const real = actual.getAuthAdapter();
    vi.mocked(adapters.getAuthAdapter).mockReturnValueOnce({ ...real, mode: "real", config: { ...real.config, codeTtlMs: 300_000 } });
    const element = await renderPage("/voyages/nouveau/lancer");
    expect(element.props).toMatchObject({ codeTtlMs: 300_000, authMode: "real" });
    expect(screen.queryByText(t.simulee)).toBeNull();
  });

  it.each([
    [undefined, "/voyages"],
    ["https://exemple.org", "/voyages"],
    ["//exemple.org", "/voyages"],
    ["javascript:alert(1)", "/voyages"],
    [["/voyages/mock_trip_edimbourg/preparation", "//exemple.org"], "/voyages/mock_trip_edimbourg/preparation"],
  ])("suite %j : %s, seule la valeur normalisée atteint l'écran", async (suite, expected) => {
    const element = await renderPage(suite);
    expect(element.props.suite).toBe(expected);
  });

  it("F8c : appelée par la création avec une session, l'adresse est remplacée par R-lancer (écran 4 sauté)", async () => {
    vi.mocked(hasSession).mockResolvedValueOnce(true);
    await expect(ConnexionPage({ searchParams: Promise.resolve({ suite: "/voyages/nouveau/lancer" }) })).rejects.toThrow("redirect:/voyages/nouveau/lancer");
    expect(redirect).toHaveBeenCalledWith("/voyages/nouveau/lancer");
  });

  it("F8c : une session ne fait sauter l'écran 4 que depuis la création", async () => {
    vi.mocked(hasSession).mockResolvedValue(true);
    try {
      const element = await renderPage("/voyages");
      expect(element.props.suite).toBe("/voyages");
      expect(redirect).not.toHaveBeenCalled();
    } finally {
      vi.mocked(hasSession).mockResolvedValue(false);
    }
  });

  it("garde fermée (déploiement de production) : la page lève, l'erreur générique s'affiche", async () => {
    vi.stubEnv("VADROUILLE_ENV", "production");
    await expect(ConnexionPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(/connexion simulée refusée/);
  });
});
