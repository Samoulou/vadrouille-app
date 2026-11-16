// @vitest-environment node
import { describe, expect, it } from "vitest";

import { RetainedPreferenceSchema, type Category } from "@/contracts";

import { candidatsDeGouts, type ReglesDeGouts, type SignalDeGout } from "./gouts";

/**
 * Candidats de goûts (M8c-1, ticket 1121 ; spécification M8 § 5.1 et § 6.5 critère 1 ; décision 0160 § 1.7 et § 1.8).
 * Fonction pure : trois champs par signal, aucune autre entrée.
 */

const REGLES: ReglesDeGouts = { seuilDeduit: 3, distance: true };

const signal = (nom: SignalDeGout["signal"], category: Category | null, status: SignalDeGout["status"] = "confirmed"): SignalDeGout => ({ signal: nom, category, status });
const fois = (n: number, s: SignalDeGout) => Array.from({ length: n }, () => s);

describe("candidatsDeGouts (critère 1)", () => {
  it("answerYes actif : « éviter », confirmé", () => {
    expect(candidatsDeGouts([signal("answerYes", "museum")], REGLES)).toEqual([
      { id: "category:museum:less", origin: "confirmed", subject: { kind: "category", category: "museum", direction: "less" } },
    ]);
  });

  it("trois like ou choose actifs d'une catégorie : « aimer », déduit ; deux : rien", () => {
    expect(candidatsDeGouts([...fois(2, signal("like", "tasting")), signal("choose", "tasting")], REGLES)).toEqual([
      { id: "category:tasting:more", origin: "inferred", subject: { kind: "category", category: "tasting", direction: "more" } },
    ]);
    expect(candidatsDeGouts(fois(2, signal("like", "tasting")), REGLES)).toEqual([]);
    // Trois « J'aime » répartis sur deux catégories : aucune n'atteint le seuil.
    expect(candidatsDeGouts([...fois(2, signal("like", "tasting")), signal("like", "market")], REGLES)).toEqual([]);
  });

  it("un signal annulé ne compte pas (ni pour « aimer », ni pour « éviter », ni pour la distance)", () => {
    expect(candidatsDeGouts([...fois(2, signal("like", "nature")), signal("like", "nature", "cancelled")], REGLES)).toEqual([]);
    expect(candidatsDeGouts([signal("answerYes", "museum", "cancelled")], REGLES)).toEqual([]);
    expect(candidatsDeGouts([signal("travelReduction", null, "cancelled")], REGLES)).toEqual([]);
  });

  it("« aimer » et « éviter » de la même catégorie : seul « éviter »", () => {
    const candidats = candidatsDeGouts([...fois(3, signal("like", "museum")), signal("answerYes", "museum")], REGLES);
    expect(candidats.map((c) => c.id)).toEqual(["category:museum:less"]);
  });

  it("les refus, « Option suivante » et answerNo ne font aucun candidat", () => {
    const signaux = [...fois(4, signal("dislike", "walk")), ...fois(4, signal("nextOption", "restaurant")), signal("answerNo", "walk")];
    expect(candidatsDeGouts(signaux, REGLES)).toEqual([]);
  });

  it("travelReduction actif : « distance », confirmé, seulement si la règle l'admet (0160 § 1.7)", () => {
    const signaux = [signal("travelReduction", null)];
    expect(candidatsDeGouts(signaux, REGLES)).toEqual([{ id: "distance", origin: "confirmed", subject: { kind: "distance" } }]);
    expect(candidatsDeGouts(signaux, { ...REGLES, distance: false })).toEqual([]);
  });

  it("le seuil vient de la configuration", () => {
    expect(candidatsDeGouts(fois(2, signal("like", "walk")), { ...REGLES, seuilDeduit: 2 }).map((c) => c.id)).toEqual(["category:walk:more"]);
  });

  it("sortie triée par preferenceKey, sans doublon, valide au schéma strict", () => {
    const signaux = [
      signal("travelReduction", null),
      ...fois(3, signal("like", "walk")),
      signal("answerYes", "nature"),
      signal("answerYes", "nature"),
      ...fois(3, signal("choose", "restaurant")),
      signal("answerYes", "museum"),
    ];
    const candidats = candidatsDeGouts(signaux, REGLES);
    expect(candidats.map((c) => c.id)).toEqual(["category:museum:less", "category:nature:less", "category:restaurant:more", "category:walk:more", "distance"]);
    for (const candidat of candidats) expect(RetainedPreferenceSchema.safeParse(candidat).success).toBe(true);
  });

  it("aucun signal : aucun candidat", () => {
    expect(candidatsDeGouts([], REGLES)).toEqual([]);
  });
});
