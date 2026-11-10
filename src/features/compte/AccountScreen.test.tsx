import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fail, ok } from "@/contracts";
import * as messages from "@/i18n/messages";
import { deleteAccount, hasRecentSignIn, requestCode, signOut, verifyCode } from "@/server/actions/compte";

import { axeViolations } from "../../../tests/unit/axe";

import { AccountScreen, type AccountScreenProps } from "./AccountScreen";
import { demanderExport, enregistrerFichier, quitterVers, type IssueExport } from "./export-client";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/compte", () => ({
  deleteAccount: vi.fn(),
  hasRecentSignIn: vi.fn(),
  requestCode: vi.fn(),
  signOut: vi.fn(),
  verifyCode: vi.fn(),
}));
vi.mock("./export-client", () => ({ demanderExport: vi.fn(), enregistrerFichier: vi.fn(), quitterVers: vi.fn() }));

/**
 * « Ton compte » (M9c, ticket 1122 ; spécification M9 § 1.3, § 6.4 critères 1 à 10, § 7) : états de l'écran, actions et
 * téléchargement simulés. Le parcours réel (`api`) est `tests/e2e/compte-api.api.spec.ts`.
 */

const t = messages.compte;
const c = messages.connexion;
const EMAIL = "samuel@exemple.test";
const FICHIER: IssueExport = { kind: "fichier", nom: "vadrouille-mes-donnees-2026-11-09.json", contenu: new Blob(["{}"]) };

function renderScreen(props: Partial<AccountScreenProps> = {}) {
  return render(<AccountScreen email={EMAIL} simulated={false} {...props} />);
}

const bouton = (name: string) => screen.getByRole("button", { name });
const titre = (name: string) => screen.getByRole("heading", { level: 1, name });
const cells = () => screen.getAllByRole("textbox", { name: /^Chiffre \d sur 6$/ }) as HTMLInputElement[];

async function cliquer(name: string) {
  await act(async () => {
    fireEvent.click(bouton(name));
  });
}

async function saisirCode(code = "246810") {
  await act(async () => {
    fireEvent.paste(cells()[0]!, { clipboardData: { getData: () => code } });
  });
}

function reseau(enLigne: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(enLigne);
}

beforeEach(() => {
  vi.mocked(demanderExport).mockReset().mockResolvedValue(FICHIER);
  vi.mocked(enregistrerFichier).mockReset();
  vi.mocked(quitterVers).mockReset();
  vi.mocked(deleteAccount).mockReset().mockResolvedValue(ok({ deleted: true }));
  vi.mocked(hasRecentSignIn).mockReset().mockResolvedValue(true);
  vi.mocked(signOut).mockReset().mockResolvedValue(ok({ signedOut: true }));
  vi.mocked(requestCode).mockReset().mockResolvedValue(ok({ sent: true }));
  vi.mocked(verifyCode).mockReset().mockResolvedValue(ok({ signedIn: true }));
  router.push.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AccountScreen : page (critères 1, 9 et 10)", () => {
  it("titre, adresse de la session, les trois actions et leurs aides ; retour vers « Mes voyages »", async () => {
    const { container } = renderScreen();
    expect(titre(t.titre)).toBeInTheDocument();
    expect(screen.getByText(`Connecté avec ${EMAIL}`)).toBeVisible();
    expect(bouton(t.export.bouton)).toHaveAccessibleDescription(t.export.aide);
    expect(bouton(t.suppression.bouton)).toHaveAccessibleDescription(t.suppression.aide);
    expect(bouton(t.deconnexion.bouton)).toBeInTheDocument();
    expect(screen.queryByText(t.suppression.simulee)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(bouton("Retour"));
    expect(router.push).toHaveBeenCalledWith("/voyages");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("mock : la suppression n'est pas proposée, mention « Disponible avec un vrai compte. »", async () => {
    const { container } = renderScreen({ simulated: true });
    expect(screen.queryByRole("button", { name: t.suppression.bouton })).toBeNull();
    expect(screen.getByText(t.suppression.simulee)).toBeVisible();
    expect(bouton(t.export.bouton)).toBeInTheDocument();
    expect(bouton(t.deconnexion.bouton)).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("AccountScreen : exporter (critère 3)", () => {
  it("connexion récente : le fichier est enregistré sans écran de plus, annonce « Ton fichier est prêt. »", async () => {
    renderScreen();
    await cliquer(t.export.bouton);
    expect(demanderExport).toHaveBeenCalledExactlyOnceWith();
    expect(enregistrerFichier).toHaveBeenCalledExactlyOnceWith(FICHIER.kind === "fichier" ? FICHIER.nom : "", expect.any(Blob));
    expect(screen.getByRole("status")).toHaveTextContent(t.export.pret);
    expect(titre(t.titre)).toBeInTheDocument();
  });

  it("mock : le fichier du jeu simulé est demandé", async () => {
    renderScreen({ simulated: true });
    await cliquer(t.export.bouton);
    expect(demanderExport).toHaveBeenCalledExactlyOnceWith();
    expect(enregistrerFichier).toHaveBeenCalledTimes(1);
  });

  it("connexion ancienne : « Confirme que c'est toi », puis le téléchargement repart après un code juste", async () => {
    vi.mocked(demanderExport).mockResolvedValueOnce({ kind: "reauthentification" });
    const { container } = renderScreen();
    await cliquer(t.export.bouton);
    expect(titre(t.reauthentification.titre)).toHaveFocus();
    expect(screen.getByText(`Pour protéger tes données, on t'envoie un code à ${EMAIL}.`)).toBeVisible();
    expect(enregistrerFichier).not.toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);

    await cliquer(t.reauthentification.recevoir);
    expect(requestCode).toHaveBeenCalledExactlyOnceWith({ email: EMAIL });
    expect(screen.getByText(t.reauthentification.saisie)).toBeVisible();
    await saisirCode();
    expect(verifyCode).toHaveBeenCalledExactlyOnceWith({ email: EMAIL, code: "246810" });
    // Retour à l'action choisie, sans la choisir de nouveau (§ 1.3 point 3).
    expect(titre(t.titre)).toHaveFocus();
    expect(demanderExport).toHaveBeenCalledTimes(2);
    expect(enregistrerFichier).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(t.export.pret);
  });

  it("« Retour » depuis le code de l'export : « Ton compte », rien de téléchargé", async () => {
    vi.mocked(demanderExport).mockResolvedValueOnce({ kind: "reauthentification" });
    renderScreen();
    await cliquer(t.export.bouton);
    await cliquer("Retour");
    expect(titre(t.titre)).toHaveFocus();
    expect(demanderExport).toHaveBeenCalledTimes(1);
  });

  it("plus de session : page de connexion, avec retour à « Ton compte »", async () => {
    vi.mocked(demanderExport).mockResolvedValueOnce({ kind: "session" });
    renderScreen();
    await cliquer(t.export.bouton);
    expect(quitterVers).toHaveBeenCalledExactlyOnceWith("/connexion?suite=%2Fcompte");
  });

  it("limite atteinte : message des demandes trop nombreuses, sans « Réessayer »", async () => {
    vi.mocked(demanderExport).mockResolvedValueOnce({ kind: "limite" });
    renderScreen();
    await cliquer(t.export.bouton);
    expect(screen.getByRole("alert")).toHaveTextContent(c.erreurs.rate_limited);
    expect(screen.queryByRole("button", { name: t.export.reessayer })).toBeNull();
    expect(enregistrerFichier).not.toHaveBeenCalled();
  });

  it("erreur : « Impossible de préparer ton fichier pour le moment. » avec « Réessayer », qui relance", async () => {
    vi.mocked(demanderExport).mockResolvedValueOnce({ kind: "erreur" });
    const { container } = renderScreen();
    await cliquer(t.export.bouton);
    expect(screen.getByRole("alert")).toHaveTextContent(t.export.erreur);
    expect(await axeViolations(container)).toEqual([]);
    await cliquer(t.export.reessayer);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(enregistrerFichier).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(t.export.pret);
  });
});

describe("AccountScreen : supprimer (critères 4 à 6 et 8)", () => {
  async function ouvrirExplication() {
    await cliquer(t.suppression.bouton);
  }

  it("explication : ce qui est supprimé, ce qui est gardé, rien ne se rétablit ; « Continuer » et « Garder mon compte »", async () => {
    const { container } = renderScreen();
    await ouvrirExplication();
    expect(titre(t.suppression.titre)).toHaveFocus();
    for (const texte of [t.suppression.supprime, t.suppression.garde, t.suppression.irreversible]) expect(screen.getByText(texte)).toBeVisible();
    expect(bouton(t.suppression.continuer)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.suppression.confirmerNom })).toBeNull();
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);
    await cliquer(t.suppression.garder);
    expect(titre(t.titre)).toHaveFocus();
  });

  it("connexion récente : « Continuer » mène à « Supprimer définitivement », puis à l'accueil avec l'annonce", async () => {
    const { container } = renderScreen();
    await ouvrirExplication();
    await cliquer(t.suppression.continuer);
    expect(hasRecentSignIn).toHaveBeenCalledTimes(1);
    expect(titre(t.suppression.titre)).toHaveFocus();
    // Nom accessible sans ambiguïté (critère 8), qui contient le libellé visible.
    const supprimer = bouton(t.suppression.confirmerNom);
    expect(supprimer).toHaveTextContent(t.suppression.confirmer);
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);
    await cliquer(t.suppression.confirmerNom);
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(quitterVers).toHaveBeenCalledExactlyOnceWith("/?compte=supprime");
  });

  it("connexion ancienne : le code est demandé avant « Supprimer définitivement »", async () => {
    vi.mocked(hasRecentSignIn).mockResolvedValue(false);
    renderScreen();
    await ouvrirExplication();
    await cliquer(t.suppression.continuer);
    expect(titre(t.reauthentification.titre)).toHaveFocus();
    await cliquer(t.reauthentification.recevoir);
    await saisirCode();
    expect(titre(t.suppression.titre)).toHaveFocus();
    expect(bouton(t.suppression.confirmerNom)).toBeInTheDocument();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("« Retour » depuis le code de la suppression : l'explication", async () => {
    vi.mocked(hasRecentSignIn).mockResolvedValue(false);
    renderScreen();
    await ouvrirExplication();
    await cliquer(t.suppression.continuer);
    await cliquer("Retour");
    expect(bouton(t.suppression.continuer)).toBeInTheDocument();
  });

  it("la lecture de la connexion récente échoue : le code est demandé", async () => {
    vi.mocked(hasRecentSignIn).mockRejectedValue(new Error("réseau"));
    renderScreen();
    await ouvrirExplication();
    await cliquer(t.suppression.continuer);
    expect(titre(t.reauthentification.titre)).toBeInTheDocument();
  });

  async function jusquALaConfirmation() {
    renderScreen();
    await ouvrirExplication();
    await cliquer(t.suppression.continuer);
  }

  it("reauthentication_required après la confirmation : retour au code, rien n'est supprimé, puis la confirmation de nouveau", async () => {
    vi.mocked(deleteAccount).mockResolvedValueOnce(fail("reauthentication_required"));
    await jusquALaConfirmation();
    await cliquer(t.suppression.confirmerNom);
    expect(titre(t.reauthentification.titre)).toHaveFocus();
    expect(quitterVers).not.toHaveBeenCalled();
    await cliquer(t.reauthentification.recevoir);
    await saisirCode();
    expect(bouton(t.suppression.confirmerNom)).toBeInTheDocument();
    await cliquer(t.suppression.confirmerNom);
    expect(quitterVers).toHaveBeenCalledExactlyOnceWith("/?compte=supprime");
  });

  it("paiement en attente : le texte, aucun bouton « Supprimer définitivement », « Garder mon compte » reste", async () => {
    vi.mocked(deleteAccount).mockResolvedValueOnce({ ok: false, error: { code: "payment_pending", retryable: true } });
    await jusquALaConfirmation();
    await cliquer(t.suppression.confirmerNom);
    expect(screen.getByRole("alert")).toHaveTextContent(t.suppression.paiementEnAttente);
    expect(screen.queryByRole("button", { name: t.suppression.confirmerNom })).toBeNull();
    expect(screen.queryByRole("button", { name: t.suppression.reessayer })).toBeNull();
    expect(quitterVers).not.toHaveBeenCalled();
    await cliquer(t.suppression.garder);
    expect(titre(t.titre)).toBeInTheDocument();
    // L'état du paiement n'est pas gardé : une nouvelle tentative repart de l'explication, bouton compris.
    await ouvrirExplication();
    await cliquer(t.suppression.continuer);
    expect(bouton(t.suppression.confirmerNom)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("limite atteinte : message des demandes trop nombreuses, rien n'est supprimé", async () => {
    vi.mocked(deleteAccount).mockResolvedValueOnce({ ok: false, error: { code: "rate_limited", retryable: true } });
    await jusquALaConfirmation();
    await cliquer(t.suppression.confirmerNom);
    expect(screen.getByRole("alert")).toHaveTextContent(c.erreurs.rate_limited);
    expect(bouton(t.suppression.confirmerNom)).toBeInTheDocument();
    expect(quitterVers).not.toHaveBeenCalled();
  });

  it.each([
    ["internal", async () => ({ ok: false as const, error: { code: "internal" as const, retryable: true } })],
    ["forbidden", async () => fail<never>("forbidden")],
    ["erreur de réseau", async () => Promise.reject(new Error("réseau"))],
  ])("%s : « Impossible de supprimer ton compte pour le moment. » avec « Réessayer », qui relance", async (_cas, reponse) => {
    vi.mocked(deleteAccount).mockImplementationOnce(reponse);
    await jusquALaConfirmation();
    await cliquer(t.suppression.confirmerNom);
    expect(screen.getByRole("alert")).toHaveTextContent(t.suppression.erreur);
    await cliquer(t.suppression.reessayer);
    expect(deleteAccount).toHaveBeenCalledTimes(2);
    expect(quitterVers).toHaveBeenCalledExactlyOnceWith("/?compte=supprime");
  });

  it("second onglet (unauthenticated) : l'écran mène à l'accueil, sans annonce", async () => {
    vi.mocked(deleteAccount).mockResolvedValueOnce(fail("unauthenticated"));
    await jusquALaConfirmation();
    await cliquer(t.suppression.confirmerNom);
    expect(quitterVers).toHaveBeenCalledExactlyOnceWith("/");
  });
});

describe("AccountScreen : se déconnecter (critère 2)", () => {
  it("appelle signOut et mène à l'accueil", async () => {
    renderScreen();
    await cliquer(t.deconnexion.bouton);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(quitterVers).toHaveBeenCalledExactlyOnceWith("/");
  });

  it.each([
    ["refus", async () => fail<never>("provider_error")],
    ["erreur de réseau", async () => Promise.reject(new Error("réseau"))],
  ])("%s : message, la personne reste sur « Ton compte »", async (_cas, reponse) => {
    vi.mocked(signOut).mockImplementationOnce(reponse);
    renderScreen();
    await cliquer(t.deconnexion.bouton);
    expect(screen.getByRole("alert")).toHaveTextContent(t.deconnexion.erreur);
    expect(quitterVers).not.toHaveBeenCalled();
  });
});

describe("AccountScreen : hors ligne (critère 7)", () => {
  it("bandeau ; « Exporter mes données » et « Supprimer mon compte » en aria-disabled, sans effet", async () => {
    reseau(false);
    const { container } = renderScreen();
    expect(container.querySelector("[data-kind='offline']")).toHaveTextContent(t.horsLigne);
    for (const nom of [t.export.bouton, t.suppression.bouton]) {
      expect(bouton(nom)).toHaveAttribute("aria-disabled", "true");
      expect(bouton(nom)).not.toBeDisabled();
      expect(bouton(nom)).toHaveAccessibleDescription(expect.stringContaining(t.horsLigne));
    }
    await cliquer(t.export.bouton);
    await cliquer(t.suppression.bouton);
    expect(demanderExport).not.toHaveBeenCalled();
    expect(titre(t.titre)).toBeInTheDocument();
    expect(bouton(t.deconnexion.bouton)).not.toHaveAttribute("aria-disabled");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("réseau perdu pendant la suppression : « Continuer » et « Supprimer définitivement » inactifs, « Garder mon compte » actif", async () => {
    renderScreen();
    await cliquer(t.suppression.bouton);
    reseau(false);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText(t.horsLigne)).toBeVisible();
    expect(bouton(t.suppression.continuer)).toHaveAttribute("aria-disabled", "true");
    await cliquer(t.suppression.continuer);
    expect(hasRecentSignIn).not.toHaveBeenCalled();
    expect(bouton(t.suppression.garder)).not.toHaveAttribute("aria-disabled");

    reseau(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await cliquer(t.suppression.continuer);
    reseau(false);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(bouton(t.suppression.confirmerNom)).toHaveAttribute("aria-disabled", "true");
    await cliquer(t.suppression.confirmerNom);
    expect(deleteAccount).not.toHaveBeenCalled();
    await cliquer(t.suppression.garder);
    expect(titre(t.titre)).toBeInTheDocument();
  });

  it("« Recevoir un code » en aria-disabled, sans envoi", async () => {
    vi.mocked(demanderExport).mockResolvedValueOnce({ kind: "reauthentification" });
    renderScreen();
    await cliquer(t.export.bouton);
    reseau(false);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(bouton(t.reauthentification.recevoir)).toHaveAttribute("aria-disabled", "true");
    await cliquer(t.reauthentification.recevoir);
    expect(requestCode).not.toHaveBeenCalled();
  });
});
