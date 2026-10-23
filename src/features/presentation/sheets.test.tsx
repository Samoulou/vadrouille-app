import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CategorySchema } from "@/contracts";
import * as messages from "@/i18n/messages";
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

  // Lot 2a (spécification § 11.4, A21 ; PPI-PO-8) : ligne `t.detail.source` et lien du site, aucune date de vérification.
  it("ProposalDetailSheet: lien du site sans date", () => {
    const { verifiedAt: _date, ...stop } = distillerie.stop;
    void _date;
    const proposal = { ...distillerie, stop: { ...stop, source: { label: "colosseo.it", url: "https://colosseo.it/" } } };
    render(<ProposalDetailSheet proposal={proposal} weekday="mer." onClose={() => {}} onReturnFocus={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: distillerie.stop.name });
    const lien = within(dialog).getByRole("link", { name: "colosseo.it" });
    expect(lien).toHaveAttribute("href", "https://colosseo.it/");
    expect(lien).toHaveAttribute("target", "_blank");
    expect(lien).toHaveAttribute("rel", "noopener noreferrer");
    expect(lien.parentElement?.textContent).toBe(`${messages.presentation.detail.source}colosseo.it`);
    expect(dialog).not.toHaveTextContent(/vérifiées le|consultée le/);
  });

  // Décision 0128 : photo du lieu en grand, attribution complète (profil de l'auteur, photo sur Google Maps).
  it("ProposalDetailSheet: photo avec auteurs liés à leur profil et « voir sur Google Maps »", async () => {
    const photo = {
      url: "https://lh3.googleusercontent.com/place-photos/test",
      authors: [{ name: "Ana", profileUrl: "https://maps.google.com/maps/contrib/1" }, { name: "Luís" }],
      mapsUrl: "https://www.google.com/maps/photo",
    };
    const { baseElement } = render(<ProposalDetailSheet proposal={distillerie} weekday="mer." onClose={() => {}} onReturnFocus={() => {}} photo={photo} />);
    const dialog = screen.getByRole("dialog", { name: distillerie.stop.name });
    // Décorative (F13, mineur 13) : le titre de la feuille nomme déjà le lieu.
    const image = dialog.querySelector("figure img")!;
    expect(image).toHaveAttribute("src", photo.url);
    expect(image).toHaveAttribute("alt", "");
    // Liens externes annoncés « s'ouvre dans un nouvel onglet » (mineur 10).
    const auteur = within(dialog).getByRole("link", { name: /^Ana\s*\(s'ouvre dans un nouvel onglet\)$/ });
    expect(auteur).toHaveAttribute("href", "https://maps.google.com/maps/contrib/1");
    expect(auteur).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(dialog).getByRole("link", { name: /^voir sur Google Maps\s*\(s'ouvre dans un nouvel onglet\)$/ })).toHaveAttribute("href", photo.mapsUrl);
    expect(within(dialog).queryByRole("link", { name: "Luís" })).toBeNull();
    const nouvelOnglet = messages.presentation.detail.nouvelOnglet;
    expect(dialog.querySelector("figcaption")?.textContent).toBe(`${messages.presentation.detail.photoPar}Ana${nouvelOnglet}, Luís · voir sur Google Maps${nouvelOnglet}`);
    expect(await axeViolations(baseElement)).toEqual([]);
  });

  it("ProposalDetailSheet: photo sans lien Google Maps ni auteur : « Photo : Google Maps » ; image en échec : la boîte reste, vide", () => {
    const photo = { url: "https://lh3.googleusercontent.com/place-photos/test", authors: [] };
    render(<ProposalDetailSheet proposal={distillerie} weekday="mer." onClose={() => {}} onReturnFocus={() => {}} photo={photo} />);
    const dialog = screen.getByRole("dialog", { name: distillerie.stop.name });
    expect(dialog.querySelector("figcaption")?.textContent).toBe(`${messages.presentation.detail.photoPar}Google Maps`);
    fireEvent.error(dialog.querySelector("img")!);
    expect(dialog.querySelector("figure")).toBeNull();
    expect(dialog.querySelector("img")).toBeNull();
    // Même boîte 4:3 qu'avec la photo : aucun saut de mise en page (mineur 7).
    expect(dialog.querySelector("[data-part=boite-photo]")?.className).toContain("aspect-[4/3]");
  });

  it("ProposalDetailSheet: photo en attente : boîte réservée dès l'ouverture, sans image ni crédit (mineur 7)", () => {
    render(<ProposalDetailSheet proposal={distillerie} weekday="mer." onClose={() => {}} onReturnFocus={() => {}} photoEnAttente />);
    const dialog = screen.getByRole("dialog", { name: distillerie.stop.name });
    const boite = dialog.querySelector("[data-part=boite-photo]")!;
    expect(boite).toHaveAttribute("aria-hidden", "true");
    expect(boite.className).toContain("aspect-[4/3]");
    expect(dialog.querySelector("img")).toBeNull();
    expect(dialog.querySelector("figcaption")).toBeNull();
  });

  it("ProposalDetailSheet: sans site, aucune ligne de source", () => {
    const { source: _source, verifiedAt: _date, ...stop } = distillerie.stop;
    void _source;
    void _date;
    render(<ProposalDetailSheet proposal={{ ...distillerie, stop }} weekday="mer." onClose={() => {}} onReturnFocus={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: distillerie.stop.name });
    expect(within(dialog).queryByRole("link")).toBeNull();
    expect(dialog).not.toHaveTextContent(messages.presentation.detail.source.trim());
  });

  it("lecture seule : nom, moment, métadonnées, justification, source, date de vérification, « Fermer »", () => {
    const onClose = vi.fn();
    render(<ProposalDetailSheet proposal={distillerie} weekday="mer." onClose={onClose} onReturnFocus={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: distillerie.stop.name });
    expect(document.activeElement).toBe(within(dialog).getByRole("heading"));
    expect(dialog).toHaveTextContent("Jour 5, mer., vers 13:30");
    expect(dialog).toHaveTextContent("[East Lothian], 1 h 30");
    expect(dialog).toHaveTextContent(distillerie.stop.reason!);
    // Lien de source ouvert hors de l'application, sans accès à la page d'origine (spécification P0, P0b1).
    const source = within(dialog).getByRole("link", { name: "[Site de la distillerie]" });
    expect(source).toHaveAttribute("href", distillerie.stop.source!.url);
    expect(source).toHaveAttribute("target", "_blank");
    expect(source).toHaveAttribute("rel", "noopener noreferrer");
    // Adaptateur `mock` (par défaut) : données simulées, aucune mention Google.
    expect(within(dialog).queryByText("Données de lieux : Google")).toBeNull();
    expect(dialog).toHaveTextContent("Informations vérifiées le 15 août 2026");
    expect(within(dialog).getAllByRole("button").map((b) => b.textContent)).toEqual(["Fermer"]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalled();
    expect(formatVerifiedAt("2026-08-20")).toBe("20 août 2026");
    expect(formatVerifiedAt("2026-01-05")).toBe("5 janvier 2026");
  });

  it("infos pratiques (décision 0116 § 6) : après le pourquoi et la source, titre de niveau 3 ; absentes sans valeur", async () => {
    const avecInfos = {
      ...distillerie,
      stop: { ...distillerie.stop, facts: { ...distillerie.stop.facts, tip: "[Réserve la visite]", hoursNote: "[Fermé le lundi]" } },
    };
    const { rerender } = render(<ProposalDetailSheet proposal={avecInfos} weekday="mer." onClose={() => {}} onReturnFocus={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: distillerie.stop.name });
    const notes = within(dialog).getByRole("region", { name: "Infos pratiques" });
    expect(within(notes).getByRole("heading", { level: 3 })).toBeInTheDocument();
    expect(notes).toHaveTextContent("Conseil[Réserve la visite]");
    expect(notes).toHaveTextContent("Horaires[Fermé le lundi]");
    expect(notes).not.toHaveTextContent("Prix");
    const texte = dialog.textContent ?? "";
    expect(texte.indexOf(distillerie.stop.reason!)).toBeLessThan(texte.indexOf("Infos pratiques"));
    expect(texte.indexOf("Informations vérifiées le")).toBeLessThan(texte.indexOf("Infos pratiques"));
    expect(await axeViolations(document.body)).toEqual([]);
    rerender(<ProposalDetailSheet proposal={distillerie} weekday="mer." onClose={() => {}} onReturnFocus={() => {}} />);
    expect(within(screen.getByRole("dialog")).queryByRole("region", { name: "Infos pratiques" })).toBeNull();
  });

  it("adaptateur prototype : mention « Données de lieux : Google » dans la feuille (écran 6)", () => {
    render(<ProposalDetailSheet proposal={distillerie} weekday="mer." onClose={() => {}} onReturnFocus={() => {}} placesFromGoogle />);
    const dialog = screen.getByRole("dialog", { name: distillerie.stop.name });
    expect(within(dialog).getByText("Données de lieux : Google")).toHaveAttribute("data-part", "attribution");
  });

  it("fermé sans proposition ; aucune violation axe", async () => {
    const { rerender } = render(<ProposalDetailSheet proposal={null} weekday="mer." onClose={() => {}} onReturnFocus={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<ProposalDetailSheet proposal={distillerie} weekday="mer." onClose={() => {}} onReturnFocus={() => {}} />);
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

  it("jours gardés sans tri (« Tout garder pour le jour N ») : « Tu as fini ce tri. » en suite du tri, titres de l'aperçu et du paquet vide inchangés", () => {
    const { rerender } = render(<DeckEnd variant="suite" tripId="t1" notAllSorted />);
    expect(screen.getByRole("heading", { name: "Tu as fini ce tri." })).toBeInTheDocument();
    expect(screen.queryByText("Tu as tout trié")).toBeNull();
    rerender(<DeckEnd variant="apercu" tripId="t1" notAllSorted />);
    expect(screen.getByRole("heading", { name: "Tu as vu tes premières propositions" })).toBeInTheDocument();
    rerender(<DeckEnd variant="vide" tripId="t1" notAllSorted />);
    expect(screen.getByRole("heading", { name: "Aucune proposition à trier" })).toBeInTheDocument();
  });
});
