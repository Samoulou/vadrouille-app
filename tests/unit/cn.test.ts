// @vitest-environment node
import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn et les tokens Ligne", () => {
  it("garde la taille de texte et la couleur ensemble", () => {
    expect(cn("text-corps text-ink")).toBe("text-corps text-ink");
    expect(cn("text-etiquette font-bold", "text-ink-soft")).toBe("text-etiquette font-bold text-ink-soft");
  });

  it("remplace une couleur par une autre, une taille par une autre", () => {
    expect(cn("text-ink", "text-ink-soft")).toBe("text-ink-soft");
    expect(cn("bg-line", "bg-muted")).toBe("bg-muted");
    expect(cn("text-corps", "text-legende")).toBe("text-legende");
    expect(cn("rounded-control", "rounded-tag")).toBe("rounded-tag");
  });
});
