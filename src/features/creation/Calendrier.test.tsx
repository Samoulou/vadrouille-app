import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { Calendrier } from "./Calendrier";
import { TextField } from "./fields";

const jour = (nom: string) => screen.getByRole("button", { name: nom });

describe("Calendrier de Ligne (décision 0176)", () => {
  it("affiche le mois de la date choisie, du lundi au dimanche, le 1er sous son jour", async () => {
    const { container } = render(<Calendrier value="2026-08-29" onSelect={vi.fn()} />);
    expect(container.querySelector("[data-part=mois]")?.textContent).toBe("août 2026");
    const colonnes = screen.getAllByRole("columnheader");
    expect(colonnes.map((colonne) => colonne.getAttribute("abbr"))).toEqual([
      "lundi",
      "mardi",
      "mercredi",
      "jeudi",
      "vendredi",
      "samedi",
      "dimanche",
    ]);
    // Le 1er août 2026 est un samedi : cinq cases vides avant lui.
    const premiere = screen.getAllByRole("row")[1]!;
    expect(Array.from(premiere.children).map((cellule) => cellule.textContent)).toEqual(["", "", "", "", "", "1", "2"]);
    expect(container.querySelectorAll("button[data-date]")).toHaveLength(31);
    expect(jour("29 août 2026")).toHaveAttribute("aria-pressed", "true");
    expect(jour("28 août 2026")).toHaveAttribute("aria-pressed", "false");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("sans date choisie : s'ouvre sur le mois de la première date proposée", () => {
    const { container } = render(<Calendrier value="" min="2027-02-10" onSelect={vi.fn()} />);
    expect(container.querySelector("[data-part=mois]")?.textContent).toBe("février 2027");
  });

  it("jours hors bornes désactivés ; mois précédent et suivant fermés aux bornes", () => {
    render(<Calendrier value="" min="2026-08-10" max="2026-08-20" onSelect={vi.fn()} />);
    expect(jour("9 août 2026")).toBeDisabled();
    expect(jour("10 août 2026")).toBeEnabled();
    expect(jour("20 août 2026")).toBeEnabled();
    expect(jour("21 août 2026")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mois précédent" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mois suivant" })).toBeDisabled();
  });

  it("change de mois et d'année ; choisir un jour rend sa date ISO", () => {
    const onSelect = vi.fn();
    const { container } = render(<Calendrier value="2026-12-30" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Mois suivant" }));
    expect(container.querySelector("[data-part=mois]")?.textContent).toBe("janvier 2027");
    fireEvent.click(jour("1er janvier 2027"));
    expect(onSelect).toHaveBeenCalledWith("2027-01-01");
    fireEvent.click(screen.getByRole("button", { name: "Mois précédent" }));
    fireEvent.click(screen.getByRole("button", { name: "Mois précédent" }));
    expect(container.querySelector("[data-part=mois]")?.textContent).toBe("novembre 2026");
  });

  it("février d'une année bissextile : 29 jours", () => {
    const { container } = render(<Calendrier value="2028-02-10" onSelect={vi.fn()} />);
    expect(container.querySelectorAll("button[data-date]")).toHaveLength(29);
  });

  it("clavier : flèches d'un jour ou d'une semaine, en sautant les jours désactivés ; Page suivante change de mois", () => {
    const { container } = render(<Calendrier value="2026-08-12" min="2026-08-11" onSelect={vi.fn()} />);
    jour("12 août 2026").focus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(jour("13 août 2026"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(jour("20 août 2026"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(jour("11 août 2026"));
    // Le 10 est hors bornes, et aucun jour libre avant lui : le focus ne bouge pas.
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(jour("11 août 2026"));
    fireEvent.keyDown(document.activeElement!, { key: "PageDown" });
    expect(container.querySelector("[data-part=mois]")?.textContent).toBe("septembre 2026");
  });

  it("séjour teinté, aujourd'hui marqué", () => {
    render(<Calendrier value="2026-08-30" sejour={{ debut: "2026-08-29", fin: "2026-09-03" }} aujourdhui="2026-08-05" onSelect={vi.fn()} />);
    expect(jour("29 août 2026").closest("td")?.className).toContain("bg-muted");
    expect(jour("28 août 2026").closest("td")?.className).not.toContain("bg-muted");
    expect(jour("5 août 2026")).toHaveAttribute("aria-current", "date");
    expect(jour("6 août 2026")).not.toHaveAttribute("aria-current");
  });
});

function Champ() {
  const [value, setValue] = useState("2026-08-29");
  return <TextField field="start" type="date" label="Arrivée" value={value} min="2026-08-01" onChange={setValue} />;
}

describe("champ de date : calendrier de Ligne (décision 0176)", () => {
  it("le champ garde sa saisie au clavier et ses bornes ; le bouton ouvre le calendrier, un jour choisi remplit le champ et referme", async () => {
    render(<Champ />);
    const champ = screen.getByLabelText("Arrivée", { exact: true });
    expect(champ).toHaveAttribute("type", "date");
    expect(champ).toHaveAttribute("min", "2026-08-01");
    fireEvent.change(champ, { target: { value: "2026-08-30" } });
    expect(champ).toHaveValue("2026-08-30");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Arrivée : choisir dans le calendrier" }));
    const feuille = await screen.findByRole("dialog", { name: "Arrivée" });
    expect(within(feuille).getByRole("button", { name: "30 août 2026" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(feuille).getByRole("button", { name: "31 août 2026" }));
    expect(champ).toHaveValue("2026-08-31");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("au doigt : l'appui sur le champ ouvre le calendrier de Ligne, pas celui du téléphone", async () => {
    render(<Champ />);
    const champ = screen.getByLabelText("Arrivée", { exact: true });
    const appui = fireEvent.touchEnd(champ);
    // `preventDefault` : ni focus ni clic n'atteignent le champ.
    expect(appui).toBe(false);
    expect(await screen.findByRole("dialog", { name: "Arrivée" })).toBeInTheDocument();
  });

  it("un champ d'heure ou de texte n'a pas de calendrier", () => {
    render(<TextField field="heure" type="time" label="Début" value="" onChange={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
