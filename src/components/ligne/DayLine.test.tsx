import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DayLineItem, Stop } from "@/contracts";
import fr from "@/i18n/fr.json";
import { messages } from "@/i18n";

import { axeViolations } from "../../../tests/unit/axe";

import { DayLine, segmentLabel } from "./DayLine";

function stop(overrides: Partial<Stop> & Pick<Stop, "id" | "name" | "start">): Stop {
  return { kind: "activity", meta: "[Meta]", exceptions: [], locked: false, ...overrides };
}

const CALTON = stop({
  id: "s1",
  name: "[Calton Hill]",
  start: "09:30",
  meta: "[Balade, 45 min, gratuit]",
  reason: "[La ville entière vue d'en haut]",
});
const DISTILLERIE = stop({ id: "s2", name: "[Distillerie]", start: "15:00", meta: "[Visite]", exceptions: ["toReserve", "toConfirm"] });

const ITEMS: DayLineItem[] = [
  { type: "terminus", role: "start", time: "09:15", label: "[Hôtel]" },
  { type: "segment", segment: { mode: "walk", minutes: 10, estimated: false } },
  { type: "stop", stop: CALTON },
  { type: "segment", segment: { mode: "transit", minutes: 25, estimated: true } },
  { type: "stop", stop: DISTILLERIE },
  { type: "free", from: "17:00", to: "19:00" },
  { type: "segment", segment: { mode: "car", minutes: 15, estimated: false } },
  { type: "terminus", role: "end", time: "22:30", label: "[Hôtel]" },
];

const href = (s: Stop) => `/voyages/v/jour/1?etape=${s.id}`;

function renderLine(items = ITEMS, ideasHref?: string) {
  const getIdeasHref = ideasHref ? () => ideasHref : undefined;
  return render(<DayLine items={items} getStopHref={href} getIdeasHref={getIdeasHref} />);
}

describe("DayLine", () => {
  it("rend un <ol> avec un <li> par élément, dans l'ordre", () => {
    renderLine();
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(ITEMS.length);
    expect(rows.map((row) => row.dataset.type)).toEqual(ITEMS.map((item) => item.type));
  });

  it("rail et marqueurs décoratifs ; le texte contient chaque heure et chaque libellé", () => {
    const { container } = renderLine();
    const rails = container.querySelectorAll("[data-part='rail']");
    expect(rails).toHaveLength(ITEMS.length);
    rails.forEach((rail) => expect(rail).toHaveAttribute("aria-hidden", "true"));
    const text = screen.getByRole("list").textContent ?? "";
    for (const time of ["09:15", "09:30", "15:00", "17:00", "22:30"]) {
      expect(text).toContain(time);
    }
    for (const label of [
      "Départ de [Hôtel]",
      "Retour à [Hôtel]",
      CALTON.name,
      DISTILLERIE.name,
      "À pied, 10 min",
      "Bus, environ 25 min (estimation)",
      "En voiture, 15 min",
      "Temps libre jusqu'à 19:00",
    ]) {
      expect(text).toContain(label);
    }
  });

  it("terminus : heure dans la colonne heure, préfixes lus dans fr.json", () => {
    expect(fr.ligne.terminus).toEqual({ start: "Départ de {label}", end: "Retour à {label}" });
    const { container } = renderLine();
    const [start, end] = Array.from(container.querySelectorAll("li[data-type='terminus']"));
    expect(start?.querySelector("[data-part='heure']")).toHaveTextContent("09:15");
    expect(start).toHaveTextContent("Départ de [Hôtel]");
    expect(end?.querySelector("[data-part='heure']")).toHaveTextContent("22:30");
    expect(end).toHaveTextContent("Retour à [Hôtel]");
  });

  it("arrêt : lien vers la fiche, nom accessible avec le nom, zone d'au moins 44 px", () => {
    renderLine();
    const link = screen.getByRole("link", { name: new RegExp(CALTON.name.replace(/[[\]]/g, "\\$&")) });
    expect(link).toHaveAttribute("href", href(CALTON));
    expect(link).toHaveClass("min-h-(--touch-target)");
  });

  it("arrêt : meta, reason seulement s'il existe, une Tag par exception", () => {
    renderLine();
    const calton = screen.getByRole("link", { name: /Calton/ });
    expect(calton).toHaveTextContent(CALTON.meta);
    expect(calton).toHaveTextContent(CALTON.reason!);
    expect(within(calton).queryByText(messages.ligne.tag.toReserve)).toBeNull();
    expect(calton.querySelectorAll("[data-kind]")).toHaveLength(0);

    const distillerie = screen.getByRole("link", { name: /Distillerie/ });
    expect(distillerie).toHaveTextContent(DISTILLERIE.meta);
    expect(distillerie.querySelectorAll("[data-kind]")).toHaveLength(2);
    expect(within(distillerie).getByText(messages.ligne.tag.toReserve)).toBeInTheDocument();
    expect(within(distillerie).getByText(messages.ligne.tag.toConfirm)).toBeInTheDocument();
  });

  it("aucun « Vérifié » dans fr.json ni dans le rendu", () => {
    const { container } = renderLine(ITEMS, "/idees");
    // Aucun badge « Vérifié » : aucune valeur de fr.json n'est ce mot, et l'espace ligne ne le contient pas.
    const values = (node: unknown): string[] =>
      typeof node === "string" ? [node] : Object.values(node as object).flatMap(values);
    expect(values(fr).filter((value) => /^\s*vérifiée?s?\s*$/i.test(value))).toEqual([]);
    expect(JSON.stringify(fr.ligne)).not.toMatch(/vérifié/i);
    expect(container.textContent).not.toMatch(/vérifié/i);
  });

  it("segment : pointillé à pied, plein en transport et en voiture", () => {
    const { container } = renderLine();
    const textures = Array.from(container.querySelectorAll("li[data-type='segment']")).map((row) => [
      (row as HTMLElement).dataset.mode,
      row.querySelector("[data-rail]")?.getAttribute("data-rail"),
    ]);
    expect(textures).toEqual([
      ["walk", "pointille"],
      ["transit", "plein"],
      ["car", "plein"],
    ]);
  });

  it("segment : « environ » et « (estimation) » si et seulement si estimated", () => {
    for (const mode of ["walk", "transit", "car"] as const) {
      const estimated = segmentLabel({ mode, minutes: 25, estimated: true });
      expect(estimated).toContain("environ");
      expect(estimated).toContain("(estimation)");
      const exact = segmentLabel({ mode, minutes: 25, estimated: false });
      expect(exact).not.toContain("environ");
      expect(exact).not.toContain("(estimation)");
    }
    expect(segmentLabel({ mode: "car", minutes: 15, estimated: false })).toBe("En voiture, 15 min");
    expect(segmentLabel({ mode: "walk", minutes: 20, estimated: false })).toBe("À pied, 20 min");
    expect(segmentLabel({ mode: "transit", minutes: 90, estimated: true })).toBe("Bus, environ 1 h 30 (estimation)");
  });

  it("temps libre : heure from, texte, lien « Idées » seulement avec getIdeasHref", () => {
    const { container, unmount } = renderLine(ITEMS, "/idees");
    const free = container.querySelector("li[data-type='free']") as HTMLElement;
    expect(free.querySelector("[data-part='heure']")).toHaveTextContent("17:00");
    expect(free).toHaveTextContent("Temps libre jusqu'à 19:00");
    expect(free.querySelector("[data-rail]")).toHaveAttribute("data-rail", "libre");
    const ideas = within(free).getByRole("link", { name: messages.ligne.tempsLibre.idees });
    expect(ideas).toHaveAttribute("href", "/idees");
    expect(ideas).toHaveClass("min-h-(--touch-target)", "min-w-(--touch-target)");
    unmount();

    const { container: without } = renderLine();
    expect(within(without).queryByRole("link", { name: messages.ligne.tempsLibre.idees })).toBeNull();
  });

  it("tous les rails hors temps libre sont en line ; celui du temps libre en track-free", () => {
    const { container } = renderLine();
    for (const rail of Array.from(container.querySelectorAll<HTMLElement>("[data-rail]"))) {
      if (rail.dataset.rail === "libre") {
        expect(rail).toHaveClass("bg-track-free", "w-(--ligne-rail-free)");
      } else {
        expect(rail.className).toMatch(/(bg|text)-line/);
        expect(rail).toHaveClass("w-(--ligne-rail)");
      }
    }
  });

  it("n'a aucune violation axe", async () => {
    const { container } = renderLine(ITEMS, "/idees");
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("DayLine, ajouts de F5b (Q17)", () => {
  const LOCKED = stop({ id: "s3", name: "[Concert]", start: "21:30", meta: "[Billets réservés]", locked: true });
  const WITH_ADDITIONS: DayLineItem[] = [
    { type: "terminus", role: "start", time: "09:00", label: "[Hôtel]" },
    { type: "segment", segment: { mode: "walk", minutes: 10, estimated: false } },
    { type: "stop", stop: CALTON },
    { type: "openMeal", time: "12:30", meal: "lunch" },
    { type: "free", from: "15:00", to: "18:30" },
    { type: "free", from: "19:00", to: "20:00" },
    { type: "openMeal", time: "20:00", meal: "dinner" },
    { type: "segment", segment: { mode: "walk", minutes: 15, estimated: false } },
    { type: "stop", stop: LOCKED },
    { type: "terminus", role: "end", time: "23:15", label: "[Hôtel]" },
  ];

  it("étape verrouillée : « Verrouillée » en legende ink-soft sous meta, dans le nom accessible du lien, sans Tag (F5-PO-14)", () => {
    render(<DayLine items={WITH_ADDITIONS} getStopHref={href} />);
    const link = screen.getByRole("link", { name: /\[Concert\]/ });
    expect(link).toHaveAccessibleName(expect.stringContaining("Verrouillée"));
    const mention = within(link).getByText("Verrouillée");
    expect(mention).toHaveClass("text-legende", "text-ink-soft");
    expect(mention.previousElementSibling).toHaveTextContent("[Billets réservés]");
    expect(link.querySelectorAll("[data-kind]")).toHaveLength(0);
    expect(link.closest("li")).toHaveAttribute("data-locked", "true");
    // Étape non verrouillée : pas de mention.
    expect(screen.getByRole("link", { name: /Calton/ })).not.toHaveTextContent("Verrouillée");
  });

  it("openMeal : heure, anneau et rail comme un arrêt, texte « … pas encore choisi » en arret ink-2, sans lien (F5-PO-13)", () => {
    const { container } = render(<DayLine items={WITH_ADDITIONS} getStopHref={href} />);
    const meals = Array.from(container.querySelectorAll<HTMLElement>("li[data-type='openMeal']"));
    expect(meals.map((meal) => meal.dataset.meal)).toEqual(["lunch", "dinner"]);
    const [lunch, dinner] = meals;
    expect(lunch?.querySelector("[data-part='heure']")).toHaveTextContent("12:30");
    expect(lunch).toHaveTextContent("Déjeuner pas encore choisi");
    expect(dinner?.querySelector("[data-part='heure']")).toHaveTextContent("20:00");
    expect(dinner).toHaveTextContent("Dîner pas encore choisi");
    expect(within(dinner!).getByText("Dîner pas encore choisi")).toHaveClass("text-arret", "text-ink-2");
    expect(dinner?.querySelector("[data-rail]")).toHaveAttribute("data-rail", "plein");
    // Même rail et même anneau qu'un arrêt.
    const stopRail = container.querySelector("li[data-type='stop'] [data-part='rail']")!;
    expect(dinner?.querySelector("[data-part='rail']")?.innerHTML).toBe(stopRail.innerHTML);
    for (const meal of meals) {
      expect(within(meal).queryByRole("link")).toBeNull();
      expect(meal.querySelectorAll("[data-kind='toReserve'], [data-kind='toConfirm'], [data-kind='unconfirmed']")).toHaveLength(0);
    }
    // Seuls les deux arrêts sont des liens de fiche.
    expect(container.querySelectorAll("a[data-part='arret']")).toHaveLength(2);
  });

  it("lien « Idées » par plage : getIdeasHref reçoit from et to de chaque temps libre (F5-TL-8)", () => {
    const calls: { from: string; to: string }[] = [];
    const { container } = render(
      <DayLine
        items={WITH_ADDITIONS}
        getStopHref={href}
        getIdeasHref={(free) => {
          calls.push(free);
          return `/voyages/v/jour/2/ajouter?de=${free.from}&a=${free.to}`;
        }}
      />,
    );
    expect(calls).toEqual([
      { from: "15:00", to: "18:30" },
      { from: "19:00", to: "20:00" },
    ]);
    const ideas = Array.from(container.querySelectorAll("a[data-part='idees']")).map((a) => a.getAttribute("href"));
    expect(ideas).toEqual(["/voyages/v/jour/2/ajouter?de=15:00&a=18:30", "/voyages/v/jour/2/ajouter?de=19:00&a=20:00"]);
  });

  it("n'a aucune violation axe avec les ajouts", async () => {
    const { container } = render(<DayLine items={WITH_ADDITIONS} getStopHref={href} getIdeasHref={() => "/idees"} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
