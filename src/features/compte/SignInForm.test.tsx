import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail, ok } from "@/contracts";
import { DraftProvider } from "@/features/creation/DraftProvider";
import { initialDraft, type DraftState } from "@/features/creation/draft";
import { messages } from "@/i18n";
import { requestCode, verifyCode } from "@/server/actions/compte";

import { axeViolations } from "../../../tests/unit/axe";

import { SignInForm, type SignInFormProps } from "./SignInForm";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/compte", () => ({ requestCode: vi.fn(), verifyCode: vi.fn() }));

/** Écran 4 « Compte » (`R4`, F8-PO-9 à F8-PO-11 ; 0017 § 3.5 ; 0018 § 18). */

const t = messages.connexion;
const LANCER = "/voyages/nouveau/lancer";
const EMAIL = "camille@exemple.ch";

function renderForm(props: Partial<SignInFormProps> = {}, initial: DraftState = initialDraft()) {
  return render(
    <DraftProvider initial={initial}>
      <SignInForm suite={LANCER} codeTtlMs={600_000} authMode="simulated" {...props} />
    </DraftProvider>,
  );
}

const emailField = () => screen.getByRole("textbox", { name: t.email.libelle });
const cells = () => screen.getAllByRole("textbox", { name: /^Chiffre \d sur 6$/ }) as HTMLInputElement[];

async function sendCode(email = EMAIL) {
  fireEvent.change(emailField(), { target: { value: email } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: t.email.recevoir }));
  });
}

async function typeCode(code: string) {
  await act(async () => {
    fireEvent.paste(cells()[0]!, { clipboardData: { getData: () => code } });
  });
}

beforeEach(() => {
  router.push.mockClear();
  router.replace.mockClear();
  vi.mocked(requestCode).mockReset();
  vi.mocked(verifyCode).mockReset();
  vi.mocked(requestCode).mockResolvedValue(ok({ sent: true }));
  vi.mocked(verifyCode).mockResolvedValue(ok({ signedIn: true }));
});

describe("SignInForm : avertissement du mode simulé (0017 § 3.5)", () => {
  it("authMode simulé : avertissement visible aux étapes email et code", async () => {
    renderForm({ authMode: "simulated" });
    expect(screen.getByText(t.simulee)).toBeVisible();
    await sendCode();
    expect(screen.getByText(t.simulee)).toBeVisible();
  });

  it("authMode réel : aucun avertissement, à aucune étape", async () => {
    const { container } = renderForm({ authMode: "real" });
    expect(screen.queryByText(t.simulee)).toBeNull();
    await sendCode();
    expect(screen.queryByText(t.simulee)).toBeNull();
    expect(container.querySelector('[data-part="connexion-simulee"]')).toBeNull();
  });
});

describe("SignInForm : étape email", () => {
  it("un seul titre de niveau 1 ; titre de la création ; régions live présentes et vides ; accessible", async () => {
    const { container } = renderForm();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: t.titreCreation })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(emailField()).toHaveAttribute("type", "email");
    expect(emailField()).toHaveAttribute("autocomplete", "email");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("hors création : titre « Connexion » générique", () => {
    renderForm({ suite: "/voyages" });
    expect(screen.getByRole("heading", { level: 1, name: t.titre })).toBeInTheDocument();
  });

  it.each(["", "camille", "camille@", "camille@exemple"])("email invalide %j : refusé sans appel, focus et message", async (value) => {
    renderForm();
    await sendCode(value);
    expect(requestCode).not.toHaveBeenCalled();
    expect(emailField()).toHaveAttribute("aria-invalid", "true");
    expect(emailField()).toHaveFocus();
    expect(emailField()).toHaveAccessibleDescription(t.email.erreur);
  });

  it("« Trop de demandes. » dans la région alert, l'étape reste email", async () => {
    vi.mocked(requestCode).mockResolvedValue(fail("rate_limited"));
    renderForm();
    await sendCode();
    expect(screen.getByRole("alert")).toHaveTextContent(t.erreurs.rate_limited);
    expect(emailField()).toBeInTheDocument();
  });

  it("une erreur réseau : texte générique", async () => {
    vi.mocked(requestCode).mockRejectedValue(new Error("réseau"));
    renderForm();
    await sendCode();
    expect(screen.getByRole("alert")).toHaveTextContent(t.erreurs.generique);
  });
});

describe("SignInForm : étape code", () => {
  it("« Code envoyé à {email} », durée lue de la configuration ; libellé visible qui nomme le groupe ; focus sur « Chiffre 1 sur 6 »", async () => {
    const { container } = renderForm({ codeTtlMs: 900_000 });
    await sendCode();
    expect(requestCode).toHaveBeenCalledWith({ email: EMAIL });
    expect(screen.getByText(EMAIL).parentElement).toHaveTextContent(`Code envoyé à ${EMAIL}. Il est valable 15 minutes.`);
    const group = screen.getByRole("group", { name: t.code.libelle });
    expect(group).not.toHaveAttribute("aria-label");
    expect(group).toHaveAttribute("aria-labelledby");
    expect(screen.getByText(t.code.libelle)).toBeVisible();
    expect(cells()[0]).toHaveFocus();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(screen.queryByRole("button", { name: /Valider/ })).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("code complet : vérification sans bouton, puis remplacement de l'adresse par la suite", async () => {
    renderForm();
    await sendCode();
    await typeCode("246810");
    expect(verifyCode).toHaveBeenCalledWith({ email: EMAIL, code: "246810" });
    expect(router.replace).toHaveBeenCalledWith(LANCER);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("pendant la vérification : « Vérification du code… » dans la région status", async () => {
    let resolve: (value: Awaited<ReturnType<typeof verifyCode>>) => void = () => {};
    vi.mocked(verifyCode).mockReturnValue(new Promise((r) => (resolve = r)));
    renderForm();
    await sendCode();
    await typeCode("246810");
    expect(screen.getByRole("status")).toHaveTextContent(t.code.verification);
    for (const cell of cells()) expect(cell).toBeDisabled();
    await act(async () => resolve(ok({ signedIn: true })));
  });

  it("code faux : alerte reliée au groupe, aria-invalid, cases vidées, focus sur la première ; texte rendu une fois", async () => {
    vi.mocked(verifyCode).mockResolvedValue(fail("invalid_code"));
    renderForm();
    await sendCode();
    await typeCode("135791");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(t.erreurs.invalid_code);
    expect(screen.getByRole("group", { name: t.code.libelle })).toHaveAttribute("aria-describedby", alert.id);
    for (const cell of cells()) {
      expect(cell).toHaveAttribute("aria-invalid", "true");
      expect(cell).toHaveValue("");
    }
    await waitFor(() => expect(cells()[0]).toHaveFocus());
    expect(screen.getAllByText(t.erreurs.invalid_code)).toHaveLength(1);
  });

  it("code expiré : « Ce code a expiré. »", async () => {
    vi.mocked(verifyCode).mockResolvedValue(fail("code_expired"));
    renderForm();
    await sendCode();
    await typeCode("246810");
    expect(screen.getByRole("alert")).toHaveTextContent(t.erreurs.code_expired);
  });

  it("trop d'essais : cases désactivées, focus sur « Renvoyer le code » ; le renvoi les rouvre et annonce le nouveau code", async () => {
    vi.mocked(verifyCode).mockResolvedValue(fail("too_many_attempts"));
    renderForm();
    await sendCode();
    await typeCode("135791");
    expect(screen.getByRole("alert")).toHaveTextContent(t.erreurs.too_many_attempts);
    for (const cell of cells()) expect(cell).toBeDisabled();
    const resend = screen.getByRole("button", { name: t.code.renvoyer });
    await waitFor(() => expect(resend).toHaveFocus());
    await act(async () => {
      fireEvent.click(resend);
    });
    expect(requestCode).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent(t.code.nouveauCode);
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    for (const cell of cells()) expect(cell).toBeEnabled();
  });

  it("renvoi refusé : « Trop de demandes. », cases toujours désactivées", async () => {
    vi.mocked(verifyCode).mockResolvedValue(fail("too_many_attempts"));
    renderForm();
    await sendCode();
    await typeCode("135791");
    vi.mocked(requestCode).mockResolvedValue(fail("rate_limited"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.code.renvoyer }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent(t.erreurs.rate_limited);
    for (const cell of cells()) expect(cell).toBeDisabled();
  });

  it("« Changer d'adresse » : retour à l'étape email, adresse conservée, focus sur le champ", async () => {
    renderForm();
    await sendCode();
    fireEvent.click(screen.getByRole("button", { name: t.code.changerAdresse }));
    expect(emailField()).toHaveValue(EMAIL);
    expect(emailField()).toHaveFocus();
  });
});

describe("SignInForm : « Retour »", () => {
  it("depuis la création, voyage « Pas encore » : dernier écran 3 affiché", () => {
    renderForm({}, { ...initialDraft(), lodgingCity: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(router.push).toHaveBeenCalledWith("/voyages/nouveau/logement");
  });

  it("depuis la création, sans écran 3 : écran 2", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(router.push).toHaveBeenCalledWith("/voyages/nouveau/brief");
  });

  it("hors création : « Mes voyages »", () => {
    renderForm({ suite: "/voyages/mock_trip_edimbourg" });
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(router.push).toHaveBeenCalledWith("/voyages");
  });
});
