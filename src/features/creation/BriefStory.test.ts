import { describe, expect, it } from "vitest";

import { STORY_LENGTH } from "@/contracts/values";

import { hasIdea, toggleIdea } from "./BriefStory";

/** Idées du récit (décision 0134) : ajout en fin de récit, retrait, plafond de caractères. */
describe("toggleIdea", () => {
  it("ajoute la phrase seule dans un récit vide, après une espace sinon", () => {
    expect(toggleIdea("", "On part à deux.")).toBe("On part à deux.");
    expect(toggleIdea("  ", "On part à deux.")).toBe("On part à deux.");
    expect(toggleIdea("On aime marcher.\n", "On part à deux.")).toBe("On aime marcher. On part à deux.");
  });

  it("retire la phrase déjà présente, sans laisser d'espace double", () => {
    expect(toggleIdea("On aime marcher. On part à deux. Pas de musées.", "On part à deux.")).toBe("On aime marcher. Pas de musées.");
    expect(hasIdea("On aime marcher.", "On part à deux.")).toBe(false);
  });

  it("n'ajoute rien si le récit dépasserait le plafond", () => {
    const plein = "a".repeat(STORY_LENGTH.max - 5);
    expect(toggleIdea(plein, "On part à deux.")).toBe(plein);
  });
});
