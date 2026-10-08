import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TokensShowcase } from "@/dev/TokensShowcase";
import { messages } from "@/i18n";
import { COLOR_TOKENS, RADIUS_TOKENS, TEXT_STYLES } from "@/styles/tokens";

describe("TokensShowcase", () => {
  it("affiche toutes les couleurs, tous les styles de texte et tous les rayons", () => {
    render(<TokensShowcase />);
    const t = messages.dev.tokens;

    const colors = screen.getByRole("region", { name: t.couleurs });
    for (const name of COLOR_TOKENS) {
      expect(within(colors).getByText(name, { exact: true })).toBeInTheDocument();
    }

    const texts = screen.getByRole("region", { name: t.textes });
    for (const { name } of TEXT_STYLES) {
      expect(within(texts).getByText(name, { exact: true })).toBeInTheDocument();
    }

    const radii = screen.getByRole("region", { name: t.rayons });
    for (const name of RADIUS_TOKENS) {
      expect(within(radii).getByText(name, { exact: true })).toBeInTheDocument();
    }
  });
});
