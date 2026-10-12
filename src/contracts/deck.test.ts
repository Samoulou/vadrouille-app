// @vitest-environment node
import { describe, expect, it } from "vitest";

import { CategorySchema, PreferenceAnswerSchema, PreferencePromptSchema, PreferenceReasonSchema } from "./index";

describe("contrats de la présentation (décision 0013, § 3.1 et § 3.2)", () => {
  it("CategorySchema : codes provisoires de F6-PO-10", () => {
    expect(CategorySchema.options).toEqual(["museum", "walk", "nature", "tasting", "restaurant"]);
  });

  it("PreferenceReasonSchema : codes de B0, dans l'ordre", () => {
    expect(PreferenceReasonSchema.options).toEqual(["notMyStyle", "tooBusy", "tooExpensive", "tooFar", "other"]);
  });

  it("PreferencePrompt : catégorie ou distance, objets stricts", () => {
    expect(PreferencePromptSchema.safeParse({ kind: "category", category: "museum" }).success).toBe(true);
    expect(PreferencePromptSchema.safeParse({ kind: "distance" }).success).toBe(true);
    expect(PreferencePromptSchema.safeParse({ kind: "category", category: "musées" }).success).toBe(false);
    expect(PreferencePromptSchema.safeParse({ kind: "distance", name: "[Lieu]" }).success).toBe(false);
  });

  it("PreferenceAnswer : oui ou non, raison facultative du vocabulaire fermé", () => {
    expect(PreferenceAnswerSchema.safeParse({ answer: "yes" }).success).toBe(true);
    expect(PreferenceAnswerSchema.safeParse({ answer: "no", reason: "tooFar" }).success).toBe(true);
    expect(PreferenceAnswerSchema.safeParse({ answer: "yes", reason: "Trop loin" }).success).toBe(false);
    expect(PreferenceAnswerSchema.safeParse({ answer: "peut-être" }).success).toBe(false);
  });
});
