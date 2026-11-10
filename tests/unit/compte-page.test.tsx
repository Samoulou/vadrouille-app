import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { brancherConnexionReelle, debrancherConnexionReellePourTests } from "@/adapters/better-auth";
import ComptePage, { dynamic, metadata } from "@/app/compte/page";
import HomePage from "@/app/page";
import MesVoyagesPage from "@/app/voyages/page";
import * as messages from "@/i18n/messages";
import { MOCK_KNOWN_EMAIL } from "@/mocks/auth-simule";
import { accountEmail } from "@/server/actions/compte";

/**
 * Page « Ton compte » (`/compte` ; M9c, ticket 1122 ; spécification M9 § 6.4, critères 1, 4 et 10), le lien de « Mes
 * voyages » et l'annonce de l'accueil. L'écran lui-même : `src/features/compte/AccountScreen.test.tsx`.
 */

// `redirect` et `notFound` de `next/navigation` lèvent, comme dans Next.js.
const navigation = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));
vi.mock("next/navigation", () => ({ ...navigation, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/" }));
// Double entier des actions : la page ne lit que `accountEmail` ; les autres ne sont appelées par aucun rendu.
vi.mock("@/server/actions/compte", async () => {
  const { MOCK_KNOWN_EMAIL: adresse } = await import("@/mocks/auth-simule");
  return {
    accountEmail: vi.fn(async () => adresse),
    deleteAccount: vi.fn(),
    exportAccount: vi.fn(),
    hasRecentSignIn: vi.fn(),
    hasSession: vi.fn(async () => false),
    requestCode: vi.fn(),
    signOut: vi.fn(),
    verifyCode: vi.fn(),
  };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const t = messages.compte;
const CONTEXTE = { organizationId: "0d000000-0000-4000-8000-0000000000a1", userId: "0d000000-0000-4000-8000-0000000000b1", role: "owner" as const };

function connexionReelle(contexte: typeof CONTEXTE | null, data: "api" | "mock" = "api") {
  vi.stubEnv("AUTH_ADAPTER", "better-auth");
  vi.stubEnv("VADROUILLE_ENV", "ci");
  vi.stubEnv("DATA_ADAPTER", data);
  debrancherConnexionReellePourTests();
  brancherConnexionReelle({ operations: vi.fn(), limiter: vi.fn(), contexte: vi.fn(async () => contexte) });
}

afterEach(() => {
  vi.unstubAllEnvs();
  debrancherConnexionReellePourTests();
  vi.mocked(accountEmail).mockClear();
  navigation.redirect.mockClear();
});

describe("/compte", () => {
  it("rendu à chaque requête, hors des moteurs de recherche", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(metadata.title).toBe("Ton compte · Vadrouille");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("mock : adresse du compte simulé, export proposé, suppression non proposée", async () => {
    const element = await ComptePage();
    expect(element.props).toEqual({ email: MOCK_KNOWN_EMAIL, simulated: true });
    render(element);
    expect(screen.getByRole("heading", { level: 1, name: t.titre })).toBeInTheDocument();
    expect(screen.getByText(`Connecté avec ${MOCK_KNOWN_EMAIL}`)).toBeVisible();
    expect(screen.getByRole("button", { name: t.export.bouton })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.deconnexion.bouton })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.suppression.bouton })).toBeNull();
    expect(screen.getByText(t.suppression.simulee)).toBeVisible();
  });

  it("api sans session : page de connexion, avec retour à « Ton compte » ; l'adresse n'est pas lue", async () => {
    connexionReelle(null);
    await expect(ComptePage()).rejects.toThrow("redirect:/connexion?suite=%2Fcompte");
    expect(accountEmail).not.toHaveBeenCalled();
  });

  it("api avec session : adresse de la session, export et suppression réels", async () => {
    connexionReelle(CONTEXTE);
    vi.mocked(accountEmail).mockResolvedValueOnce("samuel@exemple.test");
    const element = await ComptePage();
    expect(element.props).toEqual({ email: "samuel@exemple.test", simulated: false });
    render(element);
    expect(screen.getByRole("button", { name: t.suppression.bouton })).toBeInTheDocument();
    expect(screen.queryByText(t.suppression.simulee)).toBeNull();
  });

  it("données simulées avec la connexion réelle : la suppression n'est pas proposée", async () => {
    connexionReelle(CONTEXTE, "mock");
    vi.mocked(accountEmail).mockResolvedValueOnce("samuel@exemple.test");
    expect((await ComptePage()).props).toEqual({ email: "samuel@exemple.test", simulated: true });
  });

  it("adresse illisible : page d'erreur, jamais un écran sans adresse", async () => {
    connexionReelle(CONTEXTE);
    vi.mocked(accountEmail).mockResolvedValueOnce(null);
    await expect(ComptePage()).rejects.toThrow("Adresse du compte illisible.");
  });

  it("site d'essai (adaptateur prototype) : 404, sans lire de session", async () => {
    vi.stubEnv("DATA_ADAPTER", "prototype");
    await expect(ComptePage()).rejects.toThrow("notFound");
    expect(accountEmail).not.toHaveBeenCalled();
  });
});

describe("« Mes voyages » : lien « Ton compte »", () => {
  it("mock : le lien mène à /compte", async () => {
    render(await MesVoyagesPage());
    expect(screen.getByRole("link", { name: t.lien })).toHaveAttribute("href", "/compte");
  });
});

describe("accueil : annonce après la suppression du compte", () => {
  it("?compte=supprime : « Ton compte est supprimé. » en role=status", async () => {
    render(await HomePage({ searchParams: Promise.resolve({ compte: "supprime" }) }));
    expect(screen.getByRole("status")).toHaveTextContent(t.suppression.fin);
  });

  it.each([[{}], [{ compte: "autre" }], [{ compte: ["supprime", "supprime"] }]])("%j : aucune annonce", async (searchParams) => {
    render(await HomePage({ searchParams: Promise.resolve(searchParams) }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(t.suppression.fin)).toBeNull();
  });

  it("sans paramètre de page (appel direct) : aucune annonce", async () => {
    render(await HomePage());
    expect(screen.queryByText(t.suppression.fin)).toBeNull();
  });
});
