import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail, ok } from "@/contracts";
import * as messages from "@/i18n/messages";
import { requestCode, verifyCode } from "@/server/actions/compte";

import { axeViolations } from "../../../tests/unit/axe";

import { ReauthStep } from "./ReauthStep";

vi.mock("@/server/actions/compte", () => ({ requestCode: vi.fn(), verifyCode: vi.fn() }));

/**
 * « Confirme que c'est toi » (M9c, ticket 1122 ; spécification M9 § 1.3 et § 6.4, critère 3) : adresse de la session non
 * modifiable, envoi puis saisie du code, messages d'erreur de `/connexion`.
 */

const t = messages.compte.reauthentification;
const c = messages.connexion;
const EMAIL = "samuel@exemple.test";

const onDone = vi.fn();

function renderStep() {
  return render(<ReauthStep email={EMAIL} titleRef={createRef<HTMLHeadingElement>()} onDone={onDone} />);
}

const cells = () => screen.getAllByRole("textbox", { name: /^Chiffre \d sur 6$/ }) as HTMLInputElement[];

async function recevoir() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: t.recevoir }));
  });
}

async function saisir(code: string) {
  await act(async () => {
    fireEvent.paste(cells()[0]!, { clipboardData: { getData: () => code } });
  });
}

beforeEach(() => {
  onDone.mockClear();
  vi.mocked(requestCode).mockReset().mockResolvedValue(ok({ sent: true }));
  vi.mocked(verifyCode).mockReset().mockResolvedValue(ok({ signedIn: true }));
});

describe("ReauthStep", () => {
  it("demande : titre, adresse de la session sans champ de saisie, « Recevoir un code »", async () => {
    const { container } = renderStep();
    expect(screen.getByRole("heading", { level: 1, name: t.titre })).toBeInTheDocument();
    expect(screen.getByText(`Pour protéger tes données, on t'envoie un code à ${EMAIL}.`)).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: c.code.changerAdresse })).toBeNull();
    expect(requestCode).not.toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("« Recevoir un code » envoie le code à l'adresse de la session, puis affiche la saisie ; code juste : onDone", async () => {
    const { container } = renderStep();
    await recevoir();
    expect(requestCode).toHaveBeenCalledExactlyOnceWith({ email: EMAIL });
    expect(screen.getByText(t.saisie)).toBeVisible();
    expect(cells()).toHaveLength(6);
    expect(cells()[0]).toHaveFocus();
    expect(await axeViolations(container)).toEqual([]);
    await saisir("246810");
    expect(verifyCode).toHaveBeenCalledExactlyOnceWith({ email: EMAIL, code: "246810" });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["rate_limited", c.erreurs.rate_limited],
    ["email_cap_reached", t.erreur],
    ["provider_error", t.erreur],
  ] as const)("envoi refusé (%s) : limite de /connexion ou texte de l'étape, la saisie n'est pas affichée", async (code, message) => {
    vi.mocked(requestCode).mockResolvedValueOnce(fail(code));
    renderStep();
    await recevoir();
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_code", c.erreurs.invalid_code],
    ["code_expired", c.erreurs.code_expired],
  ] as const)("code refusé (%s) : message de /connexion, cases vidées, focus sur la première", async (code, message) => {
    vi.mocked(verifyCode).mockResolvedValueOnce(fail(code));
    renderStep();
    await recevoir();
    await saisir("135791");
    expect(screen.getByText(message)).toBeVisible();
    expect(cells().map((cell) => cell.value).join("")).toBe("");
    expect(cells()[0]).toHaveFocus();
    expect(cells()[0]).toHaveAttribute("aria-invalid", "true");
    expect(onDone).not.toHaveBeenCalled();
    await saisir("246810");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("trop d'essais : cases désactivées, focus sur « Renvoyer le code » ; un nouveau code les rouvre", async () => {
    vi.mocked(verifyCode).mockResolvedValueOnce(fail("too_many_attempts"));
    renderStep();
    await recevoir();
    await saisir("135791");
    expect(screen.getByText(c.erreurs.too_many_attempts)).toBeVisible();
    for (const cell of cells()) expect(cell).toBeDisabled();
    const renvoyer = screen.getByRole("button", { name: c.code.renvoyer });
    await waitFor(() => expect(renvoyer).toHaveFocus());
    await act(async () => {
      fireEvent.click(renvoyer);
    });
    expect(requestCode).toHaveBeenCalledTimes(2);
    expect(screen.getByText(c.code.nouveauCode)).toBeVisible();
    for (const cell of cells()) expect(cell).not.toBeDisabled();
    expect(screen.queryByText(c.erreurs.too_many_attempts)).toBeNull();
  });

  it("code envoyé : « Code envoyé. » écrit dans la région role=status rendue vide avec la saisie", async () => {
    renderStep();
    await recevoir();
    const region = screen.getAllByRole("status").find((element) => element.closest("[data-part='reauthentification']"));
    expect(region).toBeDefined();
    await waitFor(() => expect(region).toHaveTextContent(t.envoye));
  });

  it("erreur de réseau à la vérification : texte de l'étape, pas celui de la connexion", async () => {
    vi.mocked(verifyCode).mockRejectedValueOnce(new Error("réseau"));
    renderStep();
    await recevoir();
    await saisir("246810");
    expect(screen.getByText(t.erreur)).toBeVisible();
    expect(screen.queryByText(c.erreurs.generique)).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });
});
