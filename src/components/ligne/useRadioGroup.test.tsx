import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { radioTabStop, radioTarget, useRadioGroup } from "./useRadioGroup";

/**
 * `useRadioGroup` (décision 0019 § 1.2 et § 1.3) : arrêt de tabulation (coché, aucun, tous désactivés), flèches dans
 * les deux axes, Début et Fin, bouclage, focus sans coche sur une option désactivée.
 */

const LABELS = ["A", "B", "C", "D"];

function Harness({ initial, disabled = [], onSelect }: { initial: number; disabled?: number[]; onSelect?: (index: number) => void }) {
  const [selected, setSelected] = useState(initial);
  const radio = useRadioGroup({
    count: LABELS.length,
    selectedIndex: selected,
    onSelect: (index) => {
      setSelected(index);
      onSelect?.(index);
    },
    isDisabled: (index) => disabled.includes(index),
  });
  return (
    <div role="radiogroup" aria-label="Test">
      {LABELS.map((label, index) => (
        <button
          key={label}
          ref={radio.itemRef(index)}
          type="button"
          role="radio"
          aria-checked={index === selected}
          aria-disabled={disabled.includes(index) || undefined}
          tabIndex={index === radio.tabStop ? 0 : -1}
          onClick={() => radio.onActivate(index)}
          onKeyDown={(event) => radio.onKeyDown(event, index)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const radio = (name: string) => screen.getByRole("radio", { name });
const tabbable = () => screen.getAllByRole("radio").filter((element) => element.tabIndex === 0);

describe("useRadioGroup : fonctions pures", () => {
  it("arrêt de tabulation : coché, sinon premier non désactivé, sinon premier", () => {
    expect(radioTabStop(4, 2)).toBe(2);
    expect(radioTabStop(4, -1)).toBe(0);
    expect(radioTabStop(4, -1, (index) => index < 2)).toBe(2);
    expect(radioTabStop(4, -1, () => true)).toBe(0);
  });

  it("cibles : flèches dans les deux axes avec bouclage, Début, Fin, autre touche ignorée", () => {
    expect(radioTarget("ArrowRight", 0, 4)).toBe(1);
    expect(radioTarget("ArrowDown", 3, 4)).toBe(0);
    expect(radioTarget("ArrowLeft", 0, 4)).toBe(3);
    expect(radioTarget("ArrowUp", 2, 4)).toBe(1);
    expect(radioTarget("Home", 2, 4)).toBe(0);
    expect(radioTarget("End", 0, 4)).toBe(3);
    expect(radioTarget("Tab", 0, 4)).toBeNull();
    expect(radioTarget("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("useRadioGroup", () => {
  it("un seul arrêt de tabulation : l'option cochée ; sans option cochée, la première non désactivée ; toutes désactivées, la première", () => {
    const { unmount } = render(<Harness initial={2} />);
    expect(tabbable()).toEqual([radio("C")]);
    unmount();
    const second = render(<Harness initial={-1} disabled={[0, 1]} />);
    expect(tabbable()).toEqual([radio("C")]);
    second.unmount();
    render(<Harness initial={-1} disabled={[0, 1, 2, 3]} />);
    expect(tabbable()).toEqual([radio("A")]);
  });

  it("flèches dans les deux axes, Début et Fin, bouclage : le focus et la coche suivent", () => {
    render(<Harness initial={0} />);
    radio("A").focus();
    fireEvent.keyDown(radio("A"), { key: "ArrowDown" });
    expect(radio("B")).toHaveFocus();
    expect(radio("B")).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(radio("B"), { key: "End" });
    expect(radio("D")).toHaveFocus();
    fireEvent.keyDown(radio("D"), { key: "ArrowRight" });
    expect(radio("A")).toHaveFocus();
    expect(radio("A")).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(radio("A"), { key: "ArrowUp" });
    expect(radio("D")).toHaveFocus();
    fireEvent.keyDown(radio("D"), { key: "Home" });
    expect(radio("A")).toHaveFocus();
    fireEvent.keyDown(radio("A"), { key: "ArrowLeft" });
    expect(radio("D")).toHaveAttribute("aria-checked", "true");
  });

  it("option désactivée : les flèches y posent le focus sans la cocher ; clic sans effet ; la suivante est cochée", () => {
    const onSelect = vi.fn();
    render(<Harness initial={1} disabled={[2]} onSelect={onSelect} />);
    radio("B").focus();
    fireEvent.keyDown(radio("B"), { key: "ArrowRight" });
    expect(radio("C")).toHaveFocus();
    expect(radio("C")).toHaveAttribute("aria-checked", "false");
    expect(radio("B")).toHaveAttribute("aria-checked", "true");
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(radio("C"));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(radio("C"), { key: "ArrowRight" });
    expect(radio("D")).toHaveFocus();
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("l'option déjà cochée n'est pas recochée", () => {
    const onSelect = vi.fn();
    render(<Harness initial={1} onSelect={onSelect} />);
    fireEvent.click(radio("B"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
