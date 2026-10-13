import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { MarkerButton } from "./MarkerButton";

/** Marqueur d'étape : bouton (F4-PO-10) ou image nommée non interactive (vue partagée, F10-TL-14). */

const stop = { stopId: "2", number: 2, name: "[Dean Village]", position: { lat: 55.95, lng: -3.21 } };

describe("MarkerButton", () => {
  it("interactif par défaut : bouton nommé, toucher = onPress", () => {
    const onPress = vi.fn();
    render(<MarkerButton stop={stop} selected={false} onPress={onPress} />);
    fireEvent.click(screen.getByRole("button", { name: "Étape 2 : [Dean Village]" }));
    expect(onPress).toHaveBeenCalledWith("2");
  });

  it("non interactif : image nommée, ni bouton ni cible du focus, au moins une cible tactile de surface", async () => {
    const onPress = vi.fn();
    const { container } = render(<MarkerButton stop={stop} selected={false} onPress={onPress} interactive={false} />);
    expect(screen.queryByRole("button")).toBeNull();
    const marker = screen.getByRole("img", { name: "Étape 2 : [Dean Village]" });
    expect(marker).not.toHaveAttribute("tabindex");
    expect(marker).toHaveAttribute("data-stop-id", "2");
    fireEvent.click(marker);
    expect(onPress).not.toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);
  });
});
