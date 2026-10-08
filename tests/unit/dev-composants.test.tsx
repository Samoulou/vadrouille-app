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

  it("montre chacun des huit composants dans une section", () => {
    render(<ComposantsShowcase />);
    for (const name of COMPONENTS) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
  });

  it("montre chaque type de Tag et de StatusBanner, et le compteur seulement quand il vaut plus de 0", () => {
    render(<ComposantsShowcase />);
    const ex = messages.dev.composants.exemples;
    const tags = screen.getByRole("region", { name: "Tag" });
    for (const text of Object.values(messages.ligne.tag)) {
      expect(within(tags).getByText(text)).toBeInTheDocument();
    }
    const banners = screen.getByRole("region", { name: "StatusBanner" });
    expect(within(banners).getAllByRole("status")).toHaveLength(4);
    expect(within(banners).getByRole("alert")).toHaveTextContent(ex.bandeaux.error);
    expect(screen.getByRole("img", { name: ex.compteurLabel })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: ex.compteurZeroLabel })).not.toBeInTheDocument();
  });

  it("montre OtpInput vide et rempli, et un SegmentedControl qui répond", () => {
    render(<ComposantsShowcase />);
    const otp = screen.getByRole("region", { name: "OtpInput" });
    const groups = within(otp).getAllByRole("group");
    expect(groups).toHaveLength(2);
    const code = (group: HTMLElement) =>
      within(group)
        .getAllByRole("textbox")
        .map((input) => (input as HTMLInputElement).value)
        .join("");
    expect(code(groups[0]!)).toBe("");
    expect(code(groups[1]!)).toHaveLength(6);

    const options = messages.dev.composants.exemples.segmente.options;
    fireEvent.click(screen.getByRole("radio", { name: options.a }));
    expect(screen.getByRole("radio", { name: options.a })).toHaveAttribute("aria-checked", "true");
  });

  it("n'a aucune violation axe", async () => {
    const { container } = render(<ComposantsShowcase />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
