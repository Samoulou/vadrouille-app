import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Day } from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { eventRange } from "./EventLines";
import { JourneePanel } from "./JourneePanel";
import { tripRoutes } from "./routes";

const routes = tripRoutes("/voyages", edimbourg.id);
const day = (n: number): Day => edimbourg.days.find((candidate) => candidate.index === n)!;

describe("JourneePanel (écran 12, F5-PO-5)", () => {
  it("J2 : titre de niveau 1, ligne trajet et budget, ligne du jour, événements, « Surprends-moi », dans cet ordre", () => {
    const { container } = render(<JourneePanel day={day(2)} routes={routes} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dimanche 30 août");
    expect(screen.getByText("1 h 25 de trajet · environ 95 CHF par personne")).toBeInTheDocument();
    const list = container.querySelector("#liste-etapes")!;
    expect(list).toHaveAttribute("tabindex", "-1");
    expect(within(list as HTMLElement).getByRole("link", { name: /\[Dean Village\]/ })).toHaveAttribute(
      "href",
      "/voyages/mock_trip_edimbourg/jour/2?etape=j2-dean-village",
    );
    const events = screen.getByRole("region", { name: "Événements du jour" });
    const concert = within(events).getByRole("link", { name: /Concert d'orgue/ });
    expect(concert).toHaveTextContent("18:00 – 19:00");
    expect(concert).toHaveTextContent("Non confirmé");
    const order = ["[data-part='trajet-budget']", "#liste-etapes", "[aria-labelledby='evenements-du-jour']", "[data-part='surprise']"].map(
      (selector) => container.querySelector(selector)!,
    );
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(container.querySelector("[data-kind='travel']")).toBeNull();
    expect(container.querySelector("[data-part='attribution']")).toBeNull();
  });

  it("J5 : bandeau de trajet role=status", () => {
    render(<JourneePanel day={day(5)} routes={routes} />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveAttribute("data-kind", "travel");
    expect(banner).toHaveTextContent("2 h 45 de trajet ce jour, au-delà des 1 h 30 prévues pour ton rythme.");
  });

  it("jour de test en préparation : bandeau « Jour {n} en préparation », ni ligne du jour ni bandeau de trajet, événements gardés", () => {
    const generating: Day = { ...day(2), generating: true, travelMinutes: 200 };
    const { container } = render(<JourneePanel day={generating} routes={routes} />);
    expect(screen.getByRole("status")).toHaveAttribute("data-kind", "generating");
    expect(screen.getByRole("status")).toHaveTextContent("Jour 2 en préparation");
    expect(container.querySelector("#liste-etapes")).toBeNull();
    expect(container.querySelector("[data-kind='travel']")).toBeNull();
    expect(container.querySelector("[data-part='surprise']")).toBeNull();
    expect(screen.getByRole("region", { name: "Événements du jour" })).toBeInTheDocument();
  });

  it("sans budget, sans événement, sans idée : durée seule, pas de section, pas de bouton", () => {
    const plain: Day = { ...day(2), budgetPerPerson: undefined, events: [], surprise: undefined };
    render(<JourneePanel day={plain} routes={routes} />);
    expect(screen.getByText("1 h 25 de trajet")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Événements du jour" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Surprends-moi" })).toBeNull();
  });

  it("événement sans fin : l'heure de début seule", () => {
    expect(eventRange({ start: "18:00" })).toBe("18:00");
    expect(eventRange({ start: "18:00", end: "19:00" })).toBe("18:00 – 19:00");
  });

  it("journee: surprends-moi : aria-expanded, idée dévoilée sous le bouton, focus resté, masquée au second appui", () => {
    render(<JourneePanel day={day(2)} routes={routes} />);
    const button = screen.getByRole("button", { name: "Surprends-moi" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(button.getAttribute("aria-controls")!)!;
    expect(panel).toBeEmptyDOMElement();
    button.focus();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveFocus();
    expect(within(panel).getByRole("heading", { level: 3 })).toHaveTextContent("[Circus Lane]");
    expect(within(panel).getByText("[Stockbridge, 20 min, gratuit]")).toBeInTheDocument();
    expect(within(panel).getByText("Pourquoi pour toi")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Source/ })).toHaveAttribute("href", "https://example.org/mock/circus-lane");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(panel).toBeEmptyDOMElement();
  });

  it("n'a aucune violation axe (J2 avec l'idée ouverte, J5)", async () => {
    const { container, unmount } = render(<JourneePanel day={day(2)} routes={routes} />);
    fireEvent.click(screen.getByRole("button", { name: "Surprends-moi" }));
    expect(await axeViolations(container)).toEqual([]);
    unmount();
    const j5 = render(<JourneePanel day={day(5)} routes={routes} />);
    expect(await axeViolations(j5.container)).toEqual([]);
  });
});
