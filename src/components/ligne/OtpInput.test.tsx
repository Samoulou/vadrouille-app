import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { OtpInput } from "./OtpInput";

function positions() {
  return screen.getAllByRole("textbox") as HTMLInputElement[];
}

function values() {
  return positions()
    .map((input) => input.value)
    .join("");
}

function paste(input: HTMLElement, text: string) {
  fireEvent.paste(input, { clipboardData: { getData: () => text } });
}

describe("OtpInput", () => {
  it("rend 6 positions numériques avec autocomplete one-time-code", () => {
    render(<OtpInput />);
    expect(positions()).toHaveLength(6);
    for (const input of positions()) {
      expect(input).toHaveAttribute("autocomplete", "one-time-code");
      expect(input).toHaveAttribute("inputmode", "numeric");
      expect(input).toHaveClass("border-border-control");
    }
  });

  it("donne un nom accessible à chaque position et au groupe", () => {
    render(<OtpInput />);
    expect(screen.getByRole("group", { name: "Code à 6 chiffres" })).toBeInTheDocument();
    for (let position = 1; position <= 6; position += 1) {
      expect(screen.getByRole("textbox", { name: `Chiffre ${position} sur 6` })).toBeInTheDocument();
    }
  });

  it("coller « 123456 » remplit le code et appelle onComplete une seule fois", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    paste(positions()[0]!, "123456");
    expect(values()).toBe("123456");
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("123456");
    // Un nouveau collage du même code complet ne rappelle pas onComplete.
    paste(positions()[0]!, "123456");
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("garde les chiffres d'un collage qui contient des espaces", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    paste(positions()[0]!, "123 456");
    expect(onComplete).toHaveBeenCalledWith("123456");
  });

  it("avance à la saisie et ignore un caractère non numérique", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    const [first, second] = positions();
    fireEvent.change(first!, { target: { value: "a" } });
    expect(first!.value).toBe("");
    expect(first).not.toHaveFocus();

    fireEvent.change(first!, { target: { value: "7" } });
    expect(first!.value).toBe("7");
    expect(second).toHaveFocus();

    fireEvent.change(second!, { target: { value: "-" } });
    expect(values()).toBe("7");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("remplace le chiffre présent quand on retape dans une case pleine", () => {
    render(<OtpInput defaultValue="123456" />);
    fireEvent.change(positions()[2]!, { target: { value: "39" } });
    expect(values()).toBe("129456");
  });

  it("appelle onComplete à la saisie du dernier chiffre", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    "98765".split("").forEach((digit, index) => {
      fireEvent.change(positions()[index]!, { target: { value: digit } });
    });
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.change(positions()[5]!, { target: { value: "4" } });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("987654");
  });

  it("effacer revient au chiffre précédent", () => {
    render(<OtpInput />);
    paste(positions()[0]!, "123");
    const fourth = positions()[3]!;
    expect(fourth).toHaveFocus();

    fireEvent.keyDown(fourth, { key: "Backspace" });
    expect(values()).toBe("12");
    expect(positions()[2]).toHaveFocus();

    fireEvent.keyDown(positions()[2]!, { key: "Backspace" });
    expect(values()).toBe("1");
    expect(positions()[1]).toHaveFocus();
  });

  it("efface le chiffre de la case courante quand elle est remplie", () => {
    render(<OtpInput defaultValue="123456" />);
    const last = positions()[5]!;
    last.focus();
    fireEvent.keyDown(last, { key: "Backspace" });
    expect(values()).toBe("12345");
    expect(last).toHaveFocus();
  });

  it("rappelle onComplete après une correction qui complète à nouveau le code", () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    paste(positions()[0]!, "123456");
    fireEvent.keyDown(positions()[5]!, { key: "Backspace" });
    fireEvent.change(positions()[5]!, { target: { value: "0" } });
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenLastCalledWith("123450");
  });

  it("n'a aucune violation axe, vide ou rempli", async () => {
    const { container } = render(
      <>
        <OtpInput />
        <OtpInput defaultValue="482913" />
      </>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
