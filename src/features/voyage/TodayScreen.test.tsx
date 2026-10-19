import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryRecorder } from "@/analytics/track";
import * as messages from "@/i18n/messages";
import { edimbourg, edimbourgDebloque } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { projectTodayTrip } from "./today";
import { pourYAller, TodayScreen, type TodayScreenProps } from "./TodayScreen";

/** Écran 15 (spécification F10, critères [a] : C5, C7 à C15, C17, C18 en rendu unitaire, horloge injectée). */

const t = messages.voyage.aujourdhui;
const TRIP = projectTodayTrip(edimbourg);
const TRIP_OK = projectTodayTrip(edimbourgDebloque);

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }));

function renderAt(iso: string, props: Partial<TodayScreenProps> = {}) {
  const recorder = createMemoryRecorder();
  const now = () => Date.parse(iso);
  const view = render(<TodayScreen trip={TRIP} placesFromGoogle={false} recorder={recorder} now={now} deviceTimeZone="Europe/London" {...props} />);
  return { ...view, recorder };
}

/** Attend la fin de la mesure chargée à la demande (`createLazyTrack`). */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const region = (name: string) => screen.getByRole("region", { name });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TodayScreen : « Pour y aller » (décision 0095 § 2)", () => {
  it("textes exacts : mode en minuscule après « : », avec durée, estimée ou à confirmer", () => {
    expect(pourYAller({ mode: "walk", minutes: 20, estimated: false })).toBe("Pour y aller : à pied, 20 min");
    expect(pourYAller({ mode: "transit", minutes: 25, estimated: true })).toBe("Pour y aller : bus, environ 25 min (estimation)");
    expect(pourYAller({ mode: "car", minutes: 15, estimated: false })).toBe("Pour y aller : en voiture, 15 min");
    expect(pourYAller({ mode: "walk", minutes: null, estimated: false })).toBe("Pour y aller : à pied, durée à confirmer");
    expect(pourYAller({ mode: "transit", minutes: null, estimated: true })).toBe("Pour y aller : bus, durée à confirmer");
    expect(pourYAller({ mode: "car", minutes: null, estimated: false })).toBe("Pour y aller : en voiture, durée à confirmer");
  });

  it("trajet sans durée : paragraphe lu « Pour y aller : à pied, durée à confirmer », lien « Itinéraire » conservé", () => {
    const jour = edimbourg.days[1]!;
    const index = jour.items.findIndex((item) => item.type === "stop" && item.stop.name === "[Dean Village]");
    const items = jour.items.map((item, i) => (i === index - 1 && item.type === "segment" ? { ...item, segment: { ...item.segment, minutes: null } } : item));
    const trip = projectTodayTrip({ ...edimbourg, days: edimbourg.days.map((day) => (day === jour ? { ...day, items, travelMinutes: null } : day)) });
    renderAt("2026-08-30T10:40:00+01:00", { trip });
    const next = region(t.prochaine.titre);
    expect(next.querySelector("[data-part='pour-y-aller']")?.textContent).toBe("Pour y aller : à pied, durée à confirmer");
    expect(within(next).getByRole("link", { name: "Itinéraire vers [Dean Village] (nouvelle fenêtre)" })).toBeInTheDocument();
  });
});

describe("TodayScreen : jour J (C7)", () => {
  it("titre, sous-titre, pas de « En ce moment » ; « Prochaine étape » avec horaire, nom, trajet et itinéraire", () => {
    renderAt("2026-08-30T10:40:00+01:00");
    expect(screen.getByRole("heading", { level: 1, name: "Aujourd'hui" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(document.querySelector("[data-part='sous-titre']")?.textContent).toBe("Édimbourg · Jour 2 · Dimanche 30 août");
    expect(screen.queryByRole("region", { name: t.enCeMoment.titre })).toBeNull();
    const next = region(t.prochaine.titre);
    expect(next).toHaveTextContent("10:50 – 11:50");
    expect(next).toHaveTextContent("[Dean Village]");
    expect(next).toHaveTextContent("Pour y aller : à pied, 20 min");
    const link = within(next).getByRole("link", { name: "Itinéraire vers [Dean Village] (nouvelle fenêtre)" });
    expect(link).toHaveTextContent("Itinéraire");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(link.getAttribute("href")).toContain("mock_place_dean_village");
    expect(link).not.toHaveAttribute("aria-disabled");
  });

  it("blocs en aplat muted, jamais raised (F10-PO-22) ; « Prochaine étape » précède le bandeau « À réserver »", () => {
    renderAt("2026-08-30T10:51:00+01:00");
    for (const name of [t.enCeMoment.titre, t.prochaine.ensuite]) {
      expect(region(name)).toHaveClass("bg-muted");
      expect(region(name)).not.toHaveClass("bg-raised");
    }
    const next = region(t.prochaine.ensuite);
    const banner = region(t.rappels.titre);
    expect(next.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Hors des marqueurs de la ligne du jour (composant DayLine), `raised` n'est que celui du contrôle « Retour ».
    const raised = Array.from(document.querySelectorAll(".bg-raised")).filter((node) => !node.closest("ol"));
    expect(raised.map((node) => node.getAttribute("data-part"))).toEqual(["retour"]);
  });

  it("mention du fuseau seulement quand l'appareil est à une autre heure (Q188)", () => {
    const { unmount } = renderAt("2026-08-30T10:40:00+01:00");
    expect(document.querySelector("[data-part='fuseau']")).toBeNull();
    unmount();
    renderAt("2026-08-30T10:40:00+01:00", { deviceTimeZone: "Europe/Zurich" });
    expect(document.querySelector("[data-part='fuseau']")?.textContent).toBe("Heures d'Édimbourg");
  });
});

describe("TodayScreen : au fil de la journée (C8, C11)", () => {
  it("10:51 : « En ce moment » Dean Village jusqu'à 11:50, « Ensuite » Café de Stockbridge", () => {
    renderAt("2026-08-30T10:51:00+01:00");
    const current = region(t.enCeMoment.titre);
    expect(current).toHaveTextContent("[Dean Village]");
    expect(current).toHaveTextContent("jusqu'à 11:50");
    const next = region(t.prochaine.ensuite);
    expect(next).toHaveTextContent("[Café de Stockbridge]");
    expect(next).toHaveTextContent("12:05 – 13:15");
    expect(screen.queryByRole("region", { name: t.prochaine.titre })).toBeNull();
  });

  it("16:00 : temps libre jusqu'à 18:30 ; « Ensuite » Bonne table de New Town sans « Itinéraire » (pas de placeId)", () => {
    renderAt("2026-08-30T16:00:00+01:00");
    expect(region(t.enCeMoment.titre)).toHaveTextContent("Temps libre jusqu'à 18:30");
    const next = region(t.prochaine.ensuite);
    expect(next).toHaveTextContent("[Bonne table de New Town]");
    expect(next).toHaveTextContent("19:00 – 20:30");
    expect(within(next).queryByRole("link")).toBeNull();
  });

  it("21:00 : « Plus d'étape aujourd'hui. » et « Demain » : première étape à 08:00", () => {
    renderAt("2026-08-30T21:00:00+01:00");
    expect(screen.getByText(t.prochaine.plusDEtape)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: t.prochaine.titre })).toBeNull();
    expect(region(t.demain.titre)).toHaveTextContent("Première étape à 08:00 : [Excursion guidée dans les Highlands]");
  });

  it("appareil à Zurich, 00:30 le 30.08 (23:30 le 29.08 à Édimbourg) : jour 1", () => {
    renderAt("2026-08-30T00:30:00+02:00", { deviceTimeZone: "Europe/Zurich" });
    expect(document.querySelector("[data-part='sous-titre']")?.textContent).toBe("Édimbourg · Jour 1 · Samedi 29 août");
    expect(screen.getByText(t.prochaine.plusDEtape)).toBeInTheDocument();
    expect(region(t.demain.titre)).toHaveTextContent("Première étape à 09:15 : [Royal Mile]");
  });
});

describe("TodayScreen : rappels (C10)", () => {
  it("10:40 : « Aujourd'hui » 19:00 Bonne table, « Demain » 08:00 Excursion ; phrase de Q187 ; bandeau quai, texte ink", () => {
    renderAt("2026-08-30T10:40:00+01:00");
    const banner = region(t.rappels.titre);
    expect(banner).toHaveClass("bg-quai", "text-ink");
    expect(within(banner).getByRole("heading", { level: 3, name: t.rappels.aujourdhui })).toBeInTheDocument();
    expect(within(banner).getByRole("list", { name: t.rappels.aujourdhui })).toHaveTextContent("19:00 [Bonne table de New Town]");
    expect(within(banner).getByRole("list", { name: t.rappels.demain })).toHaveTextContent("08:00 [Excursion guidée dans les Highlands]");
    expect(banner).toHaveTextContent(t.rappels.avertissement);
  });

  it("21:00 : la ligne de 19:00 a disparu ; seul « Demain » reste", () => {
    renderAt("2026-08-30T21:00:00+01:00");
    const banner = region(t.rappels.titre);
    expect(banner).not.toHaveTextContent("[Bonne table de New Town]");
    expect(within(banner).queryByRole("heading", { name: t.rappels.aujourdhui })).toBeNull();
    expect(banner).toHaveTextContent("08:00 [Excursion guidée dans les Highlands]");
  });
});

describe("TodayScreen : hors des dates (C12)", () => {
  it.each([
    ["2026-08-01T12:00:00+01:00", "Ton voyage commence le samedi 29 août."],
    ["2026-09-04T12:00:00+01:00", "Ton voyage est terminé."],
    ["2026-10-11T12:00:00+01:00", "Ton voyage est terminé."],
  ])("%s : « %s », sous-titre « Édimbourg », lien « Voir le séjour », ni rappel ni « Prochaine étape »", (iso, text) => {
    renderAt(iso);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(document.querySelector("[data-part='sous-titre']")?.textContent).toBe("Édimbourg");
    expect(screen.getByRole("link", { name: t.voirSejour })).toHaveAttribute("href", "/voyages/mock_trip_edimbourg");
    expect(screen.queryByRole("region", { name: t.rappels.titre })).toBeNull();
    expect(screen.queryByRole("region", { name: t.prochaine.titre })).toBeNull();
    expect(screen.queryByRole("region", { name: t.demain.titre })).toBeNull();
  });

  it("la veille : « Ton voyage commence demain. » et la première étape du jour 1", () => {
    renderAt("2026-08-28T12:00:00+01:00");
    expect(screen.getByText(t.veille)).toBeInTheDocument();
    expect(region(t.demain.titre)).toHaveTextContent("Première étape à 12:45 : [Petite adresse du Grassmarket]");
    expect(screen.queryByRole("region", { name: t.rappels.titre })).toBeNull();
  });

  it("dernier jour : pas de bloc « Demain »", () => {
    renderAt("2026-09-03T10:00:00+01:00");
    expect(document.querySelector("[data-part='sous-titre']")?.textContent).toBe("Édimbourg · Jour 6 · Jeudi 3 septembre");
    expect(screen.queryByRole("region", { name: t.demain.titre })).toBeNull();
  });
});

describe("TodayScreen : jour en préparation, jour sans étape (C13)", () => {
  it("voyage débloqué, J6 en préparation : texte seul, ni « En ce moment », ni « Prochaine étape », ni « Ta journée », ni « Demain » ; une mesure", async () => {
    const { recorder } = renderAt("2026-09-03T10:00:00+01:00", { trip: TRIP_OK });
    expect(screen.getByText(t.journee.enPreparation)).toBeInTheDocument();
    for (const name of [t.enCeMoment.titre, t.prochaine.titre, t.journee.titre, t.demain.titre]) {
      expect(screen.queryByRole("region", { name })).toBeNull();
    }
    await flush();
    expect(recorder.events).toEqual([{ name: "today_opened", properties: { offline: false } }]);
  });

  it("jour sans étape (repas pas encore choisis exceptés) : « Pas d'étape prévue aujourd'hui. », « Ta journée » gardée", () => {
    const trip = {
      ...TRIP,
      days: TRIP.days.map((day) =>
        day.index === 2
          ? {
              ...day,
              items: [
                { type: "terminus" as const, role: "start" as const, time: "09:00", label: "[Hôtel]" },
                { type: "openMeal" as const, time: "12:30", meal: "lunch" as const },
                { type: "free" as const, from: "14:00", to: "18:00" },
                { type: "terminus" as const, role: "end" as const, time: "20:00", label: "[Hôtel]" },
              ],
            }
          : day,
      ),
    };
    renderAt("2026-08-30T10:40:00+01:00", { trip });
    expect(screen.getByText(t.prochaine.aucuneEtape)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: t.prochaine.titre })).toBeNull();
    expect(region(t.journee.titre)).toHaveTextContent("Temps libre jusqu'à 18:00");
    expect(region(t.demain.titre)).toBeInTheDocument();
  });
});

describe("TodayScreen : chargement (C14) et mesure (C18)", () => {
  it("avant le montage : titre, « Chargement de ta journée. » (role=status) et <noscript> ; aucun contenu du jour", () => {
    const html = renderToString(<TodayScreen trip={TRIP} placesFromGoogle={false} now={() => Date.parse("2026-08-30T10:40:00+01:00")} />);
    const host = document.createElement("div");
    host.innerHTML = html;
    expect(host.querySelector("h1")?.textContent).toBe("Aujourd'hui");
    expect(host.querySelector("[data-part='chargement']")?.getAttribute("role")).toBe("status");
    expect(host.querySelector("[data-part='chargement']")?.textContent).toBe(t.chargement);
    const noscript = host.querySelector("noscript")?.innerHTML ?? "";
    expect(noscript).toContain(t.sansJavascript);
    expect(noscript).toContain('href="/voyages/mock_trip_edimbourg"');
    const visible = (host.textContent ?? "").replace(host.querySelector("noscript")?.textContent ?? "", "");
    expect(visible).not.toContain("[Dean Village]");
    expect(visible).not.toContain(t.prochaine.titre);
  });

  it("après le montage : l'annonce de chargement est remplacée par le contenu ; une seule mesure { offline: false }", async () => {
    const { recorder, rerender } = renderAt("2026-08-30T10:40:00+01:00");
    expect(document.querySelector("[data-part='chargement']")).toBeNull();
    await flush();
    rerender(<TodayScreen trip={TRIP} placesFromGoogle={false} recorder={recorder} now={() => Date.parse("2026-08-30T10:40:00+01:00")} />);
    await flush();
    expect(recorder.events).toEqual([{ name: "today_opened", properties: { offline: false } }]);
  });

  it.each(["2026-08-01T12:00:00+01:00", "2026-09-04T12:00:00+01:00"])("une seule mesure aussi le %s", async (iso) => {
    const { recorder } = renderAt(iso);
    await flush();
    expect(recorder.events).toEqual([{ name: "today_opened", properties: { offline: false } }]);
  });
});

describe("TodayScreen : ta journée et navigation (C15)", () => {
  it("ligne compacte sans lien ni meta ; Dean Village en cours, Royal Mile terminée, Café à venir", () => {
    const { container } = renderAt("2026-08-30T10:51:00+01:00");
    const journee = region(t.journee.titre);
    const list = within(journee).getByRole("list");
    expect(list.tagName).toBe("OL");
    expect(within(list).queryAllByRole("link")).toEqual([]);
    expect(list).not.toHaveTextContent("[Water of Leith, 1 h, gratuit]");
    const current = container.querySelectorAll("[aria-current]");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("aria-current", "step");
    expect(current[0]).toHaveTextContent("[Dean Village]");
    expect(current[0]).toHaveTextContent(messages.ligne.etape.enCours);
    const rows = within(list).getAllByRole("listitem");
    const royal = rows.find((row) => row.textContent?.includes("[Royal Mile]"))!;
    expect(royal).toHaveTextContent(messages.ligne.etape.terminee);
    const cafe = rows.find((row) => row.textContent?.includes("[Café de Stockbridge]"))!;
    expect(cafe).not.toHaveTextContent(messages.ligne.etape.terminee);
    expect(cafe).not.toHaveTextContent(messages.ligne.etape.enCours);
  });

  it("« Voir la journée sur la carte » mène à la Journée 2 ; « Retour » au Séjour", () => {
    renderAt("2026-08-30T10:51:00+01:00");
    expect(screen.getByRole("link", { name: t.carte })).toHaveAttribute("href", "/voyages/mock_trip_edimbourg/jour/2");
    expect(screen.getByRole("link", { name: t.retour })).toHaveAttribute("href", "/voyages/mock_trip_edimbourg");
  });
});

describe("TodayScreen : mise à jour et annonce (C9)", () => {
  it("rien au premier rendu ; une annonce par changement de l'étape en cours, au minuteur et au retour de la page", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-08-30T10:49:30+01:00"));
    render(<TodayScreen trip={TRIP} placesFromGoogle={false} recorder={createMemoryRecorder()} deviceTimeZone="Europe/London" />);
    const announce = () => document.querySelector("[data-part='annonce']");
    expect(announce()).toHaveAttribute("role", "status");
    expect(announce()?.textContent).toBe("");
    expect(region(t.prochaine.titre)).toHaveTextContent("[Dean Village]");
    act(() => vi.advanceTimersByTime(29_000));
    expect(region(t.prochaine.titre)).toHaveTextContent("[Dean Village]");
    expect(announce()?.textContent).toBe("");
    act(() => vi.advanceTimersByTime(61_000));
    expect(region(t.enCeMoment.titre)).toHaveTextContent("[Dean Village]");
    expect(announce()?.textContent).toBe("En ce moment : [Dean Village].");
    vi.setSystemTime(Date.parse("2026-08-30T12:10:00+01:00"));
    act(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(region(t.enCeMoment.titre)).toHaveTextContent("[Café de Stockbridge]");
    expect(announce()?.textContent).toBe("En ce moment : [Café de Stockbridge].");
  });
});

describe("TodayScreen : réseau perdu, écran ouvert (C17)", () => {
  function setOnline(value: boolean) {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  }

  it("bandeau offline, contenu gardé, liens réseau désactivés et décrits par le bandeau ; rétablis au retour du réseau", () => {
    renderAt("2026-08-30T10:40:00+01:00");
    // Région live montée vide avant la perte du réseau, puis remplie : le message est annoncé.
    const live = document.querySelector("[data-part='hors-ligne']");
    expect(live).toHaveAttribute("role", "status");
    expect(live).toBeEmptyDOMElement();
    act(() => setOnline(false));
    const banner = screen.getByText(t.horsLigne).closest("[data-kind='offline']");
    expect(banner).not.toHaveAttribute("role");
    expect(banner?.parentElement).toBe(live);
    expect(region(t.prochaine.titre)).toHaveTextContent("[Dean Village]");
    const links = [
      screen.getByRole("link", { name: "Itinéraire vers [Dean Village] (nouvelle fenêtre)" }),
      screen.getByRole("link", { name: t.carte }),
    ];
    for (const link of links) {
      expect(link).toHaveAttribute("aria-disabled", "true");
      expect(link).toHaveAccessibleDescription(t.horsLigne);
      expect(fireEvent.click(link)).toBe(false);
      // Clic milieu : pas de nouvel onglet.
      expect(fireEvent(link, new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }))).toBe(false);
    }
    act(() => setOnline(true));
    expect(screen.queryByText(t.horsLigne)).toBeNull();
    for (const link of links) {
      expect(link).not.toHaveAttribute("aria-disabled");
      expect(fireEvent(link, new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }))).toBe(true);
    }
    expect(live).toBeEmptyDOMElement();
  });
});

describe("TodayScreen : mention « Données de lieux : Google » (C5)", () => {
  it("rendue une fois avec placesFromGoogle ; absente sinon", () => {
    const { unmount } = renderAt("2026-08-30T10:40:00+01:00", { placesFromGoogle: true });
    expect(screen.getAllByText(messages.carte.attribution)).toHaveLength(1);
    unmount();
    renderAt("2026-08-30T10:40:00+01:00");
    expect(screen.queryByText(messages.carte.attribution)).toBeNull();
  });
});

describe("TodayScreen : accessibilité", () => {
  it.each([
    "2026-08-30T10:40:00+01:00",
    "2026-08-30T16:00:00+01:00",
    "2026-08-30T21:00:00+01:00",
    "2026-08-01T12:00:00+01:00",
    "2026-09-04T12:00:00+01:00",
  ])("aucune violation axe le %s", async (iso) => {
    const { container } = renderAt(iso);
    expect(await axeViolations(container)).toEqual([]);
  });
});
