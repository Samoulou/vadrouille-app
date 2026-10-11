// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createLocalDeckActions } from "./actions";

const dislike = (proposalId: string, category: "museum" | "nature" | "restaurant", kind: "activity" | "meal" = "activity") => ({
  proposalId,
  kind,
  category,
  decision: "dislike" as const,
});

describe("préférences: aucune généralisation sans réponse", () => {
  it("fermer sans répondre n'enregistre rien et un troisième refus ne rouvre pas la question", async () => {
    const actions = createLocalDeckActions();
    expect((await actions.decide(dislike("m1", "museum"))).prompt).toBeNull();
    expect((await actions.decide(dislike("m2", "museum"))).prompt).toEqual({ kind: "category", category: "museum" });
    // Échap : aucun appel à answerPrompt.
    expect((await actions.decide(dislike("m3", "museum"))).prompt).toBeNull();
    expect(actions.session().dislikes.every((d) => d.reason === undefined)).toBe(true);
  });

  it("deux refus nature puis un refus museum ne la déclenchent pas pour museum", async () => {
    const actions = createLocalDeckActions();
    await actions.decide(dislike("n1", "nature"));
    expect((await actions.decide(dislike("n2", "nature"))).prompt).toEqual({ kind: "category", category: "nature" });
    expect((await actions.decide(dislike("m1", "museum"))).prompt).toBeNull();
  });

  it("deux « Option suivante » ne la déclenchent jamais", async () => {
    const actions = createLocalDeckActions();
    expect((await actions.decide(dislike("d1", "restaurant", "meal"))).prompt).toBeNull();
    expect((await actions.decide(dislike("d2", "restaurant", "meal"))).prompt).toBeNull();
    expect((await actions.decide(dislike("d3", "restaurant", "meal"))).prompt).toBeNull();
  });
});

describe("actions locales : distance et annulation", () => {
  it("presentation: question de distance après deux feuilles répondues « Trop loin », une seule fois", async () => {
    const actions = createLocalDeckActions();
    await actions.decide(dislike("n1", "nature"));
    const nature = (await actions.decide(dislike("n2", "nature"))).prompt!;
    expect((await actions.answerPrompt(nature, { answer: "no", reason: "tooFar" })).next).toBeNull();
    await actions.decide(dislike("m1", "museum"));
    const museum = (await actions.decide(dislike("m2", "museum"))).prompt!;
    expect((await actions.answerPrompt(museum, { answer: "yes", reason: "tooFar" })).next).toEqual({ kind: "distance" });
    expect((await actions.answerPrompt({ kind: "distance" }, { answer: "yes" })).next).toBeNull();
  });

  it("annuler la décision déclenchante restaure la session exacte (question, raison, distance)", async () => {
    const actions = createLocalDeckActions();
    await actions.decide(dislike("m1", "museum"));
    const before = actions.session();
    const prompt = (await actions.decide(dislike("m2", "museum"))).prompt!;
    await actions.answerPrompt(prompt, { answer: "yes", reason: "tooExpensive" });
    await actions.undo({ proposalId: "m2" });
    expect(actions.session()).toEqual(before);
    expect((await actions.decide(dislike("m2", "museum"))).prompt).toEqual(prompt);
  });

  it("n'annule que la dernière décision", async () => {
    const actions = createLocalDeckActions();
    await actions.decide(dislike("m1", "museum"));
    const after = actions.session();
    await actions.undo({ proposalId: "autre" });
    expect(actions.session()).toBe(after);
  });
});
