import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Day, Stop } from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { findFicheTarget, ficheMoment } from "./fiche";
import { tripRoutes } from "./routes";
import { StopSheet } from "./StopSheet";

const routes = tripRoutes("/voyages", edimbourg.id);
const day = (n: number): Day => edimbourg.days.find((candidate) => candidate.index === n)!;

function renderFiche(n: number, stopId: string, overrides: Partial<Stop> = {}) {
  const target = findFicheTarget(day(n), stopId)!;
  const onClose = vi.fn();
  const onToggleLock = vi.fn();
  const result = render(
    <StopSheet
      stop={{ ...target.stop, ...overrides }}
      inProgramme={target.inProgramme}
      day={day(n)}
      routes={routes}
      onClose={onClose}
      onToggleLock={onToggleLock}
    />,
  );
  return { ...result, onClose, onToggleLock };
}

describe("fiche: fonctions pures", () => {
  it("findFicheTarget : étape du programme, événement hors programme, absente", () => {
    expect(findFicheTarget(day(2), "j2-dean-village")).toMatchObject({ inProgramme: true, stop: { name: "[Dean Village]" } });
    expect(findFicheTarget(day(2), "j2-concert-orgue")).toMatchObject({ inProgramme: false });
    expect(findFicheTarget(day(2), "j5-distillerie")).toBeNull();
    expect(findFicheTarget(day(2), "inconnue")).toBeNull();
    expect(findFicheTarget(day(2), null)).toBeNull();
    expect(findFicheTarget(day(2), "")).toBeNull();
  });

  it("ficheMoment : « J2 · Dimanche 30 août · 10:50 – 11:50 », début seul sans fin", () => {
    expect(ficheMoment(day(2), { start: "10:50", end: "11:50" })).toBe("J2 · Dimanche 30 août · 10:50 – 11:50");
    expect(ficheMoment(day(2), { start: "10:50" })).toBe("J2 · Dimanche 30 août · 10:50");
  });
});

describe("StopSheet (écran 13, F5-PO-9 à F5-PO-11)", () => {
  it("Dean Village : titre de niveau 1, moment, meta, « Pour y aller », raison en texte simple sans ReasonBlock, actions", () => {
    const { container } = renderFiche(2, "j2-dean-village");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const title = screen.getByRole("heading", { level: 1 });
    expect(title).toHaveTextContent("[Dean Village]");
    expect(title).toHaveAttribute("tabindex", "-1");
    expect(title).toHaveFocus();
    expect(container.querySelector("[data-part='moment']")).toHaveTextContent("J2 · Dimanche 30 août · 10:50 – 11:50");
    expect(container.querySelector("[data-part='meta']")).toHaveTextContent("[Water of Leith, 1 h, gratuit]");
    const path = screen.getByRole("region", { name: "Pour y aller" });
    expect(path).toHaveTextContent("À pied, 20 min depuis [Royal Mile]");
    expect(container.querySelector("[data-part='raison']")).toBeNull();
    expect(container.querySelector("[data-part='raison-simple']")).toHaveTextContent(
      "[Tu as choisi les balades : un village au bord de l'eau en pleine ville]",
    );
    expect(screen.getByRole("link", { name: "Remplacer" })).toHaveAttribute(
      "href",
      "/voyages/mock_trip_edimbourg/jour/2/remplacer/j2-dean-village",
    );
    expect(screen.getByRole("button", { name: "Verrouiller" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: /Supprimer|Garder/ })).toBeNull();
    expect(container.querySelector("[data-part='verrou']")).toBeNull();
    expect(container.querySelector("[data-part='hors-programme']")).toBeNull();
  });

  it("étape avec source : ReasonBlock « Pourquoi pour toi », lien de la source, « Source consultée le … »", () => {
    renderFiche(5, "j5-distillerie");
    expect(screen.getByText("Pourquoi pour toi")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Source\u00a0: [Site de la distillerie]" })).toHaveAttribute(
      "href",
      "https://example.org/mock/distillerie",
    );
    expect(screen.getByText("Source consultée le 15 août 2026")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Pour y aller" })).toHaveTextContent(
      "Bus, environ 50 min (estimation) depuis [Petite adresse de Chambers Street]",
    );
    expect(screen.getByText("À réserver")).toBeInTheDocument();
    expect(screen.getByText("À confirmer")).toBeInTheDocument();
  });

  it("étape sans raison ni source : ni bloc ni texte", () => {
    const { container } = renderFiche(2, "j2-dean-village", { reason: undefined });
    expect(container.querySelector("[data-part='raison']")).toBeNull();
    expect(container.querySelector("[data-part='raison-simple']")).toBeNull();
  });

  it("étape verrouillée (Tattoo) : mention de verrou, « Verrouiller » pressé, pas de « Remplacer »", () => {
    const { container, onToggleLock } = renderFiche(1, "j1-tattoo");
    expect(container.querySelector("[data-part='verrou']")).toHaveTextContent(
      "Étape verrouillée : elle ne bougera pas quand tu modifies ton programme.",
    );
    expect(screen.queryByRole("link", { name: "Remplacer" })).toBeNull();
    const lock = screen.getByRole("button", { name: "Verrouiller" });
    expect(lock).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(lock);
    expect(onToggleLock).toHaveBeenCalledWith(false);
  });

  it("événement de Day.events : lecture seule, signalé hors programme, ni « Remplacer » ni « Verrouiller », sans « Pour y aller »", () => {
    const { container } = renderFiche(2, "j2-concert-orgue");
    expect(container.querySelector("[data-part='hors-programme']")).toHaveTextContent(
      "Proposé pendant ton séjour, pas dans ton programme.",
    );
    expect(container.querySelector("[data-part='moment']")).toHaveTextContent("J2 · Dimanche 30 août · 18:00 – 19:00");
    expect(screen.getByText("Non confirmé")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Remplacer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Verrouiller" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Pour y aller" })).toBeNull();
  });

  it("« Fermer » et Échap ferment la fiche", () => {
    const { onClose } = renderFiche(2, "j2-dean-village");
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    fireEvent.keyDown(within(screen.getByRole("region", { name: "Actions" })).getByRole("button", { name: "Verrouiller" }), {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("n'a aucune violation axe (étape, étape verrouillée, événement)", async () => {
    for (const [n, id] of [
      [2, "j2-dean-village"],
      [1, "j1-tattoo"],
      [2, "j2-concert-orgue"],
    ] as const) {
      const { container, unmount } = renderFiche(n, id);
      expect(await axeViolations(container)).toEqual([]);
      unmount();
    }
  });
});
