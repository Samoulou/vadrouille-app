import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { StopMarker, type StopMarkerProps } from "./StopMarker";

const VARIANTS: StopMarkerProps[] = [
  { kind: "stop", variant: "ligne" },
  { kind: "terminus", variant: "ligne" },
  { kind: "stop", number: 2 },
  { kind: "stop", number: 2, selected: true },
  { kind: "terminus", number: 1 },
  { kind: "overview", number: 3 },
];

function root(props: StopMarkerProps) {
  const { container, unmount } = render(<StopMarker {...props} />);
  return { el: container.firstElementChild as HTMLElement, unmount };
}

describe("StopMarker", () => {
  it.each(VARIANTS.map((props) => [JSON.stringify(props), props] as const))(
    "%s : racine aria-hidden, non focusable, sans nom",
    (_, props) => {
      const { el, unmount } = root(props);
      expect(el).toHaveAttribute("aria-hidden", "true");
      expect(el.tabIndex).toBe(-1);
      expect(el.querySelector("a, button, [tabindex]")).toBeNull();
      expect(el).not.toHaveAttribute("aria-label");
      unmount();
    },
  );

  it("n'affiche jamais de numéro sur un terminus, même fourni", () => {
    for (const variant of ["ligne", "carte"] as const) {
      const { el, unmount } = root({ kind: "terminus", number: 1, variant });
      expect(el.textContent).toBe("");
      unmount();
    }
  });

  it("terminus de carte : 24 px avec la maison ; terminus de ligne : carré 20 px", () => {
    const carte = root({ kind: "terminus" });
    expect(carte.el).toHaveClass("size-(--ligne-terminus-carte)", "bg-ink");
    expect(carte.el.querySelector("svg")).not.toBeNull();
    carte.unmount();
    const ligne = root({ kind: "terminus", variant: "ligne" });
    expect(ligne.el).toHaveClass("size-(--ligne-terminus)", "rounded-(--ligne-rayon-terminus)", "bg-ink");
    expect(ligne.el.querySelector("svg")).toBeNull();
    ligne.unmount();
  });

  it("arrêt de carte numéroté, puis sélectionné : 38 px plein line", () => {
    const normal = root({ kind: "stop", number: 2 });
    expect(normal.el).toHaveTextContent("2");
    expect(normal.el).toHaveClass("size-(--ligne-stop-map)", "bg-raised", "border-line");
    normal.unmount();
    const selected = root({ kind: "stop", number: 2, selected: true });
    expect(selected.el).toHaveTextContent("2");
    expect(selected.el).toHaveClass("size-(--ligne-stop-map-selected)", "bg-line", "text-on-line", "border-page");
    selected.unmount();
  });

  it("arrêt de ligne : anneau 20 px sans numéro ; vue d'ensemble : 12 px sans numéro", () => {
    const ligne = root({ kind: "stop", number: 4, variant: "ligne" });
    expect(ligne.el).toHaveClass("size-(--ligne-stop)", "border-(length:--ligne-stop-ring)", "border-line", "bg-raised");
    expect(ligne.el.textContent).toBe("");
    ligne.unmount();
    const overview = root({ kind: "overview", number: 3 });
    expect(overview.el).toHaveClass("size-(--ligne-stop-ensemble)");
    expect(overview.el.textContent).toBe("");
    overview.unmount();
  });

  it("n'a aucune violation axe", async () => {
    const { container } = render(
      <div>
        {VARIANTS.map((props, i) => (
          <StopMarker key={i} {...props} />
        ))}
      </div>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
