import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DevComposantsPage from "@/app/dev/composants/page";
import { ComposantsShowcase } from "@/dev/ComposantsShowcase";
import { messages } from "@/i18n";

import { axeViolations } from "./axe";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const COMPONENTS = [
  "Button",
  "IconButton",
  "Tag",
  "Counter",
  "Chip",
  "SegmentedControl",
  "OtpInput",
  "StatusBanner",
  "Ligne",
];

describe("/dev/composants", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("répond 404 en production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEV_PAGES", "");
    expect(() => DevComposantsPage()).toThrow("NEXT_NOT_FOUND");
  });

  it("s'affiche en développement", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(DevComposantsPage());
    expect(screen.getByRole("heading", { level: 1, name: messages.dev.composants.titre })).toBeInTheDocument();
  });

  it("montre chacun des huit composants de F2 et la section Ligne de F3", () => {
    render(<ComposantsShowcase />);
    for (const name of COMPONENTS) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
  });

  it("montre la section Présentation de F6 : DeckCard (activité avec trajet, repas, dernière option), DeckProgress, UndoToast", () => {
    render(<ComposantsShowcase />);
    const section = screen.getByRole("region", { name: "Présentation" });
    const p = messages.dev.composants.exemples.presentation;
    const bar = within(section).getByRole("progressbar", { name: "Proposition 4 sur 8" });
    expect(bar.nextElementSibling).toHaveTextContent(/^4 sur 8$/);
    expect(bar.nextElementSibling).toHaveAttribute("aria-hidden", "true");
    expect(within(section).getByRole("button", { name: `Voir le détail de ${p.activite.nom}` })).toHaveTextContent(
      "Bus, environ 50 min (estimation)",
    );
    expect(within(section).getByRole("button", { name: `Voir le détail de ${p.repas.nom}` })).toHaveTextContent("option 1 sur 2");
    expect(within(section).getByRole("button", { name: `Voir le détail de ${p.repas2.nom}` })).toHaveTextContent("option 2 sur 2");
    expect(within(section).getAllByRole("button", { name: "Option suivante" })).toHaveLength(1);
    expect(within(section).getAllByRole("button", { name: "Je choisis" })).toHaveLength(2);
    expect(within(section).getByRole("status")).toHaveTextContent(p.toast);
  });

  it("montre la section Programme de F5a : Sheet à 25, 55 et 92 %, ReasonBlock avec et sans date, bandeau travel", () => {
    render(<ComposantsShowcase />);
    const section = screen.getByRole("region", { name: "Programme" });
    const pg = messages.dev.composants.exemples.programme;
    expect(within(section).getByRole("region", { name: pg.panneaux.petit })).toHaveAttribute("data-snap", "0.25");
    expect(within(section).getByRole("region", { name: pg.panneaux.moyen })).toHaveAttribute("data-snap", "0.55");
    expect(within(section).getByRole("region", { name: pg.panneaux.grand })).toHaveAttribute("data-snap", "0.92");
    expect(within(section).getAllByText("Pourquoi pour toi")).toHaveLength(2);
    expect(within(section).getAllByText(/^Source consultée le/)).toHaveLength(1);
    expect(within(section).getByRole("status")).toHaveAttribute("data-kind", "travel");
  });

  it("montre les ajouts de F5b à DayLine : étape verrouillée, déjeuner et dîner pas encore choisis, lien « Idées » par plage", () => {
    render(<ComposantsShowcase />);
    const section = screen.getByRole("region", { name: "Programme" });
    const pg = messages.dev.composants.exemples.programme;
    expect(within(section).getByRole("link", { name: new RegExp(`${pg.verrouillee.nom.replace(/[[\]]/g, "\\$&")}.*Verrouillée`) })).toBeInTheDocument();
    expect(within(section).getByText("Déjeuner pas encore choisi")).toBeInTheDocument();
    expect(within(section).getByText("Dîner pas encore choisi")).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Idées" })).toHaveAttribute("href", "#idees-14:00-18:30");
  });

  it("montre la section Programme de F5c : DestinationPlate dans les 4 couleurs, ChecklistRow à faire, faite, sans lien, rémunérée", () => {
    const { container } = render(<ComposantsShowcase />);
    const section = screen.getByRole("region", { name: "Programme" });
    const pg = messages.dev.composants.exemples.programme;
    expect(
      Array.from(container.querySelectorAll("[data-destination-plate]")).map((plate) => plate.getAttribute("data-destination-plate")),
    ).toEqual(["bruyere", "azulejo", "ocre", "granit"]);
    for (const name of Object.values(pg.plaque.noms)) expect(within(section).getByText(name)).toBeInTheDocument();
    const cl = pg.checklist;
    expect(within(section).getByRole("button", { name: cl.aFaire.label })).toHaveAttribute("aria-pressed", "false");
    const faite = within(section).getByRole("button", { name: cl.faite.label });
    expect(faite).toHaveAttribute("aria-pressed", "true");
    expect(within(faite.closest("li")!).queryByRole("link")).toBeNull();
    expect(within(within(section).getByRole("button", { name: cl.sansLien.label }).closest("li")!).queryByRole("link")).toBeNull();
    const remuneree = within(section).getByRole("button", { name: cl.remuneree.label }).closest("li")!;
    expect(within(remuneree).getByText("Lien rémunéré")).toBeInTheDocument();
    // Cliquable : la case bascule.
    fireEvent.click(within(section).getByRole("button", { name: cl.aFaire.label }));
    expect(within(section).getByRole("button", { name: cl.aFaire.label })).toHaveAttribute("aria-pressed", "true");
  });

  it("montre le bouton bascule relâché, enfoncé et enfoncé avec focus, sans icône", () => {
    render(<ComposantsShowcase />);
    const section = screen.getByRole("region", { name: "Button" });
    expect(within(section).getAllByRole("button", { name: "Verrouiller", pressed: false })).toHaveLength(1);
    const pressed = within(section).getAllByRole("button", { name: "Verrouiller", pressed: true });
    expect(pressed).toHaveLength(2);
    for (const button of pressed) expect(button.querySelector("svg")).toBeNull();
  });

  it("montre une Chip indisponible (aria-disabled) qui ne bascule pas au clic", () => {
    render(<ComposantsShowcase />);
    const chips = screen.getByRole("region", { name: "Chip" });
    const indisponibles = within(chips)
      .getAllByRole("button", { name: messages.dev.composants.exemples.chips.musees })
      .filter((chip) => chip.getAttribute("aria-disabled") === "true");
    expect(indisponibles).toHaveLength(1);
    const chip = indisponibles[0]!;
    expect(chip).not.toBeDisabled();
    expect(chip).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("montre chaque type de Tag et de StatusBanner, et le compteur seulement quand il vaut plus de 0", () => {
    render(<ComposantsShowcase />);
    const ex = messages.dev.composants.exemples;
    const tags = screen.getByRole("region", { name: "Tag" });
    for (const text of Object.values(messages.ligne.tag)) {
      expect(within(tags).getByText(text)).toBeInTheDocument();
    }
    const banners = screen.getByRole("region", { name: "StatusBanner" });
    // role=alert pour error et conflict, role=status pour les quatre autres (0012, Q13).
    expect(within(banners).getAllByRole("status")).toHaveLength(4);
    const alerts = within(banners).getAllByRole("alert");
    expect(alerts.map((alert) => alert.getAttribute("data-kind"))).toEqual(["conflict", "error"]);
    expect(alerts[1]).toHaveTextContent(ex.bandeaux.error);
    expect(screen.getByRole("img", { name: ex.compteurLabel })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: ex.compteurZeroLabel })).not.toBeInTheDocument();
  });

  it("montre OtpInput vide, rempli et invalide, et un SegmentedControl qui répond", () => {
    render(<ComposantsShowcase />);
    const otp = screen.getByRole("region", { name: "OtpInput" });
    const groups = within(otp).getAllByRole("group");
    expect(groups).toHaveLength(3);
    // Invalide : aria-invalid sur chaque case, message relié au groupe (0012, Q13).
    expect(groups[2]).toHaveAccessibleDescription(messages.dev.composants.exemples.codeInvalide);
    for (const input of within(groups[2]!).getAllByRole("textbox")) expect(input).toHaveAttribute("aria-invalid", "true");
    for (const input of within(groups[0]!).getAllByRole("textbox")) expect(input).not.toHaveAttribute("aria-invalid");
    const code = (group: HTMLElement) =>
      within(group)
        .getAllByRole("textbox")
        .map((input) => (input as HTMLInputElement).value)
        .join("");
    expect(code(groups[0]!)).toBe("");
    expect(code(groups[1]!)).toHaveLength(6);

    const options = messages.dev.composants.exemples.segmente.options;
    // Premier groupe : le SegmentedControl de F2 ; les deux suivants montrent la marque « déduit » (F8-TL-4).
    const [segmented, inferred, empty] = within(screen.getByRole("region", { name: "SegmentedControl" })).getAllByRole("radiogroup");
    fireEvent.click(within(segmented!).getByRole("radio", { name: options.a }));
    expect(within(segmented!).getByRole("radio", { name: options.a })).toHaveAttribute("aria-checked", "true");

    expect(inferred).toHaveAccessibleDescription(messages.ligne.deduit);
    expect(within(inferred!).getByRole("radio", { name: options.b })).toHaveAttribute("data-inferred", "true");
    fireEvent.click(within(inferred!).getByRole("radio", { name: options.c }));
    expect(inferred).not.toHaveAccessibleDescription();
    expect(within(empty!).getAllByRole("radio").filter((radio) => radio.getAttribute("aria-checked") === "true")).toEqual([]);
  });

  it("section Ligne : pastilles, deux rangées de jours, ligne du jour, segment en voiture, marqueurs", () => {
    render(<ComposantsShowcase />);
    const ligne = screen.getByRole("region", { name: "Ligne" });
    const navs = within(ligne).getAllByRole("navigation", { name: /^Jours du séjour/ });
    expect(navs).toHaveLength(2);
    expect(within(navs[0]!).getByRole("link", { name: messages.ligne.jours.sejour })).toHaveAttribute("aria-current", "page");
    expect(within(navs[1]!).getByRole("link", { name: /^Jour 9/ })).toHaveAttribute("aria-current", "page");
    const lists = ligne.querySelectorAll("ol");
    expect(lists).toHaveLength(2);
    expect(Array.from(lists[0]!.children).map((li) => (li as HTMLElement).dataset.type)).toEqual([
      "terminus",
      "segment",
      "stop",
      "segment",
      "stop",
      "free",
      "segment",
      "terminus",
    ]);
    expect(lists[1]).toHaveTextContent("En voiture, 15 min");
    const markers = Array.from(ligne.querySelectorAll("[data-variant]"));
    expect(markers.filter((marker) => !marker.closest("ol"))).toHaveLength(6);
  });

  it("montre la section Pendant le voyage de F10a : ActionBanner, DayLine compacte et réduite (C19)", () => {
    render(<ComposantsShowcase />);
    const ex = messages.dev.composants.exemples.pendant;
    const section = screen.getByRole("region", { name: ex.titre });
    const banner = within(section).getByRole("region", { name: ex.bandeauTitre });
    expect(banner).toHaveClass("bg-quai", "text-ink");
    expect(banner).toHaveTextContent(ex.bandeauTexte);
    const lines = within(section).getAllByRole("list").filter((list) => list.tagName === "OL");
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(within(line).queryAllByRole("link")).toHaveLength(0);
    expect(section.querySelectorAll("[aria-current='step']")).toHaveLength(1);
    expect(within(section).getAllByText(messages.ligne.etape.terminee).length).toBeGreaterThan(0);
    expect(within(section).getByText(messages.ligne.terminusSansLibelle.start)).toBeInTheDocument();
    expect(within(section).getByText(messages.ligne.terminusSansLibelle.end)).toBeInTheDocument();
  });

  it("n'a aucune violation axe", async () => {
    const { container } = render(<ComposantsShowcase />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
