import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { messages } from "@/i18n";

import { axeViolations } from "../../../tests/unit/axe";

import { OfflineFallback } from "./OfflineFallback";

/** Page de repli hors ligne (spécification F10, F10b ; F10-PO-9, critères C5 et C24 en rendu unitaire). */

const t = messages.voyage.horsLigne;

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
  act(() => {
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  });
}

afterEach(() => {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => true });
  vi.restoreAllMocks();
});

describe("OfflineFallback", () => {
  it("textes, un seul titre de niveau 1, « Réessayer » et lien « Retour à l'accueil » vers /", () => {
    render(<OfflineFallback />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Tu es hors ligne" })).toBeInTheDocument();
    expect(screen.getByText(t.texte)).toBeInTheDocument();
    // Trait d'union de « Reconnecte-toi » collé à la suite par un gluon (U+2060) : jamais coupé en fin de ligne.
    expect(t.texte).toBe("Cette page demande une connexion. Reconnecte-\u2060toi, puis réessaie.");
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toHaveAttribute("href", "/");
    expect(t.titre).toBe("Tu es hors ligne");
  });

  it("« Réessayer » revient à la page précédente quand il y en a une", () => {
    const back = vi.fn();
    const assign = vi.fn();
    render(<OfflineFallback history={{ length: 3, back }} assign={assign} />);
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(back).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });

  it("« Réessayer » ouvre / dans un onglet sans page précédente", () => {
    const back = vi.fn();
    const assign = vi.fn();
    render(<OfflineFallback history={{ length: 1, back }} assign={assign} />);
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(assign).toHaveBeenCalledExactlyOnceWith("/");
    expect(back).not.toHaveBeenCalled();
  });

  it("annonce « Connexion rétablie. » au retour du réseau, rien avant", () => {
    setOnline(false);
    render(<OfflineFallback />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("");
    expect(screen.getByRole("heading", { level: 1, name: "Tu es hors ligne" })).toBeInTheDocument();
    setOnline(true);
    expect(status).toHaveTextContent("Connexion rétablie.");
    expect(screen.getByRole("heading", { level: 1, name: "Connexion rétablie" })).toBeInTheDocument();
    expect(screen.getByText("Tu peux réessayer.")).toBeInTheDocument();
    setOnline(false);
    expect(status).toHaveTextContent("");
    expect(screen.getByRole("heading", { level: 1, name: "Tu es hors ligne" })).toBeInTheDocument();
    expect(screen.getByText(t.texte)).toBeInTheDocument();
  });

  it("aucune annonce si le réseau est là depuis l'ouverture", () => {
    render(<OfflineFallback />);
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("ne lit ni l'adresse ni le stockage, et ne rend pas la mention « Données de lieux : Google » (C5)", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const { container } = render(<OfflineFallback />);
    expect(getItem).not.toHaveBeenCalled();
    expect(container).not.toHaveTextContent(messages.carte.attribution);
    expect(container.innerHTML).not.toMatch(/mock_|voyages\//);
  });

  it("axe sans violation", async () => {
    const { container } = render(<OfflineFallback />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
