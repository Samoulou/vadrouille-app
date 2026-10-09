import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CategorySchema } from "@/contracts";
import { messages } from "@/i18n";
import { propositions } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { DeckEnd } from "./DeckEnd";
import { PreferenceSheet, promptTitle } from "./PreferenceSheet";
import { ProposalDetailSheet, formatVerifiedAt } from "./ProposalDetailSheet";

describe("PreferenceSheet", () => {
  function renderSheet() {
    const props = { onAnswer: vi.fn(), onDismiss: vi.fn(), onReturnFocus: vi.fn() };
    render(<PreferenceSheet prompt={{ kind: "category", category: "museum" }} {...props} />);
    return { ...props, dialog: screen.getByRole("dialog") };
  }

  it("titres des questions de catégorie et de distance", () => {
    expect(promptTitle({ kind: "category", category: "museum" })).toBe("On arrête les musées et monuments pour ce voyage ?");
    expect(promptTitle({ kind: "category", category: "walk" })).toBe("On arrête les balades en ville pour ce voyage ?");
    expect(promptTitle({ kind: "category", category: "nature" })).toBe("On arrête la nature et les points de vue pour ce voyage ?");
    expect(promptTitle({ kind: "category", category: "tasting" })).toBe("On arrête les dégustations pour ce voyage ?");
    expect(promptTitle({ kind: "category", category: "restaurant" })).toBe("On arrête les restaurants pour ce voyage ?");
    expect(promptTitle({ kind: "distance" })).toBe("On reste plus près de ton hôtel ?");
  });

  it("chaque code de catégorie a son libellé dans fr.json, jamais le code brut", () => {
    for (const category of CategorySchema.options) {
      const title = promptTitle({ kind: "category", category });
      expect(messages.presentation.categories[category]).toMatch(/^l/);
      expect(title).toContain(messages.presentation.categories[category]);
    }
  });

  it("feuille modale nommée par son titre, focus sur le titre, raisons dans l'ordre", () => {
    const { dialog } = renderSheet();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("On arrête les musées et monuments pour ce voyage ?");
    expect(document.activeElement).toBe(within(dialog).getByRole("heading"));
    const chips = within(dialog).getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));
    expect(chips.map((c) => c.textContent)).toEqual(["Pas mon style", "Trop chargé", "Trop cher", "Trop loin", "Autre raison"]);
  });

  it("une seule raison à la fois ; « Oui » et « Non » envoient la réponse", () => {
    const { dialog, onAnswer } = renderSheet();
    fireEvent.click(within(dialog).getByRole("button", { name: "Trop cher" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Trop loin" }));
    expect(within(dialog).getByRole("button", { name: "Trop cher" })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByRole("button", { name: "Trop loin" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(dialog).getByRole("button", { name: "Oui" }));
    expect(onAnswer).toHaveBeenLastCalledWith({ answer: "yes", reason: "tooFar" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Trop loin" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Non" }));
    expect(onAnswer).toHaveBeenLastCalledWith({ answer: "no" });
  });

  it("Échap ferme sans réponse", () => {
    const { dialog, onDismiss, onAnswer } = renderSheet();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("aucune violation axe", async () => {
    renderSheet();
    expect(await axeViolations(document.body)).toEqual([]);
  });
});

describe("ProposalDetailSheet", () => {
  const distillerie = propositions.find((p) => p.id === "prop-j5-distillerie")!;

  it("lecture seule : nom, moment, métadonnées, justification, source, date de vérification, « Fermer »", () => {
    const onClose = vi.fn();
    render(<ProposalDetailSheet proposal={distillerie} onClose={onClose} onReturnFocus={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: distillerie.stop.name });
    expect(document.activeElement).toBe(within(dialog).getByRole("heading"));
    expect(dialog).toHaveTextContent("Jour 5, mer., vers 13:30");
    expect(dialog).toHaveTextContent(distillerie.stop.meta);
    expect(dialog).toHaveTextContent(distillerie.stop.reason!);
    expect(within(dialog).getByRole("link", { name: "[Site de la distillerie]" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Informations vérifiées le 15 août 2026");
    expect(within(dialog).getAllByRole("button").map((b) => b.textContent)).toEqual(["Fermer"]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalled();
    expect(formatVerifiedAt("2026-08-20")).toBe("20 août 2026");
    expect(formatVerifiedAt("2026-01-05")).toBe("5 janvier 2026");
  });

  it("fermé sans proposition ; aucune violation axe", async () => {
    const { rerender } = render(<ProposalDetailSheet proposal={null} onClose={() => {}} onReturnFocus={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<ProposalDetailSheet proposal={distillerie} onClose={() => {}} onReturnFocus={() => {}} />);
    expect(await axeViolations(document.body)).toEqual([]);
  });
});

describe("DeckEnd", () => {
  it("aperçu : « Débloquer » et « Voir le programme », sans prix", async () => {
    const { container } = render(<DeckEnd variant="apercu" tripId="t1" />);
    expect(screen.getByRole("heading", { name: "Tu as vu tes premières propositions" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Débloquer" })).toHaveAttribute("href", "/voyages/t1/debloquer");
    expect(screen.getByRole("link", { name: "Voir le programme" })).toHaveAttribute("href", "/voyages/t1");
    expect(container.textContent).not.toMatch(/CHF|PRIX/);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("suite du tri et paquet vide : « Voir le programme » seulement", () => {
    const { rerender } = render(<DeckEnd variant="suite" tripId="t1" />);
    expect(screen.getByRole("heading", { name: "Tu as tout trié" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Débloquer" })).toBeNull();
    rerender(<DeckEnd variant="vide" tripId="t1" />);
    expect(screen.getByRole("heading", { name: "Aucune proposition à trier" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
