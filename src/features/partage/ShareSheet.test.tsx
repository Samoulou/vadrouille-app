import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CreatedShareLink, Result, ShareStatus } from "@/contracts";

import { axeViolations } from "../../../tests/unit/axe";

import { ShareSheet, type ShareActions } from "./ShareSheet";

vi.mock("@/server/actions/partage", () => ({
  createShareLink: vi.fn(),
  getShareStatus: vi.fn(),
  revokeShareLink: vi.fn(),
}));

/** Feuille « Partager ton voyage » (spécification F10, F10c : C27, C28, C33, C34, C37, C41). */

const TRIP = "mock_trip_edimbourg_debloque";
const TOKEN = "A".repeat(43);
const ACTIVE: Result<ShareStatus> = { ok: true, value: { active: true, createdAt: "2026-08-01T11:00:00.000Z", expiresOn: "2026-10-03" } };
const NONE: Result<ShareStatus> = { ok: true, value: { active: false } };
const CREATED: Result<CreatedShareLink> = { ok: true, value: { token: TOKEN, createdAt: "2026-08-30T09:40:00.000Z", expiresOn: "2026-10-03" } };
const FAILED = { ok: false, error: { code: "not_found" } } as const;

/** Promesse résolue par le test, pour observer l'envoi en cours. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function actions(overrides: Partial<ShareActions> = {}): ShareActions {
  return {
    getShareStatus: vi.fn(async () => ACTIVE),
    createShareLink: vi.fn(async () => CREATED),
    revokeShareLink: vi.fn(async () => NONE),
    ...overrides,
  };
}

function renderSheet(injected: ShareActions) {
  const onReturnFocus = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ShareSheet open onOpenChange={onOpenChange} tripId={TRIP} timeZone="Europe/London" onReturnFocus={onReturnFocus} actions={injected} />,
  );
  return { dialog: screen.getByRole("dialog"), onReturnFocus, onOpenChange };
}

const button = (name: string) => within(screen.getByRole("dialog")).getByRole("button", { name });
const queryButton = (name: string) => within(screen.getByRole("dialog")).queryByRole("button", { name });
const loaded = () => waitFor(() => expect(screen.queryByText("Chargement du partage.")).toBeNull());

/** `navigator` remplacé pour un test (presse-papiers, partage natif), rétabli après lui. */
function stubNavigator(extra: { clipboard?: { writeText: (text: string) => Promise<void> }; share?: (data: ShareData) => Promise<void> }) {
  vi.stubGlobal("navigator", { onLine: true, userAgent: window.navigator.userAgent, language: "fr", ...extra });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ouverture et lecture de l'état (C27, C41)", () => {
  it("feuille modale titrée « Partager ton voyage », focus sur le titre de niveau 2", async () => {
    const { dialog } = renderSheet(actions());
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const title = within(dialog).getByRole("heading", { level: 2, name: "Partager ton voyage" });
    expect(title).toHaveFocus();
    expect(dialog).toHaveAccessibleName("Partager ton voyage");
    expect(dialog).toHaveTextContent(
      "Toute personne qui a ce lien voit ton programme et sa carte, sans pouvoir le modifier. Elle ne voit ni ton logement, ni ta liste à réserver, ni ton budget.",
    );
    await loaded();
  });

  it("chargement : annonce « Chargement du partage. », aucun bouton d'action jusqu'à la réponse", async () => {
    const pending = deferred<Result<ShareStatus>>();
    const injected = actions({ getShareStatus: vi.fn(() => pending.promise) });
    renderSheet(injected);
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Chargement du partage.");
    for (const name of ["Créer un lien", "Créer un nouveau lien", "Désactiver le lien"]) expect(queryButton(name)).toBeNull();
    expect(injected.getShareStatus).toHaveBeenCalledWith({ tripId: TRIP });
    await act(async () => pending.resolve(NONE));
    expect(button("Créer un lien")).toBeVisible();
  });

  it("échec de la lecture : bandeau d'erreur, « Réessayer » relit l'état", async () => {
    const getShareStatus = vi.fn<ShareActions["getShareStatus"]>().mockResolvedValueOnce(FAILED).mockResolvedValueOnce(ACTIVE);
    renderSheet(actions({ getShareStatus }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Impossible de modifier le partage pour le moment.");
    expect(queryButton("Désactiver le lien")).toBeNull();
    fireEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(getShareStatus).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Un lien est actif depuis le 1er août 2026.")).toBeVisible();
  });
});

describe("lien actif, création, copie (C28)", () => {
  it("lien actif : dates à l'heure de la destination, sans adresse ; axe sans violation", async () => {
    const { dialog } = renderSheet(actions());
    await loaded();
    expect(screen.getByText("Un lien est actif depuis le 1er août 2026.")).toBeVisible();
    expect(screen.getByText("Valable jusqu'au 3 octobre 2026.")).toBeVisible();
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    expect(button("Créer un nouveau lien")).toBeVisible();
    expect(button("Désactiver le lien")).toBeVisible();
    expect(await axeViolations(dialog)).toEqual([]);
  });

  it("créer : champ « Lien de partage » avec l'adresse complète, focus dessus ; contour border-control", async () => {
    const injected = actions({ getShareStatus: vi.fn(async () => NONE) });
    const { dialog } = renderSheet(injected);
    await loaded();
    fireEvent.click(button("Créer un lien"));
    const field = await within(dialog).findByRole("textbox", { name: "Lien de partage" });
    expect(field).toHaveValue(`${window.location.origin}/p/${TOKEN}`);
    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveClass("border-border-control");
    await waitFor(() => expect(field).toHaveFocus());
    expect(screen.getByText("Copie-le maintenant : il ne pourra plus s'afficher.")).toBeVisible();
    expect(screen.getByText("Valable jusqu'au 3 octobre 2026.")).toBeVisible();
    expect(injected.createShareLink).toHaveBeenCalledWith({ tripId: TRIP });
    expect(await axeViolations(dialog)).toEqual([]);
  });

  it("partage réel (jeton signé, décision 0135 § 7) : le lien est stable, « Copie-le maintenant » n'est pas affiché", async () => {
    const signed = `v1.${"B".repeat(40)}.${"C".repeat(43)}`;
    const injected = actions({
      getShareStatus: vi.fn(async () => NONE),
      createShareLink: vi.fn(
        async (): Promise<Result<CreatedShareLink>> => ({ ok: true, value: { token: signed, createdAt: "2026-08-30T09:40:00.000Z", expiresOn: "2026-10-03" } }),
      ),
    });
    const { dialog } = renderSheet(injected);
    await loaded();
    fireEvent.click(button("Créer un lien"));
    const field = await within(dialog).findByRole("textbox", { name: "Lien de partage" });
    expect(field).toHaveValue(`${window.location.origin}/p/${signed}`);
    expect(screen.getByText("Ce lien reste le même pour ce voyage : « Créer un lien » te le redonnera.")).toBeVisible();
    expect(screen.queryByText("Copie-le maintenant : il ne pourra plus s'afficher.")).toBeNull();
    expect(await axeViolations(dialog)).toEqual([]);
  });

  it("« Copier le lien » écrit l'adresse dans le presse-papiers et annonce « Lien copié. »", async () => {
    const writeText = vi.fn(async () => {});
    stubNavigator({ clipboard: { writeText } });
    renderSheet(actions({ getShareStatus: vi.fn(async () => NONE) }));
    await loaded();
    fireEvent.click(button("Créer un lien"));
    fireEvent.click(await screen.findByRole("button", { name: "Copier le lien" }));
    await waitFor(() => expect(screen.getByText("Lien copié.")).toBeVisible());
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/${TOKEN}`);
    expect(screen.getByText("Lien copié.")).toHaveAttribute("role", "status");
  });

  it("presse-papiers refusé : « Copie impossible. Sélectionne le lien pour le copier. », texte du champ sélectionné (C41)", async () => {
    stubNavigator({ clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("refus"))) } });
    renderSheet(actions({ getShareStatus: vi.fn(async () => NONE) }));
    await loaded();
    fireEvent.click(button("Créer un lien"));
    const field = (await screen.findByRole("textbox", { name: "Lien de partage" })) as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Copier le lien" }));
    await waitFor(() => expect(screen.getByText("Copie impossible. Sélectionne le lien pour le copier.")).toBeVisible());
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);
  });

  it("« Envoyer… » seulement avec navigator.share, appelé avec l'adresse", async () => {
    renderSheet(actions({ getShareStatus: vi.fn(async () => NONE) }));
    await loaded();
    fireEvent.click(button("Créer un lien"));
    await screen.findByRole("textbox", { name: "Lien de partage" });
    expect(queryButton("Envoyer…")).toBeNull();
  });

  it("« Envoyer… » avec navigator.share simulé", async () => {
    const share = vi.fn(async () => {});
    stubNavigator({ share });
    renderSheet(actions({ getShareStatus: vi.fn(async () => NONE) }));
    await loaded();
    fireEvent.click(button("Créer un lien"));
    fireEvent.click(await screen.findByRole("button", { name: "Envoyer…" }));
    expect(share).toHaveBeenCalledWith({ url: `${window.location.origin}/p/${TOKEN}` });
  });
});

describe("désactiver et remplacer (C28, C33)", () => {
  it("« Désactiver le lien » puis « Annuler » : rien n'est envoyé, focus sur « Désactiver le lien »", async () => {
    const injected = actions();
    renderSheet(injected);
    await loaded();
    fireEvent.click(button("Désactiver le lien"));
    expect(screen.getByText("Le lien ne fonctionnera plus pour personne.")).toBeVisible();
    fireEvent.click(button("Annuler"));
    await waitFor(() => expect(button("Désactiver le lien")).toHaveFocus());
    expect(screen.getByText("Un lien est actif depuis le 1er août 2026.")).toBeVisible();
    expect(injected.revokeShareLink).not.toHaveBeenCalled();
  });

  it("« Désactiver » : annonce « Lien désactivé. », état « aucun lien actif », focus sur « Créer un lien »", async () => {
    const injected = actions();
    const { dialog } = renderSheet(injected);
    await loaded();
    fireEvent.click(button("Désactiver le lien"));
    expect(await axeViolations(dialog)).toEqual([]);
    fireEvent.click(button("Désactiver"));
    await waitFor(() => expect(button("Créer un lien")).toHaveFocus());
    expect(screen.getByText("Lien désactivé.")).toHaveAttribute("role", "status");
    expect(injected.revokeShareLink).toHaveBeenCalledWith({ tripId: TRIP });
    expect(screen.queryByText(/Un lien est actif/)).toBeNull();
  });

  it("« Créer un nouveau lien » : confirmation, « Annuler » rend le focus ; la confirmation crée le nouveau lien", async () => {
    const injected = actions();
    const { dialog } = renderSheet(injected);
    await loaded();
    fireEvent.click(button("Créer un nouveau lien"));
    expect(screen.getByText("L'ancien lien ne fonctionnera plus pour personne.")).toBeVisible();
    expect(await axeViolations(dialog)).toEqual([]);
    fireEvent.click(button("Annuler"));
    await waitFor(() => expect(button("Créer un nouveau lien")).toHaveFocus());
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    expect(injected.createShareLink).not.toHaveBeenCalled();
    fireEvent.click(button("Créer un nouveau lien"));
    fireEvent.click(within(screen.getByText("L'ancien lien ne fonctionnera plus pour personne.").parentElement!).getByRole("button", { name: "Créer un nouveau lien" }));
    expect(await within(dialog).findByRole("textbox", { name: "Lien de partage" })).toHaveValue(`${window.location.origin}/p/${TOKEN}`);
    expect(injected.createShareLink).toHaveBeenCalledTimes(1);
  });
});

describe("envoi en cours (C41)", () => {
  it("bouton en aria-disabled, feuille en aria-busy, un second clic n'envoie rien", async () => {
    const pending = deferred<Result<CreatedShareLink>>();
    const createShareLink = vi.fn(() => pending.promise);
    const { dialog } = renderSheet(actions({ getShareStatus: vi.fn(async () => NONE), createShareLink }));
    await loaded();
    fireEvent.click(button("Créer un lien"));
    expect(button("Créer un lien")).toHaveAttribute("aria-disabled", "true");
    expect(dialog).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button("Créer un lien"));
    expect(createShareLink).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(CREATED));
    expect(dialog).not.toHaveAttribute("aria-busy");
  });
});

describe("erreur d'une action (C37, C41)", () => {
  it.each([
    ["résultat { ok: false }", () => Promise.resolve(FAILED)],
    ["action qui échoue", () => Promise.reject(new Error("réseau"))],
  ])("créer, %s : bandeau, état inchangé ; « Réessayer » relance une fois la même action", async (_label, failure) => {
    const createShareLink = vi.fn<ShareActions["createShareLink"]>().mockImplementationOnce(failure as never).mockResolvedValueOnce(CREATED);
    renderSheet(actions({ getShareStatus: vi.fn(async () => NONE), createShareLink }));
    await loaded();
    fireEvent.click(button("Créer un lien"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Impossible de modifier le partage pour le moment.");
    expect(button("Créer un lien")).toBeVisible();
    fireEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    await screen.findByRole("textbox", { name: "Lien de partage" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(createShareLink).toHaveBeenCalledTimes(2);
    expect(createShareLink).toHaveBeenLastCalledWith({ tripId: TRIP });
  });

  it("second échec de « Réessayer » : bandeau inchangé, « Réessayer » toujours disponible, un appel par clic", async () => {
    const createShareLink = vi.fn(async () => FAILED);
    renderSheet(actions({ getShareStatus: vi.fn(async () => NONE), createShareLink }));
    await loaded();
    fireEvent.click(button("Créer un lien"));
    const alert = await screen.findByRole("alert");
    for (const expected of [2, 3]) {
      fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Réessayer" }));
      await waitFor(() => expect(createShareLink).toHaveBeenCalledTimes(expected));
      await waitFor(() => expect(within(screen.getByRole("alert")).getByRole("button", { name: "Réessayer" })).not.toHaveAttribute("aria-disabled"));
    }
    expect(screen.getByRole("alert")).toBe(alert);
    expect(screen.getByRole("alert")).toHaveTextContent("Impossible de modifier le partage pour le moment.");
  });

  it("désactiver, échec : le lien reste actif ; « Réessayer » relance la désactivation", async () => {
    const revokeShareLink = vi.fn<ShareActions["revokeShareLink"]>().mockResolvedValueOnce(FAILED).mockResolvedValueOnce(NONE);
    renderSheet(actions({ revokeShareLink }));
    await loaded();
    fireEvent.click(button("Désactiver le lien"));
    fireEvent.click(button("Désactiver"));
    const alert = await screen.findByRole("alert");
    expect(screen.getByText("Un lien est actif depuis le 1er août 2026.")).toBeVisible();
    fireEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(screen.getByText("Lien désactivé.")).toBeVisible());
    expect(revokeShareLink).toHaveBeenCalledTimes(2);
  });
});

describe("hors ligne (C34)", () => {
  it("bandeau ; création, remplacement et désactivation en aria-disabled ; réactivés au retour du réseau", async () => {
    const onLine = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const injected = actions();
    const { dialog } = renderSheet(injected);
    await loaded();
    expect(screen.getByText("Tu es hors ligne. Partager demande une connexion.")).toBeVisible();
    for (const name of ["Créer un nouveau lien", "Désactiver le lien"]) {
      expect(button(name)).toHaveAttribute("aria-disabled", "true");
      expect(button(name)).toHaveAccessibleDescription("Tu es hors ligne. Partager demande une connexion.");
    }
    fireEvent.click(button("Désactiver le lien"));
    expect(screen.queryByText("Le lien ne fonctionnera plus pour personne.")).toBeNull();
    expect(await axeViolations(dialog)).toEqual([]);
    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(button("Désactiver le lien")).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByText("Tu es hors ligne. Partager demande une connexion.")).toBeNull();
  });

  it("« Créer un lien » aussi ; « Copier le lien » reste actif", async () => {
    const onLine = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    renderSheet(actions({ getShareStatus: vi.fn(async () => NONE) }));
    await loaded();
    onLine.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(button("Créer un lien")).toHaveAttribute("aria-disabled", "true");
    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    fireEvent.click(button("Créer un lien"));
    await screen.findByRole("textbox", { name: "Lien de partage" });
    onLine.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(button("Copier le lien")).not.toHaveAttribute("aria-disabled");
    onLine.mockRestore();
  });
});

describe("fermeture (C27)", () => {
  it("« Fermer » ferme la feuille et rend le focus au bouton d'origine", async () => {
    const { onOpenChange } = renderSheet(actions());
    await loaded();
    fireEvent.click(button("Fermer"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
