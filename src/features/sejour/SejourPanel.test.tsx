import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryRecorder, type MemoryRecorder } from "@/analytics/track";
import type { Trip } from "@/contracts";
import { edimbourg, edimbourgDebloque } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { SejourOriginProvider } from "./SejourOrigin";
import { SejourPanel } from "./SejourPanel";
import { checklistLabel } from "./travel";
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

function renderSejour(trip: Trip = edimbourg, unlockHref: string | null = null, versionable = false) {
  return render(
    <TripShell trip={trip} maps={[]} base="/voyages" unlockHref={unlockHref} versionable={versionable}>
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
      edimbourg.checklist.map(checklistLabel),
    );
    // Réservations : le seul nom stocké, « Réserver : » composé à l'écran (M5e) ; billet déjà pris : son libellé.
    expect(edimbourg.checklist.map(checklistLabel).slice(0, 2)).toEqual(["[Billets du Tattoo]", "Réserver : [Excursion dans les Highlands]"]);
    expect(within(list).getByRole("img", { name: "4 réservations à faire" })).toHaveTextContent("4");
    expect(within(list).getByRole("button", { name: "[Billets du Tattoo]" })).toHaveAttribute("aria-pressed", "true");
    expect(within(list).getByText("[Billets du Tattoo]")).toHaveClass("line-through");
    // « [Assurance voyage] » : lien rémunéré.
    const assurance = within(list).getByRole("button", { name: "Réserver : [Assurance voyage]" }).closest("li")!;
    expect(within(assurance).getByText("Lien rémunéré")).toBeInTheDocument();
    expect(within(list).getAllByRole("link", { name: "Réserver" })).toHaveLength(4);
  });

  it("cocher le château : ligne faite sans lien, compteur à 3, un checklist_item_done sans propriété, aucun toast", async () => {
    const { container } = renderSejour();
    const list = section("À faire avant de partir");
    const chateau = within(list).getByRole("button", { name: "Réserver : [Château d'Édimbourg]" });
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
    for (const name of ["Réserver : [Excursion dans les Highlands]", "Réserver : [Château d'Édimbourg]", "Réserver : [Visite de la distillerie]"]) {
      await act(async () => fireEvent.click(within(list).getByRole("button", { name })));
    }
    expect(within(list).getByRole("img", { name: "1 réservation à faire" })).toBeInTheDocument();
    await act(async () => fireEvent.click(within(list).getByRole("button", { name: "Réserver : [Assurance voyage]" })));
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
    fireEvent.click(screen.getByRole("button", { name: "Réserver : [Château d'Édimbourg]" }));
    expect(actions.setChecklistItemDone).toHaveBeenCalledWith("check-chateau", true);
    expect(recorder.events).toEqual([]);
    await act(async () => new Promise((wait) => setTimeout(wait, 50)));
    expect(recorder.events).toEqual([]);
    await act(async () => resolve());
    await waitFor(() => expect(recorder.events).toEqual([{ name: "checklist_item_done", properties: {} }]));
  });

  it("a-faire: compteur des réservations seulement : bons plans et billets ne comptent pas, compteur absent sans réservation", () => {
    const bonsPlans: Trip = {
      ...edimbourg,
      checklist: edimbourg.checklist.map((item) => (item.kind === "reservation" ? { ...item, kind: "other" as const } : item)),
    };
    renderSejour(bonsPlans);
    const list = section("À faire avant de partir");
    expect(within(list).getAllByRole("button")).toHaveLength(5);
    expect(within(list).queryByRole("img")).not.toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "[Château d'Édimbourg]" })).toBeInTheDocument();
  });

  it("a-faire: un échec de l'enregistrement affiche « Impossible d'enregistrer. Réessaie. » (role alert), sans mesure", async () => {
    let echoue = true;
    const actions = {
      setStopLocked: vi.fn(async () => {}),
      undo: vi.fn(async () => {}),
      setChecklistItemDone: vi.fn(async () => {
        if (echoue) throw new Error("case non enregistrée");
      }),
      checklistOnServer: true,
    };
    render(
      <TripShell trip={edimbourg} maps={[]} base="/voyages" actions={actions}>
        <SejourPanel recorder={recorder} />
      </TripShell>,
    );
    const alerte = () => screen.getByRole("alert");
    expect(alerte()).toHaveTextContent("");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Réserver : [Château d'Édimbourg]" })));
    expect(alerte()).toHaveTextContent("Impossible d'enregistrer. Réessaie.");
    await act(async () => new Promise((wait) => setTimeout(wait, 50)));
    expect(recorder.events).toEqual([]);
    // Nouvel échec : le message reste (annoncé de nouveau) ; il ne disparaît qu'au prochain cochage réussi.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Réserver : [Château d'Édimbourg]" })));
    expect(alerte()).toHaveTextContent("Impossible d'enregistrer. Réessaie.");
    // Nouvel essai réussi : le message disparaît.
    echoue = false;
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Réserver : [Château d'Édimbourg]" })));
    expect(alerte()).toHaveTextContent("");
  });

  it("a-faire: hors ligne, cochage enregistré : cases inactives décrites par le bandeau ; cochage en mémoire : cases actives", async () => {
    const enLigne = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    try {
      const actions = { setStopLocked: vi.fn(async () => {}), undo: vi.fn(async () => {}), setChecklistItemDone: vi.fn(async () => {}), checklistOnServer: true };
      const { unmount } = render(
        <TripShell trip={edimbourg} maps={[]} base="/voyages" actions={actions}>
          <SejourPanel recorder={recorder} />
        </TripShell>,
      );
      const chateau = screen.getByRole("button", { name: "Réserver : [Château d'Édimbourg]" });
      expect(chateau).toHaveAttribute("aria-disabled", "true");
      expect(chateau).toHaveAccessibleDescription("Tu es hors ligne. Cocher une ligne demande une connexion.");
      fireEvent.click(chateau);
      expect(actions.setChecklistItemDone).not.toHaveBeenCalled();
      unmount();
      renderSejour();
      expect(screen.getByRole("button", { name: "Réserver : [Château d'Édimbourg]" })).not.toHaveAttribute("aria-disabled");
    } finally {
      enLigne.mockRestore();
    }
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

  it("décision 0074 : jours sans durée connue, résumé « N étapes » sans « de trajet » ; jour sans étape : « Aucune étape »", () => {
    const days = edimbourg.days.map((day) => ({
      ...day,
      items: day.index === 3 ? [] : day.items.filter((item) => item.type !== "segment"),
      travelMinutes: 0,
    }));
    renderSejour({ ...edimbourg, days });
    const liens = within(section("Jour par jour")).getAllByRole("link");
    const etapesJ2 = days[1]!.items.filter((item) => item.type === "stop").length;
    expect(liens[1]).toHaveTextContent(`${etapesJ2} étapes`);
    for (const lien of liens) expect(lien).not.toHaveTextContent("de trajet");
    expect(liens[2]).toHaveTextContent("Aucune étape");
  });

  it("axe sans violation", async () => {
    const { container } = renderSejour();
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("SejourPanel : lien « Aujourd'hui · Jour {n} » (F10-PO-7, C16)", () => {
  function renderAt(iso: string, base: "/voyages" | "/dev/voyages" = "/voyages") {
    return render(
      <TripShell trip={edimbourg} maps={[]} base={base}>
        <SejourOriginProvider>
          <SejourPanel recorder={recorder} now={() => Date.parse(iso)} />
        </SejourOriginProvider>
      </TripShell>,
    );
  }

  it("aux dates du voyage, en tête du panneau, avant la plaque : lien vers l'écran 15", async () => {
    const { container } = renderAt("2026-08-30T10:40:00+01:00");
    const link = within(panel()).getByRole("link", { name: "Aujourd'hui · Jour 2" });
    expect(link).toHaveAttribute("href", "/voyages/mock_trip_edimbourg/aujourdhui");
    const plate = container.querySelector("[data-destination-plate]")!;
    expect(link.compareDocumentPosition(plate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("date de la destination : 23:30 le 29.08 à Édimbourg est le jour 1", () => {
    renderAt("2026-08-30T00:30:00+02:00");
    expect(within(panel()).getByRole("link", { name: "Aujourd'hui · Jour 1" })).toBeInTheDocument();
  });

  it.each(["2026-08-01T12:00:00+01:00", "2026-08-28T23:30:00+01:00", "2026-09-04T00:30:00+01:00"])(
    "hors des dates (%s) : pas de lien",
    (iso) => {
      renderAt(iso);
      expect(within(panel()).queryByRole("link", { name: /^Aujourd'hui/ })).toBeNull();
    },
  );

  it("base /dev/voyages : pas de lien (pas de page R15 de développement)", () => {
    renderAt("2026-08-30T10:40:00+01:00", "/dev/voyages");
    expect(within(panel()).queryByRole("link", { name: /^Aujourd'hui/ })).toBeNull();
  });
});

describe("SejourPanel : journées « À débloquer » (spécification E2E-essai, lot 1 ; décision 0124 § 7)", () => {
  // Voyage mock non débloqué qui ne sert que ses deux premières journées (forme d'un voyage d'essai avant déblocage).
  const partiel: Trip = { ...edimbourg, unlocked: false, days: edimbourg.days.slice(0, 2) };
  const jourParJour = () => section("Jour par jour");

  it("avec un lien de déblocage : une ligne par journée absente, pastille sans « complet », nom « Jour 3, à débloquer », bouton", async () => {
    const { container } = renderSejour(partiel, "/voyages/x/debloquer");
    const lignes = [...container.querySelectorAll("[data-part='jour-a-debloquer']")];
    expect(lignes).toHaveLength(edimbourg.days.length - 2);
    expect(lignes[0]).toHaveTextContent("Jour 3, à débloquer");
    for (const ligne of lignes) {
      expect(ligne).not.toHaveTextContent(/complet/);
      expect(ligne.querySelector("a, button")).toBeNull();
    }
    expect(within(jourParJour()).getByText("Jour 3, à débloquer")).toHaveClass("sr-only");
    const bouton = within(jourParJour()).getByRole("link", { name: "Débloquer" });
    expect(bouton).toHaveAttribute("href", "/voyages/x/debloquer");
    expect(within(jourParJour()).getAllByRole("link").filter((lien) => lien.getAttribute("data-part") === "jour")).toHaveLength(2);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("sans lien de déblocage : ni ligne « À débloquer » ni bouton, seulement les journées servies", () => {
    const { container } = renderSejour(partiel, null);
    expect(container.querySelector("[data-part='jour-a-debloquer']")).toBeNull();
    expect(container.querySelector("[data-part='debloquer']")).toBeNull();
    expect(within(jourParJour()).queryByText(/débloquer/i)).toBeNull();
  });

  it("voyage débloqué (journées partielles) ou voyage complet : aucune ligne « À débloquer », même avec un lien", () => {
    const { container, unmount } = renderSejour({ ...edimbourgDebloque, days: edimbourgDebloque.days.slice(0, 2) }, "/voyages/x/debloquer");
    expect(container.querySelector("[data-part='jour-a-debloquer']")).toBeNull();
    expect(container.querySelector("[data-part='debloquer']")).toBeNull();
    unmount();
    renderSejour(edimbourg, "/voyages/x/debloquer");
    expect(document.querySelector("[data-part='jour-a-debloquer']")).toBeNull();
    expect(document.querySelector("[data-part='debloquer']")).toBeNull();
  });
});

describe("SejourPanel : « Versions du programme » (M5b, ticket 934 ; spécification M5 § 4)", () => {
  it("voyage débloqué, versions disponibles : lien vers `/voyages/{id}/versions`, sans violation", async () => {
    const { container } = renderSejour(edimbourgDebloque, null, true);
    expect(within(panel()).getByRole("link", { name: "Versions du programme" })).toHaveAttribute("href", `/voyages/${edimbourgDebloque.id}/versions`);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("voyage non débloqué, ou versions indisponibles : aucun lien", () => {
    renderSejour(edimbourg, null, true);
    expect(within(panel()).queryByRole("link", { name: "Versions du programme" })).toBeNull();
  });

  it("versions indisponibles (site d'essai) : aucun lien, même débloqué", () => {
    renderSejour(edimbourgDebloque, null, false);
    expect(within(panel()).queryByRole("link", { name: "Versions du programme" })).toBeNull();
  });
});
