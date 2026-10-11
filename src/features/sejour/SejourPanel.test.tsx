import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryRecorder, type MemoryRecorder } from "@/analytics/track";
import type { Trip } from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { SejourOriginProvider } from "./SejourOrigin";
import { SejourPanel } from "./SejourPanel";
import { TripShell } from "./TripShell";

// Séjour : pas de paramètre `n` ni `etape`.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

// La carte d'ensemble n'intervient pas dans le contenu du panneau.
vi.mock("@/components/carte/DayMap", () => ({ DayMap: () => null }));

let recorder: MemoryRecorder;

beforeEach(() => {
  recorder = createMemoryRecorder();
});

function renderSejour(trip: Trip = edimbourg) {
  return render(
    <TripShell trip={trip} maps={[]} base="/voyages">
      <SejourOriginProvider>
        <SejourPanel recorder={recorder} />
      </SejourOriginProvider>
    </TripShell>,
  );
}

const panel = () => screen.getByRole("region", { name: "Programme" });
const section = (name: string) => within(panel()).getByRole("heading", { level: 2, name }).closest("section")!;

describe("SejourPanel : en-tête et budget (F5-PO-3)", () => {
  it("plaque « Édimbourg » de niveau 1, ligne de dates et voyageurs, aplat dest-bruyere ; budget total", () => {
    const { container } = renderSejour();
    expect(screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.textContent)).toEqual(["Édimbourg"]);
    expect(screen.getByText("sam. 29.08 – jeu. 03.09 · 2 adultes")).toBeInTheDocument();
    expect(container.querySelector("[data-destination-plate]")).toHaveClass("bg-dest-bruyere");
    expect(container.querySelector("[data-part='budget']")).toHaveTextContent("Budget estimé : environ 640 CHF par personne");
  });

  it("ordre : plaque, budget, « À faire avant de partir », « Pendant ton séjour », « Jour par jour »", () => {
    renderSejour();
    const headings = within(panel())
      .getAllByRole("heading")
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["Édimbourg", "À faire avant de partir", "Pendant ton séjour", "Jour par jour"]);
  });

  it("un jour sans budget est nommé ; aucun jour avec budget : pas de ligne de budget", () => {
    const sansJ3 = { ...edimbourg, days: edimbourg.days.map((day) => (day.index === 3 ? { ...day, budgetPerPerson: undefined } : day)) };
    const { container, unmount } = renderSejour(sansJ3);
    expect(container.querySelector("[data-part='budget']")).toHaveTextContent(
      "Budget estimé : environ 480 CHF par personne (sans le jour 3)",
    );
    unmount();
    const sansBudget = { ...edimbourg, days: edimbourg.days.map((day) => ({ ...day, budgetPerPerson: undefined })) };
    const second = renderSejour(sansBudget);
    expect(second.container.querySelector("[data-part='budget']")).toBeNull();
  });

  it("2 adultes et 1 enfant", () => {
    renderSejour({ ...edimbourg, travellers: { adults: 2, children: 1 } });
    expect(screen.getByText("sam. 29.08 – jeu. 03.09 · 2 adultes, 1 enfant")).toBeInTheDocument();
  });
});

describe("SejourPanel : « À faire avant de partir » (F5-PO-4)", () => {
  it("5 lignes dans l'ordre des données, compteur « 4 réservations à faire », billets du Tattoo faits", () => {
    renderSejour();
    const list = section("À faire avant de partir");
    expect(within(list).getAllByRole("button")).toHaveLength(5);
    expect(within(list).getAllByRole("listitem").map((item) => item.querySelector("[id]")?.textContent)).toEqual(
      edimbourg.checklist.map((item) => item.label),
    );
    expect(within(list).getByRole("img", { name: "4 réservations à faire" })).toHaveTextContent("4");
    expect(within(list).getByRole("button", { name: "[Billets du Tattoo]" })).toHaveAttribute("aria-pressed", "true");
    expect(within(list).getByText("[Billets du Tattoo]")).toHaveClass("line-through");
    // « [Assurance voyage] » : lien rémunéré.
    const assurance = within(list).getByRole("button", { name: "[Assurance voyage]" }).closest("li")!;
    expect(within(assurance).getByText("Lien rémunéré")).toBeInTheDocument();
    expect(within(list).getAllByRole("link", { name: "Réserver" })).toHaveLength(4);
  });

  it("cocher le château : ligne faite sans lien, compteur à 3, un checklist_item_done sans propriété, aucun toast", async () => {
    const { container } = renderSejour();
    const list = section("À faire avant de partir");
    const chateau = within(list).getByRole("button", { name: "[Château d'Édimbourg]" });
    await act(async () => fireEvent.click(chateau));
    expect(chateau).toHaveAttribute("aria-pressed", "true");
    expect(within(chateau.closest("li")!).queryByRole("link")).not.toBeInTheDocument();
    expect(within(list).getByRole("img", { name: "3 réservations à faire" })).toBeInTheDocument();
    // Validation chargée au premier cochage (createLazyTrack).
    await waitFor(() => expect(recorder.events).toEqual([{ name: "checklist_item_done", properties: {} }]));
    expect(container.querySelector("[data-undo-toast]")).toBeNull();

    // Décocher : ligne rétablie, compteur à 4, aucun événement.
    await act(async () => fireEvent.click(chateau));
    expect(chateau).toHaveAttribute("aria-pressed", "false");
    expect(within(chateau.closest("li")!).getByRole("link", { name: "Réserver" })).toBeInTheDocument();
    expect(within(list).getByRole("img", { name: "4 réservations à faire" })).toBeInTheDocument();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(recorder.events).toHaveLength(1);
  });

  it("singulier à 1, compteur masqué à 0", async () => {
    renderSejour();
    const list = section("À faire avant de partir");
    for (const name of ["[Excursion dans les Highlands]", "[Château d'Édimbourg]", "[Visite de la distillerie]"]) {
      await act(async () => fireEvent.click(within(list).getByRole("button", { name })));
    }
    expect(within(list).getByRole("img", { name: "1 réservation à faire" })).toBeInTheDocument();
    await act(async () => fireEvent.click(within(list).getByRole("button", { name: "[Assurance voyage]" })));
    expect(within(list).queryByRole("img")).not.toBeInTheDocument();
    await waitFor(() => expect(recorder.events).toHaveLength(4));
  });

  it("l'action injectée est appelée ; l'événement n'est envoyé qu'une fois la promesse résolue", async () => {
    let resolve: () => void = () => {};
    const actions = {
      setStopLocked: vi.fn(async () => {}),
      undo: vi.fn(async () => {}),
      setChecklistItemDone: vi.fn(() => new Promise<void>((done) => (resolve = done))),
    };
    render(
      <TripShell trip={edimbourg} maps={[]} base="/voyages" actions={actions}>
        <SejourPanel recorder={recorder} />
      </TripShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "[Château d'Édimbourg]" }));
    expect(actions.setChecklistItemDone).toHaveBeenCalledWith("check-chateau", true);
    expect(recorder.events).toEqual([]);
    await act(async () => new Promise((wait) => setTimeout(wait, 50)));
    expect(recorder.events).toEqual([]);
    await act(async () => resolve());
    await waitFor(() => expect(recorder.events).toEqual([{ name: "checklist_item_done", properties: {} }]));
  });
});

describe("SejourPanel : « Pendant ton séjour » et « Jour par jour »", () => {
  it("événements des jours, par jour : concert (J2) puis marché (J4), avec jour, date et plage ; le Tattoo n'y est pas", () => {
    renderSejour();
    const events = section("Pendant ton séjour");
    const links = within(events).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/voyages/mock_trip_edimbourg/jour/2?etape=j2-concert-orgue",
      `/voyages/mock_trip_edimbourg/jour/4?etape=${edimbourg.days[3]!.events[0]!.id}`,
    ]);
    expect(links[0]).toHaveTextContent("J2 · dim. 30.08 · 18:00 – 19:00");
    expect(links[0]).toHaveTextContent("[Concert d'orgue à St Giles]");
    expect(links[0]).toHaveTextContent("Non confirmé");
    expect(links[1]).toHaveTextContent(/^J4 · mar\. 01\.09 · /);
    expect(links[1]).toHaveTextContent("[Marché nocturne de Leith]");
    expect(events).not.toHaveTextContent("Tattoo");
  });

  it("sans événement : « Aucun événement retenu pour tes dates. »", () => {
    renderSejour({ ...edimbourg, days: edimbourg.days.map((day) => ({ ...day, events: [] })) });
    expect(within(section("Pendant ton séjour")).getByText("Aucun événement retenu pour tes dates.")).toBeInTheDocument();
  });

  it("6 liens vers les jours, avec « J{n} », le titre et le résumé ; un jour en préparation affiche « En préparation »", () => {
    renderSejour({ ...edimbourg, days: edimbourg.days.map((day) => (day.index === 6 ? { ...day, generating: true } : day)) });
    const days = within(section("Jour par jour")).getAllByRole("link");
    expect(days.map((link) => link.getAttribute("href"))).toEqual([1, 2, 3, 4, 5, 6].map((n) => `/voyages/mock_trip_edimbourg/jour/${n}`));
    expect(days[1]).toHaveTextContent("J2");
    expect(days[1]).toHaveTextContent("Dimanche 30 août");
    expect(days[1]).toHaveTextContent(/\d+ étapes · 1 h 25 de trajet/);
    expect(days[5]).toHaveTextContent("En préparation");
    expect(days[5]).not.toHaveTextContent("de trajet");
  });

  it("axe sans violation", async () => {
    const { container } = renderSejour();
    expect(await axeViolations(container)).toEqual([]);
  });
});
