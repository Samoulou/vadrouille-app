// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Category, PreferenceSignal } from "@/contracts";

import {
  compteursDuTri,
  estDerniereOption,
  ordreDuPaquet,
  paquetDeReprise,
  questionApres,
  questionDeDistance,
  type CarteTriable,
  type SignalLu,
} from "./preferences";

/**
 * Règles pures du tri (spécification B10, B10a point 1 ; décision 0112 § 2). Les cas « règle pure » de F6 (question au
 * deuxième refus, distance) viennent de `src/features/presentation/deck.test.ts`, réécrits sur les fonctions de
 * `@/domain/preferences` qui remplacent `preferencePromptFor` et `distancePromptFor` (0112 § 2 point 1) ; aucun cas
 * n'est retiré.
 */

const activite = (id: string, category: Category, day = 1, time = "10:00"): CarteTriable => ({ id, kind: "activity", category, day, time, stop: { locked: false } });
const repas = (id: string, index: number, day = 1, time = "12:30"): CarteTriable => ({
  id,
  kind: "meal",
  category: "restaurant",
  day,
  time,
  option: { index },
  stop: { locked: false },
});

const decision = (signal: SignalLu["signal"], proposalId: string, category: Category, kind: "activity" | "meal" = "activity", status: PreferenceSignal["status"] = "confirmed"): SignalLu => ({
  signal,
  kind,
  category,
  origin: "gesture",
  status,
  proposalId,
});
const oui = (category: Category, status: PreferenceSignal["status"] = "confirmed"): PreferenceSignal => ({ signal: "answerYes", category, origin: "question", status });

describe("préférences: aucune généralisation sans réponse (règle pure)", () => {
  const museum = (id: string) => decision("dislike", id, "museum");

  it("question au deuxième refus d'une même catégorie, une seule fois", () => {
    const un = [museum("a")];
    expect(questionApres(un, [], museum("a"))).toBeNull();
    const deux = [...un, museum("b")];
    expect(questionApres(deux, [], museum("b"))).toEqual({ kind: "category", category: "museum" });
    expect(questionApres(deux, [{ kind: "category", category: "museum" }], museum("b"))).toBeNull();
    // Troisième refus, question déjà posée : rien.
    expect(questionApres([...deux, museum("c")], [{ kind: "category", category: "museum" }], museum("c"))).toBeNull();
  });

  it("les repas et les « J'aime » ne comptent pas ; deux nature puis un museum ne la déclenchent pas pour museum", () => {
    const signaux = [decision("dislike", "n1", "nature"), decision("dislike", "n2", "nature"), museum("m1")];
    expect(questionApres(signaux, [{ kind: "category", category: "nature" }], museum("m1"))).toBeNull();
    const deuxRepas = [decision("dislike", "r1", "restaurant", "meal"), decision("dislike", "r2", "restaurant", "meal")];
    expect(questionApres(deuxRepas, [], deuxRepas[1]!)).toBeNull();
    const deuxOptions = [decision("nextOption", "r1", "restaurant", "meal"), decision("nextOption", "r2", "restaurant", "meal")];
    expect(questionApres(deuxOptions, [], deuxOptions[1]!)).toBeNull();
    expect(questionApres([museum("a"), decision("like", "b", "museum")], [], decision("like", "b", "museum"))).toBeNull();
  });

  it("un refus annulé ne compte pas", () => {
    const signaux = [decision("dislike", "a", "museum", "activity", "cancelled"), museum("b")];
    expect(questionApres(signaux, [], museum("b"))).toBeNull();
  });

  it("distance après deux raisons « Trop loin », une seule fois", () => {
    expect(questionDeDistance(["tooFar", "tooFar"], [])).toEqual({ kind: "distance" });
    expect(questionDeDistance(["tooFar", "tooFar"], [{ kind: "distance" }])).toBeNull();
    expect(questionDeDistance(["tooFar", undefined, "other"], [])).toBeNull();
  });
});

describe("présentation: paquet de reprise (règle pure, B10-PO-4)", () => {
  const cartes = [activite("m1", "museum"), activite("m2", "museum", 1, "15:00"), activite("n1", "nature", 2), repas("r1", 1), repas("r2", 2), repas("r3", 3)];
  const sansClos = { closes: new Set<string>() };
  const ids = (liste: readonly CarteTriable[]) => liste.map((c) => c.id);

  it("ordre de F6-PO-1, sans carte verrouillée", () => {
    expect(ids(ordreDuPaquet(cartes))).toEqual(["m1", "r1", "r2", "r3", "m2", "n1"]);
    expect(ids(ordreDuPaquet([...cartes, { ...activite("v", "walk"), stop: { locked: true } }]))).not.toContain("v");
  });

  it("sans les cartes décidées ni les activités d'une catégorie arrêtée", () => {
    const signaux = [decision("dislike", "m1", "museum"), oui("museum")];
    expect(ids(paquetDeReprise(cartes, signaux, sansClos))).toEqual(["r1", "r2", "r3", "n1"]);
    // « Oui » annulé : la catégorie redevient présentée.
    expect(ids(paquetDeReprise(cartes, [decision("dislike", "m1", "museum"), oui("museum", "cancelled")], sansClos))).toContain("m2");
  });

  it("un repas choisi ne repropose pas ses autres options ; « Option suivante » montre l'option suivante", () => {
    expect(ids(paquetDeReprise(cartes, [decision("nextOption", "r1", "restaurant", "meal"), decision("choose", "r2", "restaurant", "meal")], sansClos))).toEqual(["m1", "m2", "n1"]);
    expect(ids(paquetDeReprise(cartes, [decision("nextOption", "r1", "restaurant", "meal"), decision("nextOption", "r2", "restaurant", "meal"), decision("dislike", "r3", "restaurant", "meal")], sansClos))).toEqual([
      "m1",
      "m2",
      "n1",
    ]);
    expect(ids(paquetDeReprise(cartes, [decision("nextOption", "r1", "restaurant", "meal")], sansClos))).toEqual(["m1", "r2", "r3", "m2", "n1"]);
    expect(ids(paquetDeReprise(cartes, [decision("nextOption", "r1", "restaurant", "meal"), decision("choose", "r2", "restaurant", "meal", "cancelled")], sansClos))).toEqual([
      "m1",
      "r2",
      "r3",
      "m2",
      "n1",
    ]);
  });

  it("un tri clos ne présente plus ses cartes ; compteurs du tri ouvert", () => {
    expect(paquetDeReprise(cartes, [], { closes: new Set(ids(cartes)) })).toEqual([]);
    expect(compteursDuTri(cartes, [decision("like", "m1", "museum"), decision("dislike", "n1", "nature")], sansClos)).toEqual({ decided: 2, remaining: 4 });
    expect(compteursDuTri(cartes, [decision("like", "m1", "museum")], { closes: new Set(ids(cartes)) })).toEqual({ decided: 0, remaining: 0 });
  });

  it("dernière option d'un créneau", () => {
    const paquet = ordreDuPaquet(cartes);
    expect(estDerniereOption(cartes[5]!, paquet)).toBe(true);
    expect(estDerniereOption(cartes[3]!, paquet)).toBe(false);
    expect(estDerniereOption(cartes[0]!, paquet)).toBe(false);
    // Options suivantes retirées du paquet (« Je choisis » ailleurs, carte verrouillée) : l'option restante est la dernière.
    expect(estDerniereOption(cartes[4]!, paquet.filter((c) => c.id !== "r3"))).toBe(true);
    // Carte absente du paquet : jamais la dernière option.
    expect(estDerniereOption(cartes[5]!, paquet.filter((c) => c.id !== "r3"))).toBe(false);
  });
});
