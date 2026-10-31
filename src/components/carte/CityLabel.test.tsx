import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { CityLabel, CityMark, DECALAGES_JOURNEE, DECALAGES_SEJOUR, nomRepere, nomTerminus, texteEtiquette } from "./CityLabel";

describe("M4-suite-carte: étiquette de ville", () => {
  it("tokens de Ligne : fond raised, contour outline, coins tag, corps-s 700, ink, chiffres tabulaires ; masquée et sans geste", () => {
    render(<CityLabel placeKey="ville-1" text={texteEtiquette({ city: "Rome", numbers: [1] })} decalagesMax={DECALAGES_SEJOUR} />);
    const etiquette = document.querySelector("[data-part='etiquette-ville']")!;
    expect(etiquette).toHaveClass(
      "bg-raised",
      "border",
      "border-outline",
      "rounded-tag",
      "text-corps-s",
      "font-bold",
      "text-ink",
      "tabular-nums",
      "pointer-events-none",
      "max-w-(--ligne-etiquette-ville-max)",
      "wrap-anywhere",
      "px-2",
      "py-1",
    );
    expect(etiquette).toHaveAttribute("aria-hidden", "true");
    expect(etiquette).toHaveAttribute("data-cote", "droite");
    expect(etiquette.textContent).toBe("1 · Rome");
    expect(etiquette).not.toHaveClass("truncate");
  });

  it("à gauche et décalée selon sa place, largeur réduite quand aucun côté ne tient", () => {
    render(<CityLabel placeKey="ville-2" text="Florence" place={{ cote: "gauche", dy: 34, largeurMax: 120 }} decalagesMax={DECALAGES_JOURNEE} />);
    const etiquette = document.querySelector<HTMLElement>("[data-part='etiquette-ville']")!;
    expect(etiquette).toHaveClass("right-full");
    expect(etiquette.style.marginTop).toBe("34px");
    expect(etiquette.style.maxWidth).toBe("120px");
    expect(etiquette.dataset.decalages).toBe("1");
  });

  it("textes du § 6 : repère « Rome, ville 1 », « Rome, villes 1 et 3 », étiquette « 1 et 3 · Rome », terminus de la Journée", () => {
    expect(nomRepere({ city: "Rome", numbers: [1] })).toBe("Rome, ville 1");
    expect(nomRepere({ city: "Rome", numbers: [1, 3] })).toBe("Rome, villes 1 et 3");
    expect(texteEtiquette({ city: "Rome", numbers: [1, 3] })).toBe("1 et 3 · Rome");
    const villes = { de: "Rome", vers: "Florence" };
    expect(nomTerminus({ roles: ["start"], position: { lat: 0, lng: 0 } }, villes)).toEqual({ name: "Logement quitté, Rome", city: "Rome" });
    expect(nomTerminus({ roles: ["end"], position: { lat: 0, lng: 0 } }, villes)).toEqual({ name: "Nouveau logement, Florence", city: "Florence" });
    expect(nomTerminus({ roles: ["start", "end"], position: { lat: 0, lng: 0 } }, villes)).toBeUndefined();
  });

  it("M4-suite-carte: conformité : noms sentinelles, seuls ces noms, un numéro et les textes du § 6", () => {
    expect(texteEtiquette({ city: "[Ville A]", numbers: [1] })).toBe("1 · [Ville A]");
    expect(nomRepere({ city: "[Ville B]", numbers: [2] })).toBe("[Ville B], ville 2");
  });

  it("repère nommé : image non interactive avec terminus et étiquette ; sans nom : terminus masqué, sans étiquette", async () => {
    const { container, rerender } = render(
      <CityMark name="Rome, ville 1" label={{ placeKey: "ville-1", text: "1 · Rome", decalagesMax: DECALAGES_SEJOUR }} />,
    );
    const repere = screen.getByRole("img", { name: "Rome, ville 1" });
    expect(repere.querySelector("[data-kind='terminus']")?.textContent).toBe("");
    expect(repere.querySelector("[data-part='etiquette-ville']")).not.toBeNull();
    expect(await axeViolations(container)).toEqual([]);
    rerender(<CityMark />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("[data-part='terminus']")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("[data-part='etiquette-ville']")).toBeNull();
  });
});
